from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Callable

from fastapi import HTTPException

from coach import IncompleteCoachAnswer, RunningCoach, has_tool_protocol
from coach_context import activities_between, daily_coach_context, is_running, strength_summary, wellness_between
from coach_tools import GarminCoachTools
from coach_memory import memory_state, wants_memory_update
from providers.gigachat import GigaChatError
from providers.openai import OpenAIError
from runner_plan import plan_context
from training_week import week_context

logger = logging.getLogger(__name__)


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
    *,
    activity_id: int | None = None,
    personal_coach: Callable[[], RunningCoach],
    read_store: Callable[[], dict[str, Any]],
    account_coach_tools: Callable[[dict[str, Any]], GarminCoachTools],
) -> dict[str, Any]:
    if end < start:
        raise HTTPException(status_code=422, detail="Конец периода раньше его начала.")
    running_coach = personal_coach()
    if not running_coach.enabled:
        raise HTTPException(status_code=409, detail="disabled")

    if not running_coach.configured:
        raise HTTPException(
            status_code=409,
            detail="Добавь ключ выбранного провайдера в настройках аккаунта.",
        )

    if store is None:
        store = read_store()
    reference_day = (focus_date or start) if daily or activity_id is not None else date.today()
    if start <= reference_day < end:
        end = reference_day
        if previous_start and previous_end:
            previous_end = min(previous_end, previous_start + (end - start))

    rows = store.get("activities", [])
    selected = activities_between(rows, start, end)
    if activity_id is not None:
        selected = [row for row in selected if str(row.get("id")) == str(activity_id)]
    previous = activities_between(rows, previous_start, previous_end) if previous_start and previous_end else None
    tools = None
    conversation = []
    if question:
        tools = account_coach_tools(store)
        tools.review_only = activity_id is not None
        tools.allow_memory = not tools.review_only and wants_memory_update(question)
        history = store.get("coach_chat_history", [])
        conversation = [
            turn for turn in history
            if turn["role"] != "assistant" or (
                not has_tool_protocol(turn.get("content", ""))
                and any(char.isalpha() for char in turn.get("content", ""))
            )
        ][-(6 if activity_id is not None else 8):]
        if chat_summary:
            conversation = [{"role": "assistant", "content": chat_summary[:450]}, *conversation]
    elif daily:
        day_key = reference_day.isoformat()
        conversation = [
            turn for turn in store.get("coach_chat_history", [])
            if turn.get("focus_date") == day_key
            and (turn["role"] != "assistant" or not has_tool_protocol(turn.get("content", "")))
        ][-4:]

    activity_summary = {
        "strength": strength_summary(selected, include_details=start == end and activity_id is None),
        "previous_strength": strength_summary(previous) if previous is not None else None,
        "last_sync_at": store.get("synced_at"),
    }
    if activity_id is not None and selected:
        activity = selected[0]
        activity_summary["review_target"] = {
            "activity_id": activity_id,
            "name": activity.get("name"),
            "type": activity.get("type"),
            "distance_meters": activity.get("distance_meters"),
            "moving_duration_seconds": activity.get("moving_duration_seconds") or activity.get("duration_seconds"),
            "avg_hr_bpm": activity.get("avg_hr_bpm"),
            "max_hr_bpm": activity.get("max_hr_bpm"),
            "garmin_description": str(activity.get("description") or "")[:500],
        }
        question = (
            f"Фокус разбора — тренировка Garmin ID {activity_id} за {start.isoformat()}. "
            "При необходимости используй этот ID в инструментах. Сравни с заданием на эту дату, "
            "если оно есть и относится к тренировке. Учитывай сохранённую цель, если она есть. "
            "Если задания нет, оцени тренировку по её фактическим данным. Вопрос бегуна: " + question
        )
    calendar_sessions = store.get("calendar_training_sessions", {})
    if activity_id is not None:
        feedback = store.get("workout_reviews", {}).get(str(activity_id))
        if feedback:
            activity_summary["recent_runner_feedback"] = [feedback]
    else:
        activity_summary["recent_runner_feedback"] = sorted(
            (item for item in store.get("workout_reviews", {}).values() if item["date"] <= reference_day.isoformat()),
            key=lambda item: item["date"], reverse=True,
        )[:2]
    upcoming = [
        calendar_sessions[key]
        for key in sorted(calendar_sessions)
        if reference_day.isoformat() <= key <= (reference_day + timedelta(days=6)).isoformat()
    ]
    if upcoming and activity_id is None:
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
    if question and activity_id is None:
        month_start = reference_day.replace(day=1)
        month_rows = activities_between(rows, month_start, reference_day)
        activity_summary["current_month_strength"] = {
            "from": month_start.isoformat(),
            "to": reference_day.isoformat(),
            **strength_summary(month_rows),
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
            memory_markdown=memory_state(store)["markdown"],
        )
    except IncompleteCoachAnswer:
        raise HTTPException(502, "Модель не закончила ответ. Повтори запрос.") from None
    except OpenAIError as exc:
        if exc.status_code in (401, 403, 404):
            detail = "OpenAI отклонил запрос. Проверь ключ и доступ проекта к модели."
        elif exc.status_code == 429:
            detail = "OpenAI ограничил запросы. Проверь квоту проекта."
        else:
            detail = "Не удалось получить ответ OpenAI. Попробуй позже."
        raise HTTPException(429 if exc.status_code == 429 else 502, detail) from None
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
            detail = f"GigaChat не нашёл модель {running_coach.model}. Проверь доступ ключа к этой модели или выбери другую в настройках."
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

