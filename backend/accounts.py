import hashlib
import hmac
import secrets
from time import time
from datetime import datetime, timedelta, timezone
from typing import Literal

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response
from pydantic import BaseModel, EmailStr, Field

from password_reset import RECOVERY_OWNER_EMAIL, RESET_TTL_SECONDS, reset_origin, send_reset_email
from settings import settings
from runner_plan import RunnerPlan
from weather import add_weather_routes

COOKIE = "garmin_session"
SESSION_TTL = timedelta(days=7)


class EmailInput(BaseModel):
    email: EmailStr


class PasswordInput(BaseModel):
    password: str = Field(min_length=10, max_length=128)


class Credentials(EmailInput, PasswordInput):
    pass


class ResetPassword(PasswordInput):
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class KeyInput(BaseModel):
    value: str | None = Field(default=None, max_length=4096)


def password_digest(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1, maxmem=64 * 1024 * 1024).hex()


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def cipher():
    try:
        return Fernet(settings.secrets_encryption_key.encode())
    except ValueError:
        raise HTTPException(503, "Настрой SECRETS_ENCRYPTION_KEY на сервере.") from None


def decrypt(value):
    if value is None:
        return ""
    try:
        return cipher().decrypt(value.encode()).decode()
    except InvalidToken:
        raise HTTPException(503, "Не удалось расшифровать сохранённый ключ.") from None


