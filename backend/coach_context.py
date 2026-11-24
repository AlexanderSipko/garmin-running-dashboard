"""Build consultant summaries from the authenticated runner’s saved data."""

from datetime import date, timedelta
from typing import Any

from activity_metrics import activity_kind, activity_pace
from dashboard_data import monday_of, parse_date


def activities_between(rows: list[dict[str, Any]], start: date, end: date) -> list[dict[str, Any]]:
    return [
        item for item in rows
        if start <= (parse_date(item.get("start_time")) or date.min) <= end
    ]


def is_strength(activity: dict[str, Any]) -> bool:
    return activity_kind(activity) == "strength"


def is_running(activity: dict[str, Any]) -> bool:
    return activity_kind(activity) == "run"


def strength_summary(
    rows: list[dict[str, Any]], *, include_details: bool = False, notes: dict | None = None,
) -> dict[str, Any]:
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
        recent_sessions = []
        for index, item in latest:
            entry = (notes or {}).get(str(item.get("id")), {})
            session = {
                "date": str(item.get("start_time"))[:10],
                "name": str(entry.get("title") or item.get("name") or "")[:100],
                "type": item.get("type"),
                "duration_minutes": round(durations[index] / 60, 1) if index in durations else None,
                "average_heart_rate": item.get("avg_hr_bpm") or None,
            }
            if entry.get("note"):
                session["runner_note"] = entry["note"][:400]
            recent_sessions.append(session)
        summary["recent_sessions"] = recent_sessions
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
            "marked_deload": bool(store.get("deload_weeks", {}).get(start.isoformat())),
            "run_km": round(sum(float(row.get("distance_meters") or 0) for row in runs) / 1000, 1),
        }

    today_rows = activities_between(store.get("activities", []), day, day)
    return {
        "date": day.isoformat(),
        "last_sync_at": store.get("synced_at"),
        "wellness_today": wellness_between(store.get("wellness_metrics", {}), day, day),
        "today_recorded_activities": [
            {
                "id": item.get("id"),
                "name": str(item.get("name") or "")[:80],
                "type": item.get("type"),
                "km": round(float(item["distance_meters"]) / 1000, 2) if item.get("distance_meters") else None,
                "pace": activity_pace(item) if is_running(item) else None,
                "avg_bpm": item.get("avg_hr_bpm"),
                "duration_seconds": item.get("moving_duration_seconds") or item.get("duration_seconds"),
            }
            for item in today_rows[:8]
        ],
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
