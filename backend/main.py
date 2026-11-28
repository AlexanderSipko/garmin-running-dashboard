from __future__ import annotations

import hashlib
import json
import logging
from calendar import monthrange
from contextvars import ContextVar
from pathlib import Path
from tempfile import TemporaryDirectory
from time import time
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from activity_retention import archive_expired_track, retention_cutoff
from accounts import account_routes, decrypt
from coach import RunningCoach
from weekly_heart_rate import running_zones_for_period, weekly_running_zones
from running_power import running_power_for_period
from coach_usage import TokenUsage, record_daily_usage
from coach_plan_dialog import TRAINING_TABLE, confirmed_plan_reply, is_plan_request, plan_move_reply
from coach_context import is_running, strength_summary
from coach_history import chat_history_page, prepare_chat_history, recent_chat_messages
from coach_memory import MEMORY_LIMITS, memory_state, wants_memory_display
from coach_tools import GarminCoachTools
from coach_analysis import analyze_period as run_period_analysis
from dashboard_data import build_dashboard, dashboard_weekly_volume, merge_activities, monday_of, parse_date
from providers.gigachat import GigaChatClient
from providers.openai import OPENAI_PRESETS, OpenAIClient
from request_security import check_origin, validation_error
from settings import settings
from store import Database
from strength_notes import StrengthNote, get_strength_note, refresh_strength_activity, store_strength_note, strength_activity
from training_week import (
    WeekPreferences, build_week_draft, change_week_distance, include_calendar_sessions,
    mark_week_session_rest, move_week_session, save_calendar_session, trim_week_rest_tail, week_progress,
)

database = Database(settings.database_url, settings.sqlite_path)
logger = logging.getLogger(__name__)
COACH_CONTEXT_VERSION = 9
COACH_CHAT_TURNS = 60


account_id: ContextVar[str] = ContextVar("account_id")


def merge_upcoming_calendar_sessions(store: dict[str, Any], today: date) -> None:
    active = store.get("training_week_active")
    rows = {row["date"]: row for row in (active or {}).get("sessions", [])}
    calendar = store.get("calendar_training_sessions", {})
    dates = [key for key in calendar if key >= today.isoformat() and key not in rows]
    if not dates:
        return
    for key in dates:
        rows[key] = {field: value for field, value in calendar.pop(key).items()
                     if field not in {"revision", "standalone"}}
    store["training_week_active"] = {
        **(active or {"id": uuid4().hex}),
        "sessions": [rows[key] for key in sorted(rows)],
        "revision": (active or {}).get("revision", 0) + 1,
    }
    store["calendar_plan_revision"] = store.get("calendar_plan_revision", 0) + 1
    store.pop("coach_daily", None)


def read_store() -> dict[str, Any]:
    user_id = account_id.get()
    store = database.read(user_id)
    today = date.today()
    history = store.get("coach_chat_history", [])
    planned_dates = {row["date"] for row in (store.get("training_week_active") or {}).get("sessions", [])}
    has_separate_sessions = any(key >= today.isoformat() and key not in planned_dates
                                for key in store.get("calendar_training_sessions", {}))
    if (has_separate_sessions or len(recent_chat_messages(history, today)) != len(history)
            or any("exchange_id" not in row for row in history)):
        def prepare(current: dict[str, Any]) -> None:
            nonlocal store
            prepare_chat_history(current, today)
            merge_upcoming_calendar_sessions(current, today)
            store = current

        database.update(user_id, prepare)
    return store


def update_store(update: Callable[[dict[str, Any]], None]) -> None:
    database.update(account_id.get(), update)


def personal_coach() -> RunningCoach:
    user_id = account_id.get()
    provider, openai_key = database.coach_settings(user_id)
    encrypted = openai_key if provider in OPENAI_PRESETS else database.keys(user_id)[1]
    return RunningCoach(decrypt(encrypted), provider)


def account_coach_tools(store: dict[str, Any]) -> GarminCoachTools:
    user_id = account_id.get()
    return GarminCoachTools(
        store,
        read_detail=lambda activity_id: database.read_activity_detail(user_id, activity_id),
        garmin_key=lambda: decrypt(database.keys(user_id)[0]),
        read_details=lambda activity_ids: database.read_activity_details(user_id, activity_ids),
    )


