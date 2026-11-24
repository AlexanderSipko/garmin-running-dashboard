"""Group saved consultation exchanges for display in the dashboard."""

from datetime import date

from dashboard_data import parse_date

HISTORY_PAGE_DAYS = 2


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
