from __future__ import annotations

import logging
from contextvars import ContextVar
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from accounts import account_routes, decrypt
from coach import RunningCoach
from coach_plan_dialog import TRAINING_TABLE, confirmed_plan_reply, is_plan_request, plan_move_reply
from coach_context import activities_between, daily_coach_context, is_running, strength_summary, wellness_between
from coach_history import chat_history_page
from coach_tools import GarminCoachTools
from dashboard_data import build_dashboard, dashboard_weekly_volume, merge_activities, monday_of, parse_date
from providers.gigachat import GigaChatClient
from providers.gigachat import GigaChatError
from request_security import check_origin, validation_error
from settings import settings
from runner_plan import plan_context
from store import Database
from strength_notes import StrengthNote, get_strength_note, refresh_strength_activity, store_strength_note, strength_activity
from training_week import (
    WeekPreferences, build_week_draft, change_week_distance, include_calendar_sessions,
    move_week_session, save_calendar_session, week_context, week_progress,
)

database = Database(settings.database_url, settings.sqlite_path)
logger = logging.getLogger(__name__)
COACH_CONTEXT_VERSION = 9
COACH_CHAT_TURNS = 60


account_id: ContextVar[str] = ContextVar("account_id")


def read_store() -> dict[str, Any]:
    return database.read(account_id.get())


def update_store(update: Callable[[dict[str, Any]], None]) -> None:
    database.update(account_id.get(), update)


def personal_coach() -> RunningCoach:
    return RunningCoach(decrypt(database.keys(account_id.get())[1]))


def account_coach_tools(store: dict[str, Any]) -> GarminCoachTools:
    user_id = account_id.get()
    return GarminCoachTools(
        store,
        read_detail=lambda activity_id: database.read_activity_detail(user_id, activity_id),
        garmin_key=lambda: decrypt(database.keys(user_id)[0]),
    )


def account_dashboard(days: int) -> dict[str, Any]:
    configured = bool(database.keys(account_id.get())[0])
    return build_dashboard(days, read_store(), configured=configured)


def call_garmin_in_process(method: str, key: str, cache_path: Path, *args):
    from garmin_api import (
        get_activities,
        get_activity_metadata,
        get_running_activity_detail,
        get_running_activity_splits,
        get_wellness_metrics,
    )

    if method == "activities":
        start, end = args
        rows = []
        for offset in range(0, 5000, 100):
            page = get_activities(
                start.isoformat(), end.isoformat(), offset, 100, key=key, cache_path=cache_path
            )
            rows.extend(page)
            if len(page) < 100:
                break
        return rows
    if method == "wellness_metrics":
        start, end = args
        return get_wellness_metrics(start.isoformat(), end.isoformat(), key=key, cache_path=cache_path)
    tool = {
        "activity_detail": get_running_activity_detail,
        "activity_splits": get_running_activity_splits,
        "activity_metadata": get_activity_metadata,
    }[method]
    return tool(str(args[0]), key=key, cache_path=cache_path)


async def garmin_call(method: str, *args, key: str | None = None):
    if key is None:
        key = decrypt(database.keys(account_id.get())[0])
    if not key:
        raise HTTPException(409, "Добавь ключ Garmin в настройках аккаунта.")
    with TemporaryDirectory(prefix="garmin-") as directory:
        cache_path = Path(directory) / "token.json"
        return await run_in_threadpool(call_garmin_in_process, method, key, cache_path, *args)


async def verify_key(provider: str, key: str) -> None:
    try:
        if provider == "garmin":
            today = date.today()
            await garmin_call("activities", today, today, key=key)
        else:
            await run_in_threadpool(GigaChatClient(key).check_credentials)
    except Exception as exc:
        status = getattr(exc, "status_code", None)
        logger.warning("Provider key check failed: provider=%s status=%s type=%s", provider, status, type(exc).__name__)
        name = "Garmin" if provider == "garmin" else "GigaChat"
        if getattr(exc, "code", None) == "ca_bundle_missing":
            detail = "GigaChat: на сервере не найден настроенный сертификат."
        elif status in (400, 401, 403):
            detail = f"{name} отклонил запрос ({status}). Проверь ключ и права доступа."
        elif status == 429:
            detail = f"{name} временно ограничил запросы (429)."
        elif status:
            detail = f"{name} вернул ошибку HTTP {status}."
        else:
            detail = f"Сервер не смог завершить проверку {name}. Подробности в логах backend."
        raise HTTPException(502, detail) from None