def account_dashboard(days: int) -> dict[str, Any]:
    user_id = account_id.get()
    configured = bool(database.keys(user_id)[0])
    store = read_store()
    today = date.today()
    if store.get("activity_tracks_pruned_on") != today.isoformat():
        try:
            database.prune_old_activity_tracks(user_id, today)
        except Exception:
            logger.exception("Unable to prune expired Garmin track cache")
    return build_dashboard(days, store, configured=configured)


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


async def verify_key(provider: str, key: str, preset: str | None = None) -> None:
    try:
        if provider == "garmin":
            today = date.today()
            await garmin_call("activities", today, today, key=key)
        elif provider == "openai":
            await run_in_threadpool(OpenAIClient(key, preset if preset in OPENAI_PRESETS else "openai").check_credentials)
        else:
            await run_in_threadpool(GigaChatClient(key).check_credentials)
    except Exception as exc:
        status = getattr(exc, "status_code", None)
        logger.warning("Provider key check failed: provider=%s status=%s type=%s", provider, status, type(exc).__name__)
        name = {"garmin": "Garmin", "ai": "GigaChat", "openai": "OpenAI"}[provider]
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
    activity_id: int | None = Field(default=None, gt=0)
    save_activity_analysis: bool = False


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
    activity_id: int | None = None,
) -> dict[str, Any]:
    coach = None

    def request_coach():
        nonlocal coach
        coach = personal_coach()
        return coach

    try:
        return run_period_analysis(
            start,
            end,
            previous_start,
            previous_end,
            question,
            daily,
            focus_date,
            chat_summary,
            plan_day,
            store,
            activity_id=activity_id,
            personal_coach=request_coach,
            read_store=read_store,
            account_coach_tools=account_coach_tools,
        )
    finally:
        if coach is not None and coach.usage["total_tokens"]:
            today = date.today()
            local_day = plan_day or (focus_date if daily else None)
            usage_day = local_day if local_day and abs((today - local_day).days) <= 1 else today
            try:
                update_store(lambda current: record_daily_usage(current, usage_day.isoformat(), coach.usage))
            except Exception:
                logger.exception("Unable to save coach usage totals")


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
    measurements_revision = hashlib.sha256(
        json.dumps(store.get("body_measurements", {}), sort_keys=True).encode()
    ).hexdigest()
    return [store.get("synced_at"), store.get("wellness_synced_at"), store.get("runner_plan"),
            active_week.get("id"), active_week.get("revision", 0), store.get("deload_weeks"),
            store.get("calendar_plan_revision", 0), store.get("review_revision", 0),
            store.get("coach_history_revision", 0), memory_state(store)["revision"],
            measurements_revision, (store.get("weather_location") or {}).get("id")]


class WeekPlanRequest(BaseModel):
    day: date


class WorkoutReview(BaseModel):
    effort: str = Field(pattern="^(easy|normal|hard)$")
    note: str = Field(default="", max_length=280)


@app.get("/api/coach/activity-analysis/{activity_id}")
def get_activity_analysis(activity_id: int) -> dict:
    return {"analysis": read_store().get("coach_activity_analyses", {}).get(str(activity_id))}


@app.delete("/api/coach/activity-analysis/{activity_id}")
def delete_activity_analysis(activity_id: int) -> dict:
    def remove(store: dict) -> None:
        store.get("coach_activity_analyses", {}).pop(str(activity_id), None)

    update_store(remove)
    return {"analysis": None}


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


class WeekRestRequest(WeekEditRequest):
    session_date: date


class WeekDistanceRequest(WeekEditRequest):
    session_date: date
    distance_km: float = Field(ge=0.1, allow_inf_nan=False)
    kind: str | None = Field(default=None, max_length=20)
    instruction: str | None = Field(default=None, max_length=500)


