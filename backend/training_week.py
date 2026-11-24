"""Draft and track a seven-day running plan for a single account."""

from datetime import date, timedelta
from itertools import combinations
from math import isfinite
from statistics import median
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from activity_metrics import activity_kind
from dashboard_data import (
    RunningWeek, completed_running_weeks, monday_of, parse_date, running_week_history, weekly_volume_reference,
)

RUN_KINDS = {"easy", "recovery", "long", "tempo", "intervals", "quality", "race"}
SESSION_DESCRIPTION_LIMIT = 500


class WeekPreferences(BaseModel):
    available_days: set[Literal[0, 1, 2, 3, 4, 5, 6]] = Field(default_factory=lambda: set(range(7)), min_length=1)
    run_days: int | None = Field(default=None, ge=1, le=6)
    long_day: Literal[0, 1, 2, 3, 4, 5, 6] | None = None
    effort: Literal["usual", "lighter"] = "usual"

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.run_days is not None and self.run_days > len(self.available_days):
            raise ValueError("Число пробежек превышает число выбранных дней.")
        if self.long_day is not None and self.long_day not in self.available_days:
            raise ValueError("Выбери день для длительной из доступных дней.")
        return self


def draft_start(activities: list[dict], today: date) -> date:
    has_activity = any(parse_date(row.get("start_time")) == today for row in activities)
    return today + timedelta(days=1) if has_activity else today


def recent_training_load(activities: list[dict], today: date) -> dict:
    current_monday = monday_of(today)
    first_day, weeks = running_week_history(activities, today)
    completed = completed_running_weeks(first_day, current_monday)
    reference = weekly_volume_reference(first_day, weeks, current_monday)
    start = current_monday - timedelta(weeks=6)
    recent = {monday: week for monday, week in weeks.items() if monday >= start}
    empty = RunningWeek()
    return {
        "typical_km": reference["typical_km"],
        "typical_runs": median(weeks.get(monday, empty).runs for monday in completed) if completed else 0,
        "longest_km": max((week.longest_km for week in recent.values()), default=0),
        "last_run_week": max(recent, default=None),
    }


def spread_days(available: list[int], count: int, preferred: int | None) -> tuple[int, ...]:
    schedules = (
        group for group in combinations(available, count)
        if preferred is None or preferred in group
    )

    def spacing(group: tuple[int, ...]) -> tuple:
        gaps = [second - first for first, second in zip(group, (*group[1:], group[0] + 7))]
        return min(gaps), -sum(gap * gap for gap in gaps), -group[0]

    return max(schedules, key=spacing)


