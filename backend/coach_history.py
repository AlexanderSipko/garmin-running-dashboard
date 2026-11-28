"""Group saved consultation exchanges for display in the dashboard."""

from datetime import date, timedelta
from uuid import uuid4

from dashboard_data import parse_date

HISTORY_PAGE_DAYS = 2


def recent_chat_messages(messages: list[dict], today: date) -> list[dict]:
    cutoff = today - timedelta(days=45)
    return [message for message in messages
            if (parse_date(message.get("sent_day") or message.get("focus_date")) or date.min) >= cutoff]


def prepare_chat_history(store: dict, today: date) -> None:
    history = store.get("coach_chat_history", [])
    messages = recent_chat_messages(history, today)
    if len(messages) != len(history):
        store.pop("coach_daily", None)
        store["coach_history_revision"] = store.get("coach_history_revision", 0) + 1
    exchange_id = None
    for message in messages:
        if message["role"] == "user" or exchange_id is None:
            exchange_id = message.get("exchange_id") or uuid4().hex
        message.setdefault("exchange_id", exchange_id)
    store["coach_chat_history"] = messages


def chat_history_page(messages: list[dict], day: date, before: date | None = None) -> dict:
    by_day = {}
    for message in messages:
        # Older rows only have the selected focus date.
        message_day = parse_date(message.get("sent_day") or message.get("focus_date"))
        by_day.setdefault(message_day or date.min, []).append(message)

    if before is None:
        return {
            "messages": by_day.get(day, []),
            "has_history": any(message_day < day for message_day in by_day),
        }

    older_days = sorted((key for key in by_day if key < min(day, before)), reverse=True)
    page = older_days[:HISTORY_PAGE_DAYS]
    return {
        "days": [
            {"day": key.isoformat() if key != date.min else None, "messages": by_day[key]}
            for key in page
        ],
        "next_before": page[-1].isoformat() if len(older_days) > len(page) else None,
    }