app = FastAPI(title="Garmin Running Dashboard")
accounts, current_account = account_routes(database, verify_key)
app.include_router(accounts)
app.add_exception_handler(RequestValidationError, validation_error)


@app.middleware("http")
async def protect_dashboard(request: Request, call_next):
    path = request.url.path.rstrip("/")
    token = None
    try:
        check_origin(request)
        if path.startswith("/api/") and not (
            path == "/api/health" or path == "/api/account" or path.startswith("/api/account/")
        ):
            user_id, _ = await run_in_threadpool(current_account, request)
            token = account_id.set(user_id)
        response = await call_next(request)
    except HTTPException as exc:
        response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    finally:
        if token is not None:
            account_id.reset(token)
    if path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


class CoachPeriodRequest(BaseModel):
    daily: bool = False
    focus_date: date | None = None
    start_date: date
    end_date: date
    previous_start_date: date | None = None
    previous_end_date: date | None = None


class CoachChatRequest(CoachPeriodRequest):
    question: str = Field(min_length=1, max_length=1200)
    summary: str | None = Field(default=None, max_length=1200)
    today: date | None = None


def analyze_period(
    start: date,
    end: date,
    previous_start: date | None = None,
    previous_end: date | None = None,
    question: str | None = None,
    daily: bool = False,
    focus_date: date | None = None,
    chat_summary: str | None = None,
    plan_day: date | None = None,
    store: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if end < start:
        raise HTTPException(status_code=422, detail="Конец периода раньше его начала.")
    running_coach = personal_coach()
    if not running_coach.enabled:
        raise HTTPException(status_code=409, detail="disabled")

    if not running_coach.configured:
        raise HTTPException(
            status_code=409,
            detail="Добавь ключ GigaChat в настройках аккаунта.",
        )

    if store is None:
        store = read_store()
    reference_day = (focus_date or start) if daily else date.today()
    if start <= reference_day < end:
        end = reference_day
        if previous_start and previous_end:
            previous_end = min(previous_end, previous_start + (end - start))

    rows = store.get("activities", [])
    selected = activities_between(rows, start, end)
    previous = activities_between(rows, previous_start, previous_end) if previous_start and previous_end else None
    tools = None
    conversation = []
    if question:
        tools = account_coach_tools(store)
        conversation = store.get("coach_chat_history", [])[-(4 if chat_summary else 6):]
        if chat_summary:
            conversation = [{"role": "assistant", "content": chat_summary}, *conversation]
    elif daily:
        day_key = reference_day.isoformat()
        conversation = [
            turn for turn in store.get("coach_chat_history", [])
            if turn.get("focus_date") == day_key
        ][-4:]

    activity_summary = {
        "strength": strength_summary(selected, include_details=True),
        "previous_strength": strength_summary(previous) if previous is not None else None,
        "last_sync_at": store.get("synced_at"),
    }
    calendar_sessions = store.get("calendar_training_sessions", {})
    activity_summary["recent_runner_feedback"] = sorted(
        (item for item in store.get("workout_reviews", {}).values() if item["date"] <= reference_day.isoformat()),
        key=lambda item: item["date"], reverse=True,
    )[:5]
    upcoming = [
        calendar_sessions[key]
        for key in sorted(calendar_sessions)
        if reference_day.isoformat() <= key <= (reference_day + timedelta(days=6)).isoformat()
    ]
    if upcoming:
        activity_summary["calendar_sessions_next_7_days"] = upcoming
    if start == end:
        confirmed_weeks = [store.get("training_week_active"), *reversed(store.get("training_week_history", []))]
        selected_session = next((
            session for plan in confirmed_weeks if plan
            for session in plan["sessions"] if session["date"] == start.isoformat()
        ), None)
        if selected_session is None:
            selected_session = calendar_sessions.get(start.isoformat())
        if selected_session:
            activity_summary["selected_day_plan"] = selected_session
    if question:
        month_start = reference_day.replace(day=1)
        month_rows = activities_between(rows, month_start, reference_day)
        activity_summary["current_month_strength"] = {
            "from": month_start.isoformat(),
            "to": reference_day.isoformat(),
            **strength_summary(month_rows, include_details=True),
        }

    try:
        result = running_coach.analyze(
            activities=[row for row in selected if is_running(row)],
            start_date=start,
            end_date=end,
            previous_activities=[row for row in previous if is_running(row)] if previous is not None else None,
            previous_start_date=previous_start,
            previous_end_date=previous_end,
            wellness=wellness_between(store.get("wellness_metrics", {}), start, end),
            activity_summary=activity_summary,
            question=question,
            conversation=conversation,
            daily_context=daily_coach_context(store, reference_day) if daily else None,
            runner_plan=plan_context(store.get("runner_plan"), reference_day),
            training_week=week_context(store.get("training_week_active"), rows, plan_day or reference_day),
            tools=tools,
        )
    except GigaChatError as exc:
        status_code = exc.status_code
        error_code = exc.code
        logger.warning(
            "Coach provider error: provider=%s status=%s code=%s",
            running_coach.provider_name,
            status_code,
            error_code,
        )

        if error_code == "ca_bundle_missing":
            detail = "Не найден сертификат GigaChat. Проверь путь GIGACHAT_CA_BUNDLE на сервере."
        elif status_code == 401:
            detail = "GigaChat отклонил ключ авторизации. Проверь ключ в настройках аккаунта и scope сервера."
        elif status_code == 403:
            detail = "GigaChat запретил запрос (403). Проверь права проекта и выбранный scope."
        elif status_code == 404:
            detail = f"GigaChat не нашёл модель {running_coach.model}. Проверь GIGACHAT_MODEL в .env."
        elif status_code == 429:
            detail = "GigaChat ограничил запросы или исчерпана доступная квота. Проверь лимиты проекта."
        elif status_code == 422:
            detail = "GigaChat отклонил формат запроса (422). Проверь модель и параметры запроса."
        elif isinstance(status_code, int) and status_code >= 500:
            detail = f"GigaChat временно вернул ошибку сервера ({status_code}). Попробуй позже."
        elif status_code is None:
            detail = "Backend не смог соединиться с GigaChat. Проверь интернет, DNS и сертификаты Минцифры."
        else:
            detail = f"GigaChat API вернул ошибку ({status_code})."

        if error_code:
            detail += f" Код: {error_code}."
        raise HTTPException(
            status_code=429 if status_code == 429 else 502,
            detail=detail,
        ) from None
    return result


@app.get("/api/health")
def health() -> dict[str, str]:
    try:
        database.ensure_ready()
        with database.transaction() as connection:
            connection.execute("SELECT 1")
    except Exception as exc:
        logger.error("Database health check failed: %s", type(exc).__name__)
        raise HTTPException(503, "База данных недоступна. Проверь DATABASE_URL.") from None
    return {
        "status": "ok",
        "database": "postgresql" if database.is_postgres else "sqlite",
        "model": settings.gigachat_model,
    }


@app.get("/api/coach/status")
def coach_status() -> dict[str, Any]:
    running_coach = personal_coach()
    return {
        "enabled": running_coach.enabled,
        "configured": running_coach.configured,
        "model": running_coach.model,
        "provider": running_coach.provider_name,
    }


def daily_cache_key(day: date, start: date, end: date) -> str:
    return f"{day.isoformat()}:{start.isoformat()}:{end.isoformat()}"


def coach_cache_revision(store: dict[str, Any]) -> list:
    active_week = store.get("training_week_active") or {}
    return [store.get("synced_at"), store.get("wellness_synced_at"), store.get("runner_plan"),
            active_week.get("id"), active_week.get("revision", 0), store.get("deload_weeks"),
            store.get("calendar_plan_revision", 0), store.get("review_revision", 0)]


class WeekPlanRequest(BaseModel):
    day: date


class WorkoutReview(BaseModel):
    effort: str = Field(pattern="^(easy|normal|hard)$")
    note: str = Field(default="", max_length=280)


@app.get("/api/coach/review/{activity_id}")
def get_workout_review(activity_id: int) -> dict:
    return {"review": read_store().get("workout_reviews", {}).get(str(activity_id))}


@app.put("/api/coach/review/{activity_id}")
def save_workout_review(activity_id: int, request: WorkoutReview) -> dict:
    def save(store: dict) -> None:
        activity = next((row for row in store.get("activities", [])
                         if str(row.get("id")) == str(activity_id) and is_running(row)), None)
        if not activity:
            raise HTTPException(404, "Пробежка отсутствует в истории Garmin.")
        store.setdefault("workout_reviews", {})[str(activity_id)] = {
            "date": str(activity["start_time"])[:10], "effort": request.effort, "note": request.note.strip(),
        }
        store["review_revision"] = store.get("review_revision", 0) + 1
    update_store(save)
    return {"saved": True}


class WeekDraftRequest(WeekPlanRequest):
    preferences: WeekPreferences = Field(default_factory=WeekPreferences)


class WeekApprovalRequest(WeekPlanRequest):
    draft_id: str = Field(min_length=1, max_length=36)


class WeekEditRequest(WeekPlanRequest):
    plan_id: str = Field(min_length=1, max_length=36)
    revision: int = Field(ge=0)


class WeekMoveRequest(WeekEditRequest):
    from_date: date
    to_date: date


class WeekDistanceRequest(WeekEditRequest):
    session_date: date
    distance_km: float = Field(ge=0.1, allow_inf_nan=False)
    kind: str | None = Field(default=None, max_length=20)
    instruction: str | None = Field(default=None, max_length=500)


class CalendarSessionRequest(WeekPlanRequest):
    session_date: date
    kind: str = Field(max_length=20)
    distance_km: float = Field(ge=0.1, allow_inf_nan=False)
    instruction: str = Field(max_length=500)
    revision: int | None = Field(default=None, ge=0)


def validate_plan_day(day: date) -> None:
    if abs((date.today() - day).days) > 1:
        raise HTTPException(422, "Обнови страницу, чтобы выбрать текущую дату.")


def training_week_state(store: dict[str, Any], day: date) -> dict[str, Any]:
    activities = store.get("activities", [])
    active = store.get("training_week_active")
    draft = store.get("training_week_draft")
    if draft and draft["sessions"][0]["date"] < day.isoformat():
        draft = None
    progress = week_progress(active, activities, day) if active else None
    recap = None
    if progress and progress["sessions"][-1]["date"] <= day.isoformat():
        first, last = progress["sessions"][0]["date"], progress["sessions"][-1]["date"]
        reviews = [item for item in store.get("workout_reviews", {}).values() if first <= item["date"] <= last]
        recap = {
            "from": first, "to": last, "planned": progress["planned_km"], "actual": progress["actual_run_km"],
            "matched": progress["matched_sessions"], "sessions": progress["planned_sessions"],
            "hard": sum(item["effort"] == "hard" for item in reviews), "reviews": len(reviews),
        }
    return {
        "active": progress, "recap": recap,
        "draft": week_progress(include_calendar_sessions(draft, store.get("calendar_training_sessions", {})), [], day)
        if draft else None,
        "synced_at": store.get("synced_at"),
        "preferences": store.get("training_week_preferences"),
    }


@app.get("/api/coach/week")
def get_training_week(day: date) -> dict[str, Any]:
    validate_plan_day(day)
    return training_week_state(read_store(), day)


@app.post("/api/coach/week")
def propose_training_week(request: WeekDraftRequest) -> dict[str, Any]:
    day = request.day
    validate_plan_day(day)
    preferences = request.preferences.model_dump(mode="json")

    def save_draft(store: dict[str, Any]) -> None:
        state = training_week_state(store, day)
        if state["active"] and not state["recap"]:
            raise HTTPException(409, "Сначала заверши текущий план недели.")
        if state["draft"]:
            return
        try:
            draft = build_week_draft(
                store.get("activities", []), store.get("runner_plan") or {}, day, request.preferences, store.get("deload_weeks", {}),
                earliest_start=date.fromisoformat(state["recap"]["to"]) + timedelta(days=1) if state["recap"] else None,
            )
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from None

        store["training_week_preferences"] = preferences
        store["training_week_draft"] = {"id": uuid4().hex, **draft}

    update_store(save_draft)
    return training_week_state(read_store(), day)


@app.post("/api/coach/week/approve")
def approve_training_week(request: WeekApprovalRequest) -> dict[str, Any]:
    day = request.day
    validate_plan_day(day)

    def approve(current: dict[str, Any]) -> None:
        active = current.get("training_week_active")
        if active and active["id"] == request.draft_id:
            return
        state = training_week_state(current, day)
        if state["active"] and not state["active"]["expired"]:
            raise HTTPException(409, "Уже есть активный недельный план.")
        draft = current.get("training_week_draft")
        if not state["draft"] or draft["id"] != request.draft_id:
            raise HTTPException(409, "Черновик изменился или устарел. Сформируй новый план.")
        if active:
            current.setdefault("training_week_history", []).append(active)
        calendar_sessions = current.get("calendar_training_sessions", {})
        approved = include_calendar_sessions(current.pop("training_week_draft"), calendar_sessions)
        current["training_week_active"] = approved
        for session in approved["sessions"]:
            calendar_sessions.pop(session["date"], None)
        current.pop("coach_daily", None)

    update_store(approve)
    return training_week_state(read_store(), day)


def edit_training_week(request: WeekEditRequest, edit: Callable[[dict, list[dict]], dict]) -> dict[str, Any]:
    validate_plan_day(request.day)

    def save_edit(store: dict[str, Any]) -> None:
        active = store.get("training_week_active")
        if not active or active["id"] != request.plan_id or active.get("revision", 0) != request.revision:
            raise HTTPException(409, "План изменился. Открой его заново перед редактированием.")
        try:
            updated = edit(active, store.get("activities", []))
        except ValueError as error:
            raise HTTPException(409, str(error)) from None
        if updated is not active:
            store["training_week_active"] = updated
            store.pop("coach_daily", None)

    update_store(save_edit)
    return training_week_state(read_store(), request.day)


@app.post("/api/coach/week/move")
def move_training_week(request: WeekMoveRequest) -> dict[str, Any]:
    return edit_training_week(request, lambda plan, activities: move_week_session(
        plan, activities, request.day, request.from_date, request.to_date,
    ))


@app.patch("/api/coach/week/distance")
def change_training_week_distance(request: WeekDistanceRequest) -> dict[str, Any]:
    return edit_training_week(request, lambda plan, activities: change_week_distance(
        plan, activities, request.day, request.session_date, request.distance_km,
        kind=request.kind, instruction=request.instruction,
    ))


@app.post("/api/coach/week/calendar-session")
def save_training_calendar_session(request: CalendarSessionRequest) -> dict[str, Any]:
    validate_plan_day(request.day)
    result = {}

    def save(store: dict[str, Any]) -> None:
        try:
            in_week = save_calendar_session(
                store, request.day, request.session_date, request.kind,
                request.distance_km, request.instruction, request.revision,
            )
        except ValueError as error:
            raise HTTPException(409, str(error)) from None
        store.pop("coach_daily", None)
        if in_week:
            result["active"] = training_week_state(store, request.day)["active"]
        else:
            result["session"] = store["calendar_training_sessions"][request.session_date.isoformat()]

    update_store(save)
    return result


@app.delete("/api/coach/week")
def discard_training_week(day: date, draft_id: str = Query(min_length=1, max_length=36)) -> dict[str, Any]:
    validate_plan_day(day)

    def discard(store: dict[str, Any]) -> None:
        draft = store.get("training_week_draft")
        if draft and draft["id"] == draft_id:
            store.pop("training_week_draft")

    update_store(discard)
    return training_week_state(read_store(), day)


@app.get("/api/coach/daily")
def saved_daily_summary(day: date, start_date: date | None = None, end_date: date | None = None):
    if not database.keys(account_id.get())[1]:
        raise HTTPException(409, "Добавь ключ GigaChat в настройках аккаунта.")
    store = read_store()
    key = daily_cache_key(day, start_date or day, end_date or day)
    saved = store.get("coach_daily", {}).get(key)
    if not saved or saved.get("context_version") != COACH_CONTEXT_VERSION:
        return None
    if saved.get("revision") != coach_cache_revision(store):
        return None
    return {key: saved[key] for key in ("answer", "model", "usage")}


@app.post("/api/coach/summary")
def coach_summary(request: CoachPeriodRequest) -> dict[str, Any]:
    revision = coach_cache_revision(read_store()) if request.daily else None
    result = analyze_period(
        request.start_date,
        request.end_date,
        request.previous_start_date,
        request.previous_end_date,
        daily=request.daily,
        focus_date=request.focus_date,
    )
    if request.daily:
        key = daily_cache_key(request.focus_date or request.start_date, request.start_date, request.end_date)

        def save_summary(store: dict[str, Any]) -> None:
            if coach_cache_revision(store) != revision:
                return
            entries = store.get("coach_daily", {})
            entries.pop(key, None)
            entries[key] = {**result, "context_version": COACH_CONTEXT_VERSION, "revision": revision}
            store["coach_daily"] = dict(list(entries.items())[-12:])

        update_store(save_summary)
    return result


@app.get("/api/coach/chat")
def coach_chat_history(day: date | None = None, before: date | None = None) -> dict[str, Any]:
    messages = read_store().get("coach_chat_history", [])[-COACH_CHAT_TURNS:]
    if day is None:
        return {"messages": messages}
    return chat_history_page(messages, day, before)


@app.post("/api/coach/chat")
def coach_chat(request: CoachChatRequest) -> dict[str, Any]:
    question = request.question.strip()
    if not question:
        raise HTTPException(422, "Напиши вопрос консультанту.")
    today = request.today or date.today()
    validate_plan_day(today)
    store = read_store()
    active_plan = store.get("training_week_active")
    activities = store.get("activities", [])

    move_reply = plan_move_reply(question, active_plan, activities, today)
    if move_reply is not None or is_plan_request(question):
        result = {
            **(move_reply or {"answer": confirmed_plan_reply(active_plan, activities, today)}),
            "model": "training-week",
            "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
        }
    else:
        result = analyze_period(
            request.start_date,
            request.end_date,
            request.previous_start_date,
            request.previous_end_date,
            question=question,
            daily=request.daily,
            focus_date=request.focus_date,
            chat_summary=request.summary,
            plan_day=today,
            store=store,
        )
        if TRAINING_TABLE.search(result["answer"]):
            result["answer"] = confirmed_plan_reply(active_plan, activities, today)

    focus_day = (request.focus_date or request.start_date).isoformat()
    exchange_dates = {"focus_date": focus_day, "sent_day": today.isoformat()}

    def save_turns(store: dict[str, Any]) -> None:
        history = store.get("coach_chat_history", [])
        history.extend([
            {"role": "user", "content": question, **exchange_dates},
            {"role": "assistant", "content": result["answer"], "usage": result["usage"], **exchange_dates},
        ])
        store["coach_chat_history"] = history[-COACH_CHAT_TURNS:]

    update_store(save_turns)
    return result


@app.get("/api/dashboard")
def dashboard(days: int = Query(default=90, ge=30, le=3650)) -> dict[str, Any]:
    return account_dashboard(days)


class WeekLabelRequest(BaseModel):
    week_start: date
    deload: bool


@app.put("/api/dashboard/week-label")
def update_week_label(request: WeekLabelRequest) -> dict[str, Any]:
    if request.week_start.weekday() != 0:
        raise HTTPException(422, "Дата начала недели должна быть понедельником.")

    key = request.week_start.isoformat()

    def update(store: dict[str, Any]) -> None:
        labels = store.setdefault("deload_weeks", {})
        if request.deload:
            labels[key] = True
        else:
            labels.pop(key, None)
        draft = store.get("training_week_draft")
        if draft and any(
            monday_of(date.fromisoformat(session["date"])) == request.week_start
            for session in draft["sessions"]
        ):
            store.pop("training_week_draft", None)
        store.pop("coach_daily", None)

    update_store(update)
    return {"week_start": key, "deload": request.deload}


@app.get("/api/dashboard/wellness")
def dashboard_wellness_day(day: date) -> dict[str, Any]:
    store = read_store()
    day_key = day.isoformat()
    metrics = {}
    for name in ("sleep", "stress", "hrv", "weight", "resting_hr", "vo2_max"):
        values = store.get("wellness_metrics", {}).get(name, [])
        points = [
            {"date": day_key, "value": row["value"]}
            for row in values
            if row.get("date") == day_key and row.get("value") is not None
        ]
        if points:
            metrics[name] = points
    return {"metrics": metrics, "synced_at": store.get("wellness_synced_at")}


@app.get("/api/activities/{activity_id}/strength-note")
def read_strength_note(activity_id: int) -> dict:
    return {"entry": get_strength_note(read_store(), activity_id)}


@app.put("/api/activities/{activity_id}/strength-note")
def save_strength_note(activity_id: int, entry: StrengthNote) -> dict:
    update_store(lambda store: store_strength_note(store, activity_id, entry))
    return {"entry": entry.model_dump()}


@app.post("/api/activities/{activity_id}/strength-refresh")
async def refresh_strength_from_garmin(activity_id: int) -> dict:
    strength_activity(read_store(), activity_id)
    try:
        fields = await garmin_call("activity_metadata", activity_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Garmin strength refresh failed: %s", type(exc).__name__)
        raise HTTPException(502, "Не удалось обновить силовую из Garmin. Попробуй ещё раз.") from None

    updated = {}

    def save(store: dict) -> None:
        updated.update(refresh_strength_activity(store, activity_id, fields))

    await run_in_threadpool(update_store, save)
    return {"activity": updated}


@app.get("/api/activities/{activity_id}/splits")
async def activity_splits(activity_id: int) -> dict[str, Any]:
    if activity_id <= 0:
        raise HTTPException(status_code=422, detail="Некорректный ID тренировки.")
    known_activity = any(
        str(activity.get("id")) == str(activity_id)
        for activity in read_store().get("activities", [])
    )
    if not known_activity:
        raise HTTPException(status_code=404, detail="Тренировка не найдена в Garmin.")

    try:
        splits = await garmin_call("activity_splits", activity_id)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Не удалось загрузить интервалы из Garmin. Попробуй ещё раз.",
        ) from None
    return {"activity_id": activity_id, "splits": splits}


@app.get("/api/activities/{activity_id}/detail")
@app.post("/api/activities/{activity_id}/detail")
async def activity_detail(
    activity_id: int, request: Request, only_if_missing: bool = False,
) -> dict[str, Any]:
    if activity_id <= 0:
        raise HTTPException(422, "Некорректный ID тренировки.")
    activity_key = str(activity_id)
    known_activity = next(
        (row for row in read_store().get("activities", []) if str(row.get("id")) == activity_key),
        None,
    )
    if known_activity is None:
        raise HTTPException(404, "Тренировка не найдена в истории.")

    user_id = account_id.get()
    if request.method == "GET" or only_if_missing:
        saved = await run_in_threadpool(database.read_activity_detail, user_id, activity_key)
        if request.method == "GET" or saved is not None:
            return {
                **(saved or {}),
                "activity_id": activity_id,
                "description": known_activity.get("description"),
                "details_saved": saved is not None,
            }

    try:
        detail = await garmin_call("activity_detail", activity_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Garmin activity detail failed: %s", type(exc).__name__)
        raise HTTPException(502, "Не удалось загрузить подробные данные тренировки из Garmin.") from None

    fields = detail.pop("activity", {})
    fields.pop("id", None)

    updated_activity = None
    weekly_volume = None

    def replace_activity(store: dict[str, Any]) -> None:
        nonlocal updated_activity, weekly_volume
        rows = store.get("activities", [])
        for index, previous in enumerate(rows):
            if str(previous.get("id")) == activity_key:
                updated_activity = {**previous, **fields}
                if updated_activity != previous:
                    rows[index] = updated_activity
                    rows.sort(key=lambda row: str(row.get("start_time") or ""), reverse=True)
                    store["review_revision"] = store.get("review_revision", 0) + 1
                    store.pop("coach_daily", None)
                    if any(updated_activity.get(field) != previous.get(field) for field in (
                        "distance_meters", "start_time", "type",
                    )):
                        today = date.today()
                        weekly_volume = dashboard_weekly_volume(rows, today, today - timedelta(days=3649))
                return
        raise HTTPException(404, "Тренировка больше не найдена в истории.")

    try:
        detail = await run_in_threadpool(database.update_activity_detail, user_id, activity_key, detail, replace_activity)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Activity refresh could not write to the database: %s", type(exc).__name__)
        raise HTTPException(503, "Не удалось сохранить обновлённую тренировку. Попробуй ещё раз.") from None
    return {
        "activity_id": activity_id,
        **detail,
        "details_saved": True,
        "activity": updated_activity,
        "description": updated_activity.get("description"),
        "weekly_volume": weekly_volume,
    }


def incremental_sync_start(
    today: date, earliest: date, covered_through: str | None, synced_at: str | None,
) -> date:
    last_day = parse_date(covered_through) or parse_date(synced_at)
    if last_day is None or last_day > today:
        return earliest
    return max(earliest, last_day)


@app.post("/api/sync")
async def sync_activities(days: int = Query(default=365, ge=30, le=3650)) -> dict[str, Any]:
    garmin_key = decrypt(database.keys(account_id.get())[0])
    if not garmin_key:
        raise HTTPException(status_code=409, detail="Добавь ключ Garmin в настройках аккаунта.")
    today = date.today()
    initial_store = read_store()
    earliest = today - timedelta(days=days - 1)
    activities_start = incremental_sync_start(
        today, earliest, initial_store.get("activities_synced_through"), initial_store.get("synced_at"),
    )
    try:
        activities = await garmin_call("activities", activities_start, today, key=garmin_key)
    except Exception as exc:
        reason = str(exc).lower()
        if "rate limit" in reason or "429" in reason:
            message = "Garmin временно ограничил запросы. Подожди и синхронизируй позже."
        elif "invalid key" in reason or "401" in reason:
            message = "Garmin не принял Personal API key. Проверь ключ в настройках аккаунта."
        else:
            message = "Не удалось получить данные Garmin. Проверь подключение и попробуй позже."
        raise HTTPException(status_code=502, detail=message) from None
    wellness_result: dict[str, Any] | None = None
    wellness_error = False
    try:
        wellness_earliest = max(earliest, today - timedelta(days=730))
        wellness_start = incremental_sync_start(
            today, wellness_earliest,
            initial_store.get("wellness_synced_through"), initial_store.get("wellness_synced_at"),
        )
        wellness_result = await garmin_call("wellness_metrics", wellness_start, today, key=garmin_key)
    except Exception:
        wellness_error = True

    sync_time = datetime.now(timezone.utc).isoformat()

    def merge_sync_result(store: dict[str, Any]) -> None:
        # Re-read under the cross-process lock after all network awaits.
        # A narrower sync adds/updates its range but never deletes older history.
        store["activities"] = merge_activities(
            store.get("activities", []), activities
        )
        store["synced_at"] = sync_time
        store["activities_synced_through"] = today.isoformat()

        if wellness_result is not None:
            current_metrics = store.get("wellness_metrics", {})
            new_metrics = wellness_result.get("metrics", {})
            merged_metrics: dict[str, list[dict[str, Any]]] = {}
            for name in ("sleep", "stress", "hrv", "vo2_max", "resting_hr", "weight"):
                by_date = {
                    row.get("date"): row
                    for row in current_metrics.get(name, [])
                    if row.get("date")
                }
                by_date.update({
                    row.get("date"): row
                    for row in new_metrics.get(name, [])
                    if row.get("date")
                })
                merged_metrics[name] = [by_date[day] for day in sorted(by_date)]
            store["wellness_metrics"] = merged_metrics
            store["wellness_errors"] = wellness_result.get("errors", {})
            if any(new_metrics.values()) or not wellness_result.get("errors"):
                store["wellness_synced_at"] = sync_time
                store["wellness_synced_through"] = today.isoformat()
        elif wellness_error:
            # Wellness is optional; keep the last successful records and timestamp.
            store["wellness_errors"] = {
                "general": "Не удалось синхронизировать показатели здоровья."
            }

    update_store(merge_sync_result)
    return account_dashboard(days)