class CalendarSessionRequest(WeekPlanRequest):
    expected_week_id: str | None = Field(default=None, max_length=36)
    expected_week_revision: int | None = Field(default=None, ge=0)
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
        if state["draft"]:
            return
        active = state["active"]
        last_day = date.fromisoformat(active["sessions"][-1]["date"]) if active else None
        try:
            draft = build_week_draft(
                store.get("activities", []), store.get("runner_plan") or {}, day, request.preferences, store.get("deload_weeks", {}),
                earliest_start=last_day + timedelta(days=1) if last_day else None,
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
        if active and request.draft_id in (active["id"], active.get("last_added_draft_id")):
            return
        state = training_week_state(current, day)
        draft = current.get("training_week_draft")
        if not state["draft"] or draft["id"] != request.draft_id:
            raise HTTPException(409, "Черновик изменился или устарел. Сформируй новый план.")
        extending = active is not None and not state["active"]["expired"]
        if extending and draft["sessions"][0]["date"] <= active["sessions"][-1]["date"]:
            raise HTTPException(409, "Черновик пересекается с текущим планом. Сформируй его заново.")
        calendar_sessions = current.get("calendar_training_sessions", {})
        approved = include_calendar_sessions(current.pop("training_week_draft"), calendar_sessions)
        if extending:
            current["training_week_active"] = {
                **active,
                "sessions": active["sessions"] + approved["sessions"],
                "revision": active.get("revision", 0) + 1,
                "last_added_draft_id": request.draft_id,
            }
        else:
            if active:
                current.setdefault("training_week_history", []).append(active)
            current["training_week_active"] = approved
        for session in approved["sessions"]:
            calendar_sessions.pop(session["date"], None)
        current.pop("coach_daily", None)

    update_store(approve)
    return training_week_state(read_store(), day)


def edit_training_week(request: WeekEditRequest, edit: Callable[[dict, list[dict]], dict | None]) -> dict[str, Any]:
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
            if updated is None:
                store.pop("training_week_active", None)
            else:
                store["training_week_active"] = updated
            store.pop("coach_daily", None)

    update_store(save_edit)
    return training_week_state(read_store(), request.day)


@app.post("/api/coach/week/move")
def move_training_week(request: WeekMoveRequest) -> dict[str, Any]:
    return edit_training_week(request, lambda plan, activities: move_week_session(
        plan, activities, request.day, request.from_date, request.to_date,
    ))


@app.patch("/api/coach/week/rest-tail")
def trim_training_week_rest_tail(request: WeekRestRequest) -> dict[str, Any]:
    return edit_training_week(request, lambda plan, activities: trim_week_rest_tail(
        plan, activities, request.day, request.session_date,
    ))


@app.patch("/api/coach/week/rest")
def rest_training_week_session(request: WeekRestRequest) -> dict[str, Any]:
    return edit_training_week(request, lambda plan, activities: mark_week_session_rest(
        plan, activities, request.day, request.session_date,
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
        if request.expected_week_id is not None:
            active = store.get("training_week_active") or {}
            if active.get("id") != request.expected_week_id or active.get("revision", 0) != request.expected_week_revision:
                raise HTTPException(409, "План изменился. Запроси новое предложение.")
        try:
            in_week = save_calendar_session(
                store, request.day, request.session_date, request.kind,
                request.distance_km, request.instruction, request.revision,
            )
        except ValueError as error:
            raise HTTPException(409, str(error)) from None
        store.pop("coach_daily", None)
        if not in_week:
            merge_upcoming_calendar_sessions(store, request.day)
        result["active"] = training_week_state(store, request.day)["active"]

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
    coach = personal_coach()
    if not coach.configured:
        raise HTTPException(409, "Добавь ключ выбранного провайдера в настройках аккаунта.")
    store = read_store()
    key = daily_cache_key(day, start_date or day, end_date or day)
    saved = store.get("coach_daily", {}).get(key)
    if not saved or saved.get("context_version") != COACH_CONTEXT_VERSION or saved.get("model") != coach.model:
        return None
    cached_preset = saved.get("model_preset", "openai" if saved["model"] == "gpt-6.2-sol" else "gigachat")
    if cached_preset != coach.preset or saved.get("revision") != coach_cache_revision(store):
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


@app.get("/api/coach/usage")
def coach_usage(day: date) -> dict:
    return read_store().get("coach_usage_by_day", {}).get(day.isoformat(), TokenUsage().as_dict())


class CoachMemoryRequest(BaseModel):
    markdown: str = Field(max_length=max(MEMORY_LIMITS))
    revision: int = Field(ge=0)
    limit_chars: int | None = None


@app.get("/api/coach/memory")
def get_coach_memory() -> dict:
    return {**memory_state(read_store()), "limit_options": MEMORY_LIMITS}


@app.put("/api/coach/memory")
def save_coach_memory(request: CoachMemoryRequest) -> dict:
    result = {}

    def save(store: dict[str, Any]) -> None:
        current = memory_state(store)
        if request.revision != current["revision"]:
            raise HTTPException(409, "Память изменилась. Открой её заново перед сохранением.")
        limit_chars = request.limit_chars if request.limit_chars is not None else current["limit_chars"]
        if limit_chars not in MEMORY_LIMITS:
            raise HTTPException(422, "Выбери один из доступных лимитов памяти.")
        markdown = request.markdown.strip()
        if len(markdown) > limit_chars:
            raise HTTPException(422, f"Сократи текст до {limit_chars} символов или увеличь лимит.")
        result.update(markdown=markdown, revision=current["revision"] + 1, limit_chars=limit_chars)
        store["coach_memory"] = result
        store.pop("coach_daily", None)

    update_store(save)
    return {**result, "limit_options": MEMORY_LIMITS}


@app.get("/api/coach/chat")
def coach_chat_history(day: date | None = None, before: date | None = None) -> dict[str, Any]:
    messages = read_store().get("coach_chat_history", [])[-COACH_CHAT_TURNS:]
    if day is None:
        return {"messages": messages}
    return chat_history_page(messages, day, before)


@app.post("/api/coach/chat")
def coach_chat(request: CoachChatRequest) -> dict[str, Any]:
    asked_at = datetime.now(timezone.utc).isoformat()
    question = request.question.strip()
    if not question:
        raise HTTPException(422, "Напиши вопрос консультанту.")
    today = request.today or date.today()
    validate_plan_day(today)
    store = read_store()
    if request.activity_id is None and wants_memory_display(question):
        answer = memory_state(store)["markdown"] or "В памяти консультанта пока пусто."
        return {
            "answer": answer,
            "model": "coach-memory",
            "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
            "messages": [
                {"role": "user", "content": question, "created_at": asked_at},
                {"role": "assistant", "content": answer, "model": "coach-memory",
                 "created_at": datetime.now(timezone.utc).isoformat()},
            ],
        }
    active_plan = store.get("training_week_active")
    activities = store.get("activities", [])

    activity_day = None
    if request.activity_id is not None:
        activity = next((row for row in activities if str(row.get("id")) == str(request.activity_id)), None)
        activity_day = parse_date(activity.get("start_time")) if activity else None
        if activity_day is None:
            raise HTTPException(404, "Тренировка отсутствует в загруженной истории Garmin.")

    move_reply = plan_move_reply(question, active_plan, activities, today) if not activity_day else None
    if move_reply is not None or (not activity_day and is_plan_request(question) and active_plan and active_plan["sessions"][-1]["date"] >= today.isoformat()):
        result = {
            **(move_reply or {"answer": confirmed_plan_reply(active_plan, activities, today)}),
            "model": "training-week",
            "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
        }
    else:
        result = analyze_period(
            activity_day or request.start_date,
            activity_day or request.end_date,
            None if activity_day else request.previous_start_date,
            None if activity_day else request.previous_end_date,
            question=question,
            daily=request.daily and not activity_day,
            focus_date=activity_day or request.focus_date,
            plan_day=today,
            store=store,
            activity_id=request.activity_id,
        )
        if not activity_day and active_plan and TRAINING_TABLE.search(result["answer"]) and not (result.get("training_session") or result.get("training_week_proposal")):
            result["answer"] = confirmed_plan_reply(active_plan, activities, today)

    focus_day = (activity_day or request.focus_date or request.start_date).isoformat()
    exchange_dates = {"focus_date": focus_day, "sent_day": today.isoformat(), "exchange_id": uuid4().hex}
    messages = [
        {"role": "user", "content": question, "created_at": asked_at, **exchange_dates},
        {"role": "assistant", "content": result["answer"], "usage": result["usage"],
         "model": result["model"], "created_at": datetime.now(timezone.utc).isoformat(), **exchange_dates},
    ]

    analysis = None
    if activity_day and request.save_activity_analysis:
        analysis = {"answer": result["answer"], "model": result["model"], "model_preset": result.get("model_preset"),
                    "created_at": datetime.now(timezone.utc).isoformat()}

    def save_turns(store: dict[str, Any]) -> None:
        history = store.get("coach_chat_history", [])
        history.extend(messages)
        store["coach_chat_history"] = history[-COACH_CHAT_TURNS:]
        if analysis is not None:
            store.setdefault("coach_activity_analyses", {})[str(request.activity_id)] = analysis

    update_store(save_turns)
    return {**result, "messages": messages, **({"activity_analysis": analysis} if analysis is not None else {})}


@app.delete("/api/coach/chat/{exchange_id}", status_code=204, response_class=Response)
def delete_coach_exchange(exchange_id: str):
    def delete(store: dict[str, Any]) -> None:
        history = store.get("coach_chat_history", [])
        remaining = [row for row in history if row.get("exchange_id") != exchange_id]
        if len(remaining) != len(history):
            store["coach_chat_history"] = remaining
            store["coach_history_revision"] = store.get("coach_history_revision", 0) + 1
            store.pop("coach_daily", None)

    update_store(delete)


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


@app.get("/api/dashboard/week-zones")
def dashboard_week_zones(week_start: date) -> dict[str, Any]:
    if week_start.weekday() != 0:
        raise HTTPException(422, "Дата начала недели должна быть понедельником.")
    user_id = account_id.get()
    result = weekly_running_zones(
        read_store(), week_start, lambda activity_ids: database.read_activity_details(user_id, activity_ids),
    )
    if result.get("missing_activity_ids") and not database.keys(user_id)[0]:
        result["missing_activity_ids"] = []
    return result


@app.get("/api/dashboard/month-zones")
def dashboard_month_zones(month_start: date) -> dict[str, Any]:
    if month_start.day != 1:
        raise HTTPException(422, "Укажи первый день месяца.")
    user_id = account_id.get()
    month_end = month_start.replace(day=monthrange(month_start.year, month_start.month)[1])
    result = running_zones_for_period(
        read_store(), month_start, month_end,
        lambda activity_ids: database.read_activity_details(user_id, activity_ids), by_day=True, include_excluded=True,
    )
    if result.get("missing_activity_ids") and not database.keys(user_id)[0]:
        result["missing_activity_ids"] = []
    return result


def dashboard_running_power(start: date, end: date, *, include_excluded: bool = False) -> dict[str, Any]:
    user_id = account_id.get()
    result = running_power_for_period(
        read_store(), start, end,
        lambda activity_ids: database.read_activity_details(user_id, activity_ids),
        include_excluded=include_excluded,
    )
    if result["missing_activity_ids"] and not database.keys(user_id)[0]:
        result["missing_activity_ids"] = []
    return result


@app.get("/api/dashboard/week-power")
def dashboard_week_power(week_start: date) -> dict[str, Any]:
    if week_start.weekday() != 0:
        raise HTTPException(422, "Дата начала недели должна быть понедельником.")
    return dashboard_running_power(week_start, week_start + timedelta(days=6))


@app.get("/api/dashboard/month-power")
def dashboard_month_power(month_start: date) -> dict[str, Any]:
    if month_start.day != 1:
        raise HTTPException(422, "Укажи первый день месяца.")
    month_end = month_start.replace(day=monthrange(month_start.year, month_start.month)[1])
    return dashboard_running_power(month_start, month_end, include_excluded=True)


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
        activity_day = parse_date(known_activity.get("start_time"))
        if saved and activity_day and activity_day < retention_cutoff(date.today()):
            saved = archive_expired_track(saved, time())
        details_saved = saved is not None and not saved.get("track_archived", False)
        if request.method == "GET" or details_saved:
            return {
                **(saved or {}),
                "activity_id": activity_id,
                "description": known_activity.get("description"),
                "details_saved": details_saved,
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
    if detail.get("running_power"):
        fields["running_power"] = detail["running_power"]

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
    activity_day = parse_date(updated_activity.get("start_time"))
    if activity_day and activity_day < retention_cutoff(date.today()):
        detail = archive_expired_track(detail, time())
    return {
        "activity_id": activity_id,
        **detail,
        "details_saved": not detail.get("track_archived", False),
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
