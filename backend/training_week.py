"""Draft and track a seven-day running plan for a single account."""

from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from dashboard_data import monday_of, parse_date

Kind = Literal["rest", "easy", "long", "quality", "strength"]
RUN_KINDS = {"easy", "long", "quality"}


class PlannedSession(BaseModel):
    kind: Kind
    distance_km: float | None = Field(default=None, gt=0, le=100)
    instruction: str = Field(min_length=1, max_length=160)

    @field_validator("instruction")
    @classmethod
    def clean_instruction(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Нужен краткий ориентир для занятия")
        return value


class WeekProposal(BaseModel):
    rationale: str = Field(min_length=1, max_length=320)
    sessions: list[PlannedSession] = Field(min_length=7, max_length=7)


def activity_kind(row: dict) -> str | None:
    kind = str(row.get("type") or "").lower().replace("-", "_").replace(" ", "_")
    if any(tag in kind for tag in ("strength", "gym", "weight_training", "силов", "зал")):
        return "strength"
    return "run" if "run" in kind else None


def draft_start(activities: list[dict], today: date) -> date:
    has_activity = any(parse_date(row.get("start_time")) == today for row in activities)
    return today + timedelta(days=1) if has_activity else today


def recent_training_load(activities: list[dict], today: date) -> dict:
    start = monday_of(today) - timedelta(weeks=4)
    weekly_km = {}
    weekly_count = {}
    longest_km = 0.0
    for row in activities:
        day = parse_date(row.get("start_time"))
        if day is None or not start <= day <= today or activity_kind(row) != "run":
            continue
        km = float(row.get("distance_meters") or 0) / 1000
        if km <= 0:
            continue
        monday = monday_of(day)
        weekly_km[monday] = weekly_km.get(monday, 0.0) + km
        weekly_count[monday] = weekly_count.get(monday, 0) + 1
        longest_km = max(longest_km, km)

    return {
        "weeks": [
            {"week_of": week.isoformat(), "km": round(weekly_km.get(week, 0), 1), "runs": weekly_count.get(week, 0)}
            for week in (start + timedelta(weeks=offset) for offset in range(5))
        ],
        "max_week_km": round(max(weekly_km.values(), default=0), 1),
        "max_run_km": round(longest_km, 1),
    }


def plan_sessions(proposal: WeekProposal, start: date, load: dict) -> list[dict]:
    planned_km = 0.0
    quality_days = []
    sessions = []
    for offset, session in enumerate(proposal.sessions):
        if session.kind in RUN_KINDS:
            if session.distance_km is None or session.distance_km > load["max_run_km"]:
                raise ValueError("Дистанция занятия выходит за рамки недавней нагрузки.")
            planned_km += session.distance_km
        elif session.distance_km is not None:
            raise ValueError("Дистанция задаётся только для бега.")
        if session.kind in {"quality", "long"}:
            quality_days.append(offset)
        sessions.append({"date": (start + timedelta(days=offset)).isoformat(), **session.model_dump()})

    if planned_km > load["max_week_km"] + 0.001 or not any(day.kind == "rest" for day in proposal.sessions):
        raise ValueError("План выходит за рамки недавнего объёма или не оставляет дня отдыха.")
    if len(quality_days) > 2 or any(b - a < 2 for a, b in zip(quality_days, quality_days[1:])):
        raise ValueError("В плане слишком много нагрузочных занятий подряд.")
    return sessions


def week_progress(plan: dict, activities: list[dict], today: date) -> dict:
    sessions = plan["sessions"]
    first = date.fromisoformat(sessions[0]["date"])
    last = date.fromisoformat(sessions[-1]["date"])
    by_day = {}
    for row in activities:
        day = parse_date(row.get("start_time"))
        if day is not None and first <= day <= min(last, today):
            by_day.setdefault(day.isoformat(), []).append(row)

    tracked = []
    actual_run_km = 0.0
    for session in sessions:
        day = date.fromisoformat(session["date"])
        rows = by_day.get(session["date"], [])
        kinds = {activity_kind(row) for row in rows}
        run_km = sum(
            float(row.get("distance_meters") or 0) / 1000 for row in rows if activity_kind(row) == "run"
        )
        actual_run_km += run_km
        expected = "run" if session["kind"] in RUN_KINDS else session["kind"]

        if day > today:
            status = "upcoming"
        elif expected == "rest":
            status = "rest_done" if not rows and day < today else "rest_activity" if rows else "today"
        elif expected in kinds:
            status = "matched"
        else:
            status = "not_recorded" if day < today else "today"

        tracked.append({**session, "status": status, "actual_km": round(run_km, 1) if run_km else None})

    return {
        **plan,
        "sessions": tracked,
        "planned_km": round(sum(day.get("distance_km") or 0 for day in sessions), 1),
        "actual_run_km": round(actual_run_km, 1),
        "matched_sessions": sum(day["status"] == "matched" for day in tracked),
        "planned_sessions": sum(day["kind"] != "rest" for day in sessions),
        "expired": today > last,
    }


def week_context(plan: dict | None, activities: list[dict], today: date) -> dict | None:
    if plan is None:
        return None
    progress = week_progress(plan, activities, today)
    return {
        "range": [progress["sessions"][0]["date"], progress["sessions"][-1]["date"]],
        "expired": progress["expired"],
        "planned_km": progress["planned_km"],
        "actual_run_km": progress["actual_run_km"],
        "matched_sessions": progress["matched_sessions"],
        "planned_sessions": progress["planned_sessions"],
        "days": [
            {key: value for key, value in day.items() if key in {"date", "kind", "distance_km", "status", "actual_km"}}
            for day in progress["sessions"]
        ],
    }
