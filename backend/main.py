from __future__ import annotations

import json
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
from providers.gigachat import GigaChatClient
from providers.gigachat import GigaChatError
from settings import settings
from store import Database

database = Database(settings.database_url, settings.sqlite_path)
logger = logging.getLogger(__name__)


account_id: ContextVar[str] = ContextVar("account_id")


def read_store() -> dict[str, Any]:
    return database.read(account_id.get())


def update_store(update: Callable[[dict[str, Any]], None]) -> None:
    database.update(account_id.get(), update)


def personal_coach() -> RunningCoach:
    return RunningCoach(decrypt(database.keys(account_id.get())[1]))


def _activity_key(activity: dict[str, Any]) -> str:
    activity_id = activity.get("id")
    if activity_id is not None:
        return f"id:{activity_id}"
    return "fallback:" + json.dumps(
        [activity.get("start_time"), activity.get("type"), activity.get("distance_meters"), activity.get("name")],
        ensure_ascii=False,
    )


def _merge_activities(
    saved: list[dict[str, Any]], incoming: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    saved_rows = saved if isinstance(saved, list) else []
    incoming_rows = incoming if isinstance(incoming, list) else []
    for activity in [*saved_rows, *incoming_rows]:
        if not isinstance(activity, dict):
            continue
        key = _activity_key(activity)
        merged[key] = {**merged.get(key, {}), **activity}
    return sorted(
        merged.values(),
        key=lambda item: str(item.get("start_time") or ""),
        reverse=True,
    )


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def build_dashboard(days: int) -> dict[str, Any]:
    store = read_store()
    today = date.today()
    start_date = today - timedelta(days=days - 1)
    activities = [
        item for item in store.get("activities", [])
        if (parse_date(item.get("start_time")) or date.min) >= start_date
    ]
    activities.sort(key=lambda item: item.get("start_time", ""), reverse=True)
    total_meters = sum(float(item.get("distance_meters") or 0) for item in activities)
    total_seconds = sum(float(item.get("moving_duration_seconds") or item.get("duration_seconds") or 0) for item in activities)
    week_start = monday_of(today)
    this_week = [item for item in activities if (parse_date(item.get("start_time")) or date.min) >= week_start]
    week_meters = sum(float(item.get("distance_meters") or 0) for item in this_week)
    longest_meters = max((float(item.get("distance_meters") or 0) for item in activities), default=0)
    pace_seconds = total_seconds / (total_meters / 1000) if total_meters else None
    weekly_totals: dict[str, float] = {}
    for item in activities:
        day = parse_date(item.get("start_time"))
        if day:
            key = monday_of(day).isoformat()
            weekly_totals[key] = weekly_totals.get(key, 0) + float(item.get("distance_meters") or 0) / 1000
    weekly = []
    for offset in range(11, -1, -1):
        monday = week_start - timedelta(weeks=offset)
        weekly.append({"week": monday.isoformat(), "label": monday.strftime("%d %b"), "km": round(weekly_totals.get(monday.isoformat(), 0), 1)})
    wellness = store.get("wellness_metrics", {})
    wellness_years: dict[int, dict[str, Any]] = {}
    wellness_series: dict[str, list[dict[str, Any]]] = {}
    for metric in ("sleep", "stress", "hrv", "vo2_max", "resting_hr", "weight"):
        wellness_series[metric] = [
            {"date": row.get("date"), "value": float(row["value"])}
            for row in wellness.get(metric, [])
            if row.get("date") and row.get("value") is not None
        ]
        for record in wellness.get(metric, []):
            day = parse_date(record.get("date"))
            value = record.get("value")
            if not day or value is None:
                continue
            year = day.year
            bucket = wellness_years.setdefault(year, {"year": year, "hrv": [], "vo2_max": [], "resting_hr": [], "weight": []})
            if metric not in bucket:
                bucket[metric] = []
            bucket[metric].append({"date": day.isoformat(), "value": float(value)})
    yearly_wellness = []
    for year, bucket in sorted(wellness_years.items(), reverse=True):
        hrv = [point["value"] for point in bucket["hrv"]]
        vo2 = [point["value"] for point in bucket["vo2_max"]]
        resting_hr = [point["value"] for point in bucket["resting_hr"]]
        weights = sorted(bucket["weight"], key=lambda point: point["date"])
        yearly_wellness.append({
            "year": year,
            "hrv_avg": round(sum(hrv) / len(hrv)) if hrv else None,
            "hrv_count": len(hrv),
            "vo2_max": round(max(vo2), 1) if vo2 else None,
            "vo2_count": len(vo2),
            "resting_hr_avg": round(sum(resting_hr) / len(resting_hr)) if resting_hr else None,
            "resting_hr_count": len(resting_hr),
            "weight_latest": round(weights[-1]["value"], 1) if weights else None,
            "weight_date": weights[-1]["date"] if weights else None,
        })
    return {
        "connection": {
            "configured": bool(database.keys(account_id.get())[0]),
            "synced_at": store.get("synced_at"),
        },
        "period_days": days,
        "stats": {
            "run_count": len(activities),
            "total_km": round(total_meters / 1000, 1),
            "total_hours": round(total_seconds / 3600, 1),
            "average_pace_seconds_per_km": round(pace_seconds) if pace_seconds else None,
            "longest_km": round(longest_meters / 1000, 1),
            "this_week_km": round(week_meters / 1000, 1),
            "this_week_runs": len(this_week),
        },
        "weekly": weekly,
        "activities": activities[:5000],
        "wellness": {
            "years": yearly_wellness,
            "metrics": wellness_series,
            "synced_at": store.get("wellness_synced_at"),
            "errors": store.get("wellness_errors", {}),
        },
    }


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


def activities_between(start: date, end: date) -> list[dict[str, Any]]:
    return [
        item
        for item in read_store().get("activities", [])
        if start <= (parse_date(item.get("start_time")) or date.min) <= end
        and "run" in str(item.get("type") or "").lower()
    ]


def period_activity_summary(start: date, end: date) -> dict[str, Any]:
    rows = [
        item for item in read_store().get("activities", [])
        if start <= (parse_date(item.get("start_time")) or date.min) <= end
    ]
    strength = [item for item in rows if any(tag in str(item.get("type") or "").lower() for tag in ("strength", "gym", "weight_training", "силов", "зал"))]
    run_count = len(activities_between(start, end))
    return {"run_count": run_count, "strength_count": len(strength), "activity_count": len(rows)}


def wellness_between(start: date, end: date) -> dict[str, Any]:
    metrics = read_store().get("wellness_metrics", {})
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


def analyze_period(
    start: date,
    end: date,
    previous_start: date | None = None,
    previous_end: date | None = None,
    question: str | None = None,
    conversation: list[dict[str, str]] | None = None,
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

    try:
        result = running_coach.analyze(
            activities=activities_between(start, end),
            start_date=start,
            end_date=end,
            previous_activities=(
                activities_between(previous_start, previous_end)
                if previous_start and previous_end
                else None
            ),
            previous_start_date=previous_start,
            previous_end_date=previous_end,
            wellness=wellness_between(start, end),
            activity_summary=period_activity_summary(start, end),
            question=question,
            conversation=conversation,
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


@app.post("/api/coach/summary")
def coach_summary(request: CoachPeriodRequest) -> dict[str, Any]:
    return analyze_period(
        request.start_date,
        request.end_date,
        request.previous_start_date,
        request.previous_end_date,
    )


@app.post("/api/coach/chat")
def coach_chat(request: CoachChatRequest) -> dict[str, Any]:
    return analyze_period(
        request.start_date,
        request.end_date,
        request.previous_start_date,
        request.previous_end_date,
        question=request.question,
        conversation=[turn.model_dump() for turn in request.conversation],
    )


@app.get("/api/dashboard")
def dashboard(days: int = Query(default=90, ge=30, le=3650)) -> dict[str, Any]:
    return build_dashboard(days)


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
async def activity_detail(activity_id: int) -> dict[str, Any]:
    if activity_id <= 0:
        raise HTTPException(status_code=422, detail="Некорректный ID тренировки.")
    known_activity = any(
        str(activity.get("id")) == str(activity_id)
        for activity in read_store().get("activities", [])
    )
    if not known_activity:
        raise HTTPException(status_code=404, detail="Тренировка не найдена в Garmin.")

    try:
        detail = await garmin_call("activity_detail", activity_id)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Не удалось загрузить подробные данные тренировки из Garmin.",
        ) from None
    return {"activity_id": activity_id, **detail}


@app.post("/api/sync")
async def sync_activities(days: int = Query(default=365, ge=30, le=3650)) -> dict[str, Any]:
    garmin_key = decrypt(database.keys(account_id.get())[0])
    if not garmin_key:
        raise HTTPException(status_code=409, detail="Добавь ключ Garmin в настройках аккаунта.")
    today = date.today()
    try:
        activities = await garmin_call("activities", today - timedelta(days=days - 1), today, key=garmin_key)
    except Exception as exc:
        reason = str(exc).lower()
        if "rate limit" in reason or "429" in reason:
            message = "Garmin временно ограничил запросы. Подожди и синхронизируй позже."
        elif "invalid key" in reason or "401" in reason:
            message = "Garmin не принял Personal API key. Проверь ключ в настройках аккаунта."
        else:
            message = "Не удалось получить данные Garmin. Проверь подключение и попробуй позже."
        raise HTTPException(status_code=502, detail=message) from None
    initial_store = read_store()
    old_metrics = initial_store.get("wellness_metrics", {})
    has_wellness_history = any(
        old_metrics.get(name)
        for name in ("sleep", "stress", "hrv", "vo2_max", "resting_hr", "weight")
    )
    wellness_result: dict[str, Any] | None = None
    wellness_error = False
    try:
        # Garmin exposes only short HRV windows; bootstrap two years, then refresh the latest 28 days.
        wellness_start = max(
            today - timedelta(days=27 if has_wellness_history else 730),
            today - timedelta(days=days - 1),
        )
        wellness_result = await garmin_call("wellness_metrics", wellness_start, today, key=garmin_key)
    except Exception:
        wellness_error = True

    sync_time = datetime.now(timezone.utc).isoformat()

    def merge_sync_result(store: dict[str, Any]) -> None:
        # Re-read under the cross-process lock after all network awaits.
        # A narrower sync adds/updates its range but never deletes older history.
        store["activities"] = _merge_activities(
            store.get("activities", []), activities
        )
        store["synced_at"] = sync_time

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
            store["wellness_synced_at"] = sync_time
        elif wellness_error:
            # Wellness is optional; keep the last successful records and timestamp.
            store["wellness_errors"] = {
                "general": "Не удалось синхронизировать показатели здоровья."
            }

    update_store(merge_sync_result)
    return build_dashboard(days)
