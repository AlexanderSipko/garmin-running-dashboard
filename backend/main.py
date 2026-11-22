from __future__ import annotations

import logging
from contextvars import ContextVar
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from accounts import account_routes, check_origin, decrypt
from coach import RunningCoach
from dashboard_data import build_dashboard, merge_activities, monday_of, parse_date
from providers.gigachat import GigaChatClient
from providers.gigachat import GigaChatError
from settings import settings
from runner_plan import plan_context
from store import Database

database = Database(settings.database_url, settings.sqlite_path)
logger = logging.getLogger(__name__)
COACH_CONTEXT_VERSION = 3


account_id: ContextVar[str] = ContextVar("account_id")


def read_store() -> dict[str, Any]:
    return database.read(account_id.get())


def update_store(update: Callable[[dict[str, Any]], None]) -> None:
    database.update(account_id.get(), update)


def personal_coach() -> RunningCoach:
    return RunningCoach(decrypt(database.keys(account_id.get())[1]))


def account_dashboard(days: int) -> dict[str, Any]:
    configured = bool(database.keys(account_id.get())[0])
    return build_dashboard(days, read_store(), configured=configured)


def call_garmin_in_process(method: str, key: str, cache_path: Path, *args):
    from garmin_api import (
        get_activities,
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
    tool = {"activity_detail": get_running_activity_detail, "activity_splits": get_running_activity_splits}[method]
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
    start_date: date
    end_date: date
    previous_start_date: date | None = None
    previous_end_date: date | None = None


class CoachChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class CoachChatRequest(CoachPeriodRequest):
    question: str = Field(min_length=1, max_length=1200)
    conversation: list[CoachChatTurn] = Field(default_factory=list, max_length=8)


def activities_between(rows: list[dict[str, Any]], start: date, end: date) -> list[dict[str, Any]]:
    return [
        item for item in rows
        if start <= (parse_date(item.get("start_time")) or date.min) <= end
    ]


def is_strength(activity: dict[str, Any]) -> bool:
    activity_type = str(activity.get("type") or "").lower().replace("-", "_").replace(" ", "_")
    return any(tag in activity_type for tag in ("strength", "gym", "weight_training", "силов", "зал"))


def is_running(activity: dict[str, Any]) -> bool:
    return "run" in str(activity.get("type") or "").lower() and not is_strength(activity)


def strength_summary(rows: list[dict[str, Any]], *, include_details: bool = False) -> dict[str, Any]:
    sessions = [item for item in rows if is_strength(item)]
    durations = {}
    for index, item in enumerate(sessions):
        seconds = float(item.get("duration_seconds") or item.get("moving_duration_seconds") or 0)
        if seconds > 0:
            durations[index] = seconds

    summary = {
        "sessions": len(sessions),
        "recorded_minutes": round(sum(durations.values()) / 60, 1) if durations else None,
        "sessions_with_duration": len(durations),
    }
    if include_details and sessions:
        latest = sorted(
            enumerate(sessions), key=lambda entry: str(entry[1].get("start_time") or ""), reverse=True
        )[:5]
        summary["recent_sessions"] = [
            {
                "date": str(item.get("start_time"))[:10],
                "name": str(item.get("name") or "")[:80],
                "type": item.get("type"),
                "duration_minutes": round(durations[index] / 60, 1) if index in durations else None,
                "average_heart_rate": item.get("avg_hr_bpm") or None,
            }
            for index, item in latest
        ]
    return summary


def wellness_between(metrics: dict, start: date, end: date) -> dict[str, Any]:
    result = {}
    for name in ("sleep", "stress", "hrv", "weight", "resting_hr", "vo2_max"):
        rows = [row for row in metrics.get(name, []) if start.isoformat() <= str(row.get("date", ""))[:10] <= end.isoformat()]
        values = [float(row["value"]) for row in rows if row.get("value") is not None]
        result[name] = {
            "average": round(sum(values) / len(values), 1) if values else None,
            "latest": rows[-1].get("value") if rows else None,
            "days_with_data": len(values),
        }
    return result


def daily_coach_context(store: dict[str, Any], day: date) -> dict[str, Any]:
    week_start = monday_of(day)
    previous_start = week_start - timedelta(days=7)
    previous_end = week_start - timedelta(days=1)
    baseline_start = day - timedelta(days=21)
    snapshot = {key: [] for key in ("sleep", "hrv", "resting_hr")}
    for key in snapshot:
        snapshot[key] = [
            row for row in store.get("wellness_metrics", {}).get(key, [])
            if baseline_start.isoformat() <= str(row.get("date", ""))[:10] < day.isoformat()
            and row.get("value") is not None
        ]

    def load(start: date, end: date) -> dict[str, Any]:
        rows = activities_between(store.get("activities", []), start, end)
        runs = [row for row in rows if is_running(row)]
        return {
            "sessions": len(rows),
            "runs": len(runs),
            "strength_sessions": sum(is_strength(row) for row in rows),
            "run_km": round(sum(float(row.get("distance_meters") or 0) for row in runs) / 1000, 1),
        }

    return {
        "last_sync_at": store.get("synced_at"),
        "today_recorded_activities": [
            {"name": str(item.get("name") or "")[:100], "type": item.get("type")}
            for item in store.get("activities", [])
            if parse_date(item.get("start_time")) == day
        ][:8],
        "current_week_through_today": load(week_start, day),
        "previous_week_same_days": load(previous_start, day - timedelta(days=7)),
        "previous_full_week": load(previous_start, previous_end),
        "personal_baseline_previous_21_days": {
            key: {
                "days": len(rows),
                "mean": round(sum(float(row["value"]) for row in rows) / len(rows), 1) if rows else None,
                "latest_date": max((str(row["date"])[:10] for row in rows), default=None),
                "latest_value": max(rows, key=lambda row: str(row["date"]))["value"] if rows else None,
            }
            for key, rows in snapshot.items()
        },
    }


def analyze_period(
    start: date,
    end: date,
    previous_start: date | None = None,
    previous_end: date | None = None,
    question: str | None = None,
    conversation: list[dict[str, str]] | None = None,
    daily: bool = False,
) -> dict[str, Any]:
    if daily and start != end:
        raise HTTPException(422, "Сводка дня доступна для одной даты.")
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

    store = read_store()
    rows = store.get("activities", [])
    selected = activities_between(rows, start, end)
    previous = activities_between(rows, previous_start, previous_end) if previous_start and previous_end else None
    reference_day = start if daily else date.today()
    activity_summary = {
        "strength": strength_summary(selected, include_details=True),
        "previous_strength": strength_summary(previous) if previous is not None else None,
        "last_sync_at": store.get("synced_at"),
    }
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
            daily_context=daily_coach_context(store, start) if daily else None,
            runner_plan=plan_context(store.get("runner_plan"), reference_day),
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
            detail = "Не найден сертификат GigaChat: положи корневой сертификат Минцифры в папку certs проекта."
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
    return {"status": "ok", "database": "postgresql" if database.is_postgres else "sqlite"}


@app.get("/api/coach/status")
def coach_status() -> dict[str, Any]:
    running_coach = personal_coach()
    return {
        "enabled": running_coach.enabled,
        "configured": running_coach.configured,
        "model": running_coach.model,
        "provider": running_coach.provider_name,
    }


@app.get("/api/coach/daily")
def saved_daily_summary(day: date):
    if not database.keys(account_id.get())[1]:
        raise HTTPException(409, "Добавь ключ GigaChat в настройках аккаунта.")
    saved = read_store().get("coach_daily", {}).get(day.isoformat())
    return saved if saved and saved.get("context_version") == COACH_CONTEXT_VERSION else None


@app.post("/api/coach/summary")
def coach_summary(request: CoachPeriodRequest) -> dict[str, Any]:
    plan_before_request = read_store().get("runner_plan") if request.daily else None
    result = analyze_period(
        request.start_date,
        request.end_date,
        request.previous_start_date,
        request.previous_end_date,
        daily=request.daily,
    )
    if request.daily:
        def save_summary(store: dict[str, Any]) -> None:
            if store.get("runner_plan") != plan_before_request:
                return
            entries = store.get("coach_daily", {})
            entries[request.start_date.isoformat()] = {**result, "context_version": COACH_CONTEXT_VERSION}
            store["coach_daily"] = dict(sorted(entries.items(), reverse=True)[:7])

        update_store(save_summary)
    return result


@app.post("/api/coach/chat")
def coach_chat(request: CoachChatRequest) -> dict[str, Any]:
    return analyze_period(
        request.start_date,
        request.end_date,
        request.previous_start_date,
        request.previous_end_date,
        question=request.question,
        conversation=[turn.model_dump() for turn in request.conversation],
        daily=request.daily,
    )


@app.get("/api/dashboard")
def dashboard(days: int = Query(default=90, ge=30, le=3650)) -> dict[str, Any]:
    return account_dashboard(days)


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

    def replace_activity(store: dict[str, Any]) -> None:
        nonlocal updated_activity
        rows = store.get("activities", [])
        for index, previous in enumerate(rows):
            if str(previous.get("id")) == activity_key:
                updated_activity = {**previous, **fields}
                if updated_activity != previous:
                    rows[index] = updated_activity
                    rows.sort(key=lambda row: str(row.get("start_time") or ""), reverse=True)
                    store.pop("coach_daily", None)
                return
        raise HTTPException(404, "Тренировка больше не найдена в истории.")

    try:
        await run_in_threadpool(database.update_activity_detail, user_id, activity_key, detail, replace_activity)
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