def account_routes(database, verify_key):
    router = APIRouter(prefix="/api/account")

    def current(request):
        token = request.cookies.get(COOKIE)
        row = database.session_user(token_digest(token), datetime.now(timezone.utc).isoformat()) if token else None
        if not row:
            raise HTTPException(401, "Войди в аккаунт.")
        return row

    def start_session(request, response, user_id, email, *, verified_password_hash=None):
        old_token = request.cookies.get(COOKIE)
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + SESSION_TTL
        if not database.create_session(
            user_id, token_digest(token), expires.isoformat(), verified_password_hash=verified_password_hash,
        ):
            raise HTTPException(401, "Пароль изменился. Войди с новым паролем.")
        if old_token:
            database.delete_session(token_digest(old_token))
        response.set_cookie(COOKIE, token, httponly=True, samesite="lax",
                            secure=settings.app_origin.startswith("https://") or request.url.scheme == "https",
                            max_age=int(SESSION_TTL.total_seconds()))
        return {"id": user_id, "email": email}

    def limit_attempts(action: str, email: str, limit: int) -> None:
        retry_after = database.consume_auth_attempt(
            f"{action}:{token_digest(email)}", now=int(time()), window=600, limit=limit,
        )
        if retry_after:
            minutes = (retry_after + 59) // 60
            raise HTTPException(
                429,
                f"Слишком много попыток. Повтори через {minutes} мин.",
                headers={"Retry-After": str(retry_after)},
            )

    @router.post("/register")
    def register(body: Credentials, request: Request, response: Response):
        email = body.email.lower()
        limit_attempts("register", email, 3)
        salt = secrets.token_bytes(16)
        user_id = database.register_user(email, salt.hex() + ":" + password_digest(body.password, salt))
        if user_id is None:
            raise HTTPException(409, "Аккаунт с таким email уже существует.")
        return start_session(request, response, user_id, email)

    @router.post("/login")
    def login(body: Credentials, request: Request, response: Response):
        email = body.email.lower()
        limit_attempts("login", email, 8)
        row = database.find_user(email)
        salt, expected = row[1].split(":") if row else ("00" * 16, "00" * 64)
        verified = hmac.compare_digest(password_digest(body.password, bytes.fromhex(salt)), expected)
        if not row or not verified:
            raise HTTPException(401, "Неверный email или пароль.")
        return start_session(request, response, row[0], email, verified_password_hash=row[1])

    def issue_reset_link(user_id: str, origin: str) -> str:
        token = secrets.token_urlsafe(32)
        now = int(time())
        database.create_password_reset(user_id, token_digest(token), now, now + RESET_TTL_SECONDS)
        return f"{origin}/#reset-password={token}"

    def require_recovery_owner(request: Request) -> str:
        user_id, email = current(request)
        if email != RECOVERY_OWNER_EMAIL or not database.is_recovery_owner(user_id):
            raise HTTPException(403, "Раздел доступен только подтверждённому администратору.")
        return email

    @router.get("/users")
    def list_accounts(request: Request, after: str = Query(default="", max_length=254)):
        require_recovery_owner(request)
        emails = database.list_user_emails(after=after, limit=51)
        return {
            "emails": [email for email in emails[:50] if email != RECOVERY_OWNER_EMAIL],
            "next_after": emails[49] if len(emails) > 50 else None,
        }

    @router.post("/users/reset-link")
    def issue_manual_reset(body: EmailInput, request: Request):
        owner_email = require_recovery_owner(request)
        email = body.email.lower()
        if email == owner_email:
            raise HTTPException(400, "Для своего аккаунта используй восстановление по почте.")
        origin = reset_origin(require_mail=False)
        if not origin:
            raise HTTPException(503, "Укажи адрес дашборда в APP_ORIGIN.")
        limit_attempts("manual-password-reset", owner_email, 5)
        target = database.find_user(email)
        if not target:
            raise HTTPException(404, "Пользователь не найден.")
        return {"link": issue_reset_link(target[0], origin)}

    @router.post("/forgot-password", status_code=202)
    def forgot_password(body: EmailInput, background: BackgroundTasks):
        origin = reset_origin()
        if not origin:
            raise HTTPException(503, "Отправка писем для восстановления пока не настроена.")
        email = body.email.lower()
        limit_attempts("password-reset", email, 3)
        user = database.find_user(email)
        if user:
            background.add_task(send_reset_email, email, issue_reset_link(user[0], origin))
        return {"ok": True}

    @router.post("/reset-password")
    def change_password(body: ResetPassword, response: Response):
        token_hash = token_digest(body.token)
        user_id = database.password_reset_user(token_hash, int(time()))
        if user_id:
            salt = secrets.token_bytes(16)
            new_hash = salt.hex() + ":" + password_digest(body.password, salt)
            if database.reset_password(
                user_id, token_hash, int(time()), new_hash, owner_email=RECOVERY_OWNER_EMAIL,
            ):
                response.delete_cookie(COOKIE)
                return {"ok": True}
        raise HTTPException(400, "Ссылка недействительна или уже использована. Запроси новое письмо.")

    @router.post("/logout")
    def logout(request: Request, response: Response):
        token = request.cookies.get(COOKIE)
        if token:
            database.delete_session(token_digest(token))
        response.delete_cookie(COOKIE)
        return {"ok": True}

    @router.get("")
    def status(request: Request):
        user_id, email = current(request)
        garmin, ai = database.keys(user_id)
        recovery_admin = None
        if email == RECOVERY_OWNER_EMAIL:
            recovery_admin = "active" if database.is_recovery_owner(user_id) else "verify"
        return {
            "id": user_id, "email": email, "garmin": bool(garmin), "ai": bool(ai),
            "recovery_admin": recovery_admin,
        }

    @router.get("/plan", response_model=RunnerPlan)
    def get_plan(request: Request):
        user_id, _ = current(request)
        return database.read(user_id).get("runner_plan", {})

    @router.put("/plan", response_model=RunnerPlan)
    def save_plan(body: RunnerPlan, request: Request):
        user_id, _ = current(request)
        plan = body.model_dump(mode="json")

        def update(store):
            if plan != store.get("runner_plan"):
                store["runner_plan"] = plan
                store.pop("coach_daily", None)
                store.pop("training_week_draft", None)

        database.update(user_id, update)
        return body

    @router.put("/keys/{provider}")
    def save(provider: Literal["garmin", "ai"], body: KeyInput, request: Request):
        user_id, _ = current(request)
        value = body.value.strip() if body.value else ""
        encrypted = cipher().encrypt(value.encode()).decode() if value else None
        database.save_key(user_id, provider, encrypted)
        return {"configured": bool(value)}

    @router.post("/keys/{provider}/check")
    async def check(provider: Literal["garmin", "ai"], request: Request):
        user_id, _ = current(request)
        value = decrypt(database.keys(user_id)[0 if provider == "garmin" else 1])
        if not value:
            raise HTTPException(409, "Сначала сохрани ключ.")
        await verify_key(provider, value)
        return {"ok": True}

    add_weather_routes(router, database, current)
    return router, current