def build_week_draft(
    activities: list[dict], goal: dict, day: date, preferences: WeekPreferences, deload_weeks: dict,
    earliest_start: date | None = None,
) -> dict:
    load = recent_training_load(activities, day)
    if not load["typical_km"] or load["last_run_week"] < monday_of(day) - timedelta(weeks=2):
        raise ValueError("Не хватает недавних пробежек для расчёта. Синхронизируй Garmin и обсуди возвращение к бегу с консультантом.")

    start = max(draft_start(activities, day), earliest_start or day)
    dates = [start + timedelta(days=index) for index in range(7)]
    race_day = parse_date(goal.get("race_date"))
    race_offset = dates.index(race_day) if race_day in dates else None
    close_to_race = race_day is not None and 0 <= (race_day - start).days <= 14
    marked_deload = any(deload_weeks.get(monday_of(scheduled_day).isoformat()) for scheduled_day in dates)
    lighter = marked_deload or preferences.effort == "lighter" or goal.get("stage") in {"taper", "recovery"} or close_to_race

    available = [
        index for index, scheduled_day in enumerate(dates)
        if scheduled_day.weekday() in preferences.available_days
        and (race_offset is None or abs(index - race_offset) > 1)
    ]
    usual_count = max(1, int(load["typical_runs"]))
    requested = preferences.run_days or usual_count
    count = min(requested, usual_count, len(available), 6 - (race_offset is not None))
    preferred = next((index for index in available if dates[index].weekday() == preferences.long_day), None)
    run_days = spread_days(available, count, preferred) if count else ()
    long_day = (preferred if preferred is not None else run_days[-1]) if count >= 2 and not lighter else None

    target_km = load["typical_km"] * (0.75 if lighter else 1)
    weight = count + (0.3 if long_day is not None else 0)
    sessions = []
    for index, scheduled_day in enumerate(dates):
        session = {"date": scheduled_day.isoformat(), "kind": "rest", "distance_km": None, "instruction": "Отдых от бега."}
        if index in run_days:
            share = 1.3 if index == long_day else 1
            km = int(min(load["longest_km"], target_km * share / weight) * 10) / 10
            if km > 0:
                session.update({
                    "kind": "long" if index == long_day else "easy",
                    "distance_km": km,
                    "instruction": "Длительная в разговорном темпе." if index == long_day else "Лёгкий бег в разговорном темпе.",
                })
        if index == race_offset:
            session.update(kind="race", instruction="Запланированный старт. Дистанция и темп по твоему плану на забег.")
        sessions.append(session)

    reason = f"Ориентир — типичный объём {load['typical_km']:.1f} км. Учтены доступные дни."
    if marked_deload:
        reason += " Объём снижен с учётом отметки разгрузки в календаре."
    elif lighter:
        reason += " Для облегчённой недели объём снижен."
    if count < requested:
        reason += " Пробежек меньше запроса с учётом привычной частоты и доступных дней."
    return {"rationale": reason, "sessions": sessions, "lighter": lighter, "marked_deload": marked_deload}


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
    planned_to_date_km = 0.0
    for session in sessions:
        day = date.fromisoformat(session["date"])
        rows = by_day.get(session["date"], [])
        kinds = {activity_kind(row) for row in rows}
        run_km = sum(
            float(row.get("distance_meters") or 0) / 1000 for row in rows if activity_kind(row) == "run"
        )
        actual_run_km += run_km
        expected = "run" if session["kind"] in RUN_KINDS else session["kind"]

        target_km = session.get("distance_km")
        if day <= today and target_km:
            planned_to_date_km += target_km

        if day > today:
            status = "upcoming"
        elif expected == "rest":
            status = "rest_done" if not rows and day < today else "rest_activity" if rows else "today"
        elif expected in kinds:
            status = "matched"
        elif rows:
            status = "different_activity"
        else:
            status = "not_recorded" if day < today else "today"

        distance_status = None
        if status == "matched" and target_km and run_km:
            difference = run_km - target_km
            tolerance = target_km * 0.05
            distance_status = "below" if difference < -tolerance else "above" if difference > tolerance else "on_target"

        tracked.append({
            **session, "status": status, "actual_km": round(run_km, 1) if run_km else None,
            "distance_status": distance_status,
        })

    return {
        **plan,
        "sessions": tracked,
        "planned_km": round(sum(day.get("distance_km") or 0 for day in sessions), 1),
        "actual_run_km": round(actual_run_km, 1),
        "planned_to_date_km": round(planned_to_date_km, 1),
        "matched_sessions": sum(day["status"] == "matched" for day in tracked),
        "planned_sessions": sum(day["kind"] != "rest" for day in sessions),
        "expired": today > last,
    }


def move_week_session(plan: dict, activities: list[dict], today: date, from_day: date, to_day: date) -> dict:
    if from_day == to_day or min(from_day, to_day) < today:
        raise ValueError("Выбери две разные даты, начиная с сегодняшнего дня.")

    sessions = {session["date"]: session for session in plan["sessions"]}
    source = sessions.get(from_day.isoformat())
    target = sessions.get(to_day.isoformat())
    if source is None or target is None:
        raise ValueError("Перенос возможен между днями подтверждённого плана.")
    if source["kind"] in {"rest", "race"}:
        raise ValueError("Выбери запланированную тренировку. Дата забега фиксирована.")
    if target["kind"] != "rest":
        raise ValueError("На выбранный день уже запланировано занятие. Выбери свободный день.")
    if any(parse_date(row.get("start_time")) in {from_day, to_day} for row in activities):
        raise ValueError("За одну из дат уже есть активность Garmin. Выбери дни без записанных занятий.")

    sessions[source["date"]] = {**target, "date": source["date"]}
    sessions[target["date"]] = {**source, "date": target["date"]}
    return {
        **plan,
        "sessions": [sessions[key] for key in sorted(sessions)],
        "revision": plan.get("revision", 0) + 1,
    }


