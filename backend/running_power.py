"""Time in running power zones from saved FIT, without loading external data."""

from activity_metrics import activity_kind
from dashboard_data import parse_date
from runner_plan import RunnerPlan


def power_zone_bounds(raw_plan):
    plan = RunnerPlan.model_validate(raw_plan or {})
    return list(zip(plan.power_zone_starts, plan.power_zone_ends))


def power_zone_durations(histogram, zones):
    times = {f"Z{index}": 0 for index in range(1, len(zones) + 1)}
    outside = 0
    for watts, seconds in histogram.items():
        for index, (lower, upper) in enumerate(zones, 1):
            if lower <= int(watts) <= upper:
                times[f"Z{index}"] += seconds
                break
        else:
            outside += seconds
    return {
        "seconds_by_zone": times,
        "outside_seconds": outside,
        "covered_seconds": sum(times.values()) + outside,
    }


def running_power_for_period(store, start, end, read_details, *, include_excluded=False):
    zones = power_zone_bounds(store.get("runner_plan"))
    runs = {}
    for activity in store.get("activities", []):
        day = parse_date(activity.get("start_time"))
        key = str(activity.get("id") or "")
        if activity_kind(activity) == "run" and day and start <= day <= end and key.isascii() and key.isdecimal():
            runs[key] = (day, activity)

    details = read_details(list(runs))
    histogram_total = {}
    recorded_runs = 0
    missing = []
    excluded = []
    for key, (day, activity) in runs.items():
        detail = details.get(key)
        histogram = (detail or {}).get("running_power_seconds_by_watt")
        if histogram is None:
            missing.append(key)
        if not histogram:
            if include_excluded:
                if detail is None:
                    reason = "not_loaded"
                elif histogram is None:
                    reason = "needs_refresh"
                elif detail.get("running_power"):
                    reason = "summary_only"
                else:
                    reason = "no_power"
                excluded.append({"activity_id": key, "date": day.isoformat(),
                                 "name": str(activity.get("name") or "")[:120], "reason": reason})
            continue
        recorded_runs += 1
        if zones:
            for watts, seconds in histogram.items():
                histogram_total[watts] = histogram_total.get(watts, 0) + seconds
    return {
        "configured": bool(zones), "runs": len(runs), "recorded_runs": recorded_runs,
        **power_zone_durations(histogram_total, zones),
        "missing_activity_ids": missing,
        **({"excluded_runs": sorted(excluded, key=lambda row: row["date"], reverse=True)} if include_excluded else {}),
    }
