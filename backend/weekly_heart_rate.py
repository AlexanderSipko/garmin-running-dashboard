"""Running heart-rate summaries built from saved activity details."""

from datetime import date, timedelta
from typing import Callable

from activity_metrics import activity_kind
from dashboard_data import parse_date
from heart_rate_distribution import running_zone_times
from runner_plan import plan_context


def running_zones_for_period(
    store: dict, start: date, end: date, read_detail: Callable[[str], dict | None], *, by_day: bool = False,
) -> dict:
    zones = plan_context(store.get("runner_plan"), date.today()).get("running_heart_rate_zones_bpm")
    if not zones:
        return {"configured": False}

    def empty():
        return {"runs": 0, "recorded_runs": 0, "seconds_by_zone": dict.fromkeys(zones, 0),
                "covered_seconds": 0, "outside_seconds": 0, "approximate": False}

    total = empty()
    days = {}
    missing = []
    for run in store.get("activities", []):
        day = parse_date(run.get("start_time"))
        if activity_kind(run) != "run" or day is None or not start <= day <= end:
            continue
        buckets = [total]
        if by_day:
            key = day.isoformat()
            if key not in days:
                days[key] = empty()
            buckets.append(days[key])
        for bucket in buckets:
            bucket["runs"] += 1

        activity_id = str(run.get("id") or "")
        if not activity_id.isascii() or not activity_id.isdecimal():
            continue
        detail = read_detail(activity_id)
        result = running_zone_times(detail, zones)
        if result:
            for bucket in buckets:
                bucket["covered_seconds"] += result["covered_seconds"]
                bucket["outside_seconds"] += result["outside_zone_seconds"]
                bucket["recorded_runs"] += 1
                bucket["approximate"] |= result["source"] == "sampled_fit_estimate"
                for zone, duration in result["seconds_by_zone"].items():
                    bucket["seconds_by_zone"][zone] += duration
        elif detail is None:
            missing.append(activity_id)

    result = {"configured": True, **total, "missing_activity_ids": missing}
    if by_day:
        result["days"] = days
    return result


def weekly_running_zones(store: dict, week_start: date, read_detail: Callable[[str], dict | None]) -> dict:
    result = running_zones_for_period(store, week_start, week_start + timedelta(days=6), read_detail)
    return {"week_start": week_start.isoformat(), **result}
