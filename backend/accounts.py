import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from settings import settings
from runner_plan import RunnerPlan

COOKIE = "garmin_session"
SESSION_TTL = timedelta(days=7)


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


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


def check_origin(request):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
        if urlsplit(origin).netloc != request.headers.get("host") and origin != settings.app_origin:
            raise HTTPException(403, "Запрос с другого сайта.")


def account_routes(database, verify_key):
    router = APIRouter(prefix="/api/account")

    def current(request):
        token = request.cookies.get(COOKIE)
        row = database.session_user(token_digest(token), datetime.now(timezone.utc).isoformat()) if token else None
        if not row:
            raise HTTPException(401, "Войди в аккаунт.")
        return row

    def start_session(request, response, user_id, email):
        old_token = request.cookies.get(COOKIE)
        if old_token:
            database.delete_session(token_digest(old_token))
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + SESSION_TTL
        database.create_session(user_id, token_digest(token), expires.isoformat())
        response.set_cookie(COOKIE, token, httponly=True, samesite="lax",
                            secure=settings.app_origin.startswith("https://") or request.url.scheme == "https",
                            max_age=int(SESSION_TTL.total_seconds()))
        return {"id": user_id, "email": email}

    @router.post("/register")
    def register(body: Credentials, request: Request, response: Response):
        email = body.email.lower()
        salt = secrets.token_bytes(16)
        user_id = database.register_user(email, salt.hex() + ":" + password_digest(body.password, salt))
        if user_id is None:
            raise HTTPException(409, "Аккаунт с таким email уже существует.")
        return start_session(request, response, user_id, email)

    @router.post("/login")
    def login(body: Credentials, request: Request, response: Response):
        email = body.email.lower()
        row = database.find_user(email)
        salt, expected = row[1].split(":") if row else ("00" * 16, "00" * 64)
        verified = hmac.compare_digest(password_digest(body.password, bytes.fromhex(salt)), expected)
        if not row or not verified:
            raise HTTPException(401, "Неверный email или пароль.")
        return start_session(request, response, row[0], email)

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
        return {"id": user_id, "email": email, "garmin": bool(garmin), "ai": bool(ai)}

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

    return router, current
