"""Recovery indicators calculated from saved Garmin measurements."""

from datetime import date, timedelta
from math import isfinite
from statistics import mean

from dashboard_data import parse_date
from training_week import activity_kind


def recovery_indicators(store: dict, day: date) -> dict:
    metrics = store.get("wellness_metrics", {})
    start = day - timedelta(days=6)
    wellness = {}
    for metric in ("sleep", "hrv", "resting_hr"):
        values = {}
        for row in metrics.get(metric, []):
            measured = parse_date(row.get("date"))
            value = row.get("value")
            if measured and start <= measured <= day and isinstance(value, (int, float)) and isfinite(value):
                values[measured] = value
        wellness[metric] = values

    measured = max((key for values in wellness.values() for key in values), default=None)
    hrv = list(wellness["hrv"].values())
    run_distances = [
        float(row.get("distance_meters") or 0)
        for row in store.get("activities", [])
        if start <= (parse_date(row.get("start_time")) or date.min) <= day and activity_kind(row) == "run"
    ]
    activity_coverage = parse_date(store.get("activities_synced_through"))
    return {
        "source": "saved_garmin_data",
        "date": day.isoformat(),
        "measurement_date": measured.isoformat() if measured else None,
        "sleep_hours": wellness["sleep"].get(measured),
        "hrv_average_ms": round(mean(hrv), 1) if hrv else None,
        "hrv_samples": len(hrv),
        "resting_bpm": wellness["resting_hr"].get(measured),
        "recorded_run_km": round(sum(run_distances) / 1000, 1)
        if run_distances or (activity_coverage and activity_coverage >= day) else None,
    }
