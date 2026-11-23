"""Pure dashboard aggregation and activity merging."""

import json
from datetime import date, datetime, timedelta
from typing import Any


def _activity_key(activity: dict[str, Any]) -> str:
    activity_id = activity.get("id")
    if activity_id is not None:
        return f"id:{activity_id}"
    return "fallback:" + json.dumps(
        [activity.get("start_time"), activity.get("type"), activity.get("distance_meters"), activity.get("name")],
        ensure_ascii=False,
    )


def merge_activities(
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


def build_dashboard(days: int, store: dict[str, Any], *, configured: bool) -> dict[str, Any]:
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
            "configured": configured,
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
        "deload_weeks": store.get("deload_weeks", {}),
        "activities": activities[:5000],
        "wellness": {
            "years": yearly_wellness,
            "metrics": wellness_series,
            "synced_at": store.get("wellness_synced_at"),
            "errors": store.get("wellness_errors", {}),
        },
    }