def change_week_distance(
    plan: dict, activities: list[dict], today: date, day: date, distance_km: float,
    *, kind: str | None = None, instruction: str | None = None, adding: bool = False,
) -> dict:
    if day < today:
        raise ValueError("Изменить план можно у предстоящей пробежки.")

    session = next((row for row in plan["sessions"] if row["date"] == day.isoformat()), None)
    if session is None or (session["kind"] != "rest" if adding else session["kind"] not in RUN_KINDS):
        raise ValueError("Выбери пробежку из подтверждённого плана.")
    if any(parse_date(row.get("start_time")) == day for row in activities):
        raise ValueError("За этот день уже есть запись Garmin. Исходный план сохранён для сверки.")
    if not isfinite(distance_km) or distance_km < 0.1 or distance_km != round(distance_km, 1):
        raise ValueError("Укажи дистанцию от 0,1 км с точностью до десятых.")
    new_kind = session["kind"] if kind is None else kind
    if new_kind not in RUN_KINDS or (new_kind != session["kind"] and "race" in {new_kind, session["kind"]}):
        raise ValueError("Выбери тип беговой тренировки. Тип запланированного старта фиксирован.")
    description = session.get("instruction") if instruction is None else instruction.strip()
    if instruction is not None and len(description) > SESSION_DESCRIPTION_LIMIT:
        raise ValueError(f"Описание должно содержать до {SESSION_DESCRIPTION_LIMIT} символов.")
    updated = {**session, "kind": new_kind, "distance_km": distance_km}
    if instruction is not None:
        updated["instruction"] = description
    if updated == session:
        return plan

    return {
        **plan,
        "sessions": [
            updated if row is session else row
            for row in plan["sessions"]
        ],
        "revision": plan.get("revision", 0) + 1,
    }


def save_calendar_session(
    store: dict, today: date, day: date, kind: str, distance_km: float, instruction: str, revision: int | None,
) -> bool:
    """Save a free-date workout. Return whether it was added to the active week."""
    key = day.isoformat()
    active = store.get("training_week_active")
    sessions = store.setdefault("calendar_training_sessions", {})
    existing = sessions.get(key)
    in_week = active and any(session["date"] == key for session in active["sessions"])
    if in_week:
        if revision is not None or existing or any(
            session["date"] == key and session["kind"] != "rest" for session in active["sessions"]
        ):
            raise ValueError("На этот день уже есть план. Открой день заново для редактирования.")
        store["training_week_active"] = change_week_distance(
            active, store.get("activities", []), today, day, distance_km,
            kind=kind, instruction=instruction, adding=True,
        )
        return True

    if revision != (existing["revision"] if existing else None):
        raise ValueError("План на этот день изменился. Открой день заново.")
    entry = {field: value for field, value in existing.items() if field != "revision"} if existing else {
        "date": key, "kind": "rest",
    }
    updated = change_week_distance(
        {"sessions": [entry], "revision": revision or 0}, store.get("activities", []),
        today, day, distance_km, kind=kind, instruction=instruction, adding=existing is None,
    )
    sessions[key] = {**updated["sessions"][0], "revision": updated["revision"], "standalone": True}
    store["calendar_plan_revision"] = store.get("calendar_plan_revision", 0) + 1
    return False


def include_calendar_sessions(plan: dict, calendar_sessions: dict) -> dict:
    return {
        **plan,
        "sessions": [
            {key: value for key, value in calendar_sessions[session["date"]].items() if key not in {"revision", "standalone"}}
            if session["date"] in calendar_sessions else session
            for session in plan["sessions"]
        ],
    }


def week_context(plan: dict | None, activities: list[dict], today: date) -> dict | None:
    if plan is None:
        return None
    progress = week_progress(plan, activities, today)
    next_session = next((
        day for day in progress["sessions"]
        if day["kind"] != "rest" and day["status"] in {"upcoming", "today", "different_activity"}
        and day["date"] >= today.isoformat()
    ), None)
    return {
        "next_session": {key: next_session.get(key) for key in ("date", "kind", "distance_km", "instruction")} if next_session else None,
        "range": [progress["sessions"][0]["date"], progress["sessions"][-1]["date"]],
        "expired": progress["expired"],
        "lighter": progress.get("lighter"),
        "marked_deload": progress.get("marked_deload"),
        "planned_km": progress["planned_km"],
        "actual_run_km": progress["actual_run_km"],
        "planned_to_date_km": progress["planned_to_date_km"],
        "matched_sessions": progress["matched_sessions"],
        "planned_sessions": progress["planned_sessions"],
        "days": [
            {key: value for key, value in day.items() if key in {
                "date", "kind", "distance_km", "instruction", "status", "actual_km", "distance_status",
            }}
            for day in progress["sessions"]
        ],
    }
