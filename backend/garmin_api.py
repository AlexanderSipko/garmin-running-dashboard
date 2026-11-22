"""Read-only access to Garmin Personal API."""
from pathlib import Path
import math
import time
import zipfile
from io import BytesIO
from datetime import date, timedelta
from typing import Any

from fitparse import FitFile
from garmin_personal_api import GarminPersonalApiClient, PersonalApiAuthenticator
from settings import settings

def _clean_activity(row: dict[str, Any]) -> dict[str, Any]:
    activity_type = row.get("activityType") or row.get("activityTypeDTO") or {}
    if isinstance(activity_type, dict):
        activity_type = activity_type.get("typeKey") or activity_type.get("typeName")
    values = {
        "id": row.get("activityId"),
        "name": row.get("activityName"),
        "type": activity_type,
        "start_time": row.get("startTimeLocal") or row.get("startTimeGMT"),
        "distance_meters": row.get("distance"),
        "duration_seconds": row.get("duration"),
        "moving_duration_seconds": row.get("movingDuration"),
        "avg_hr_bpm": row.get("averageHR"),
        "max_hr_bpm": row.get("maxHR"),
        "elevation_gain_meters": row.get("elevationGain"),
        "avg_cadence_spm": row.get("averageRunningCadenceInStepsPerMinute"),
        "avg_speed_mps": row.get("averageSpeed"),
        "calories": row.get("calories"),
    }
    return {key: value for key, value in values.items() if value is not None}


def _split_rows(activity: dict[str, Any]) -> list[dict[str, Any]]:
    nested_activity = activity.get("activity")
    if isinstance(nested_activity, dict):
        activity = {**activity, **nested_activity}

    rows: list[dict[str, Any]] = []
    for key in ("splitSummaries", "splitSummaryDTOs", "splits", "lapDTOs"):
        value = activity.get(key)
        if isinstance(value, dict):
            value = value.get("splitSummaryDTOs") or value.get("splits") or []
        if not isinstance(value, list):
            continue

        for item in value:
            if not isinstance(item, dict):
                continue
            nested = item.get("splits") or item.get("splitSummaryDTOs")
            if isinstance(nested, list):
                rows.extend(row for row in nested if isinstance(row, dict))
            else:
                rows.append(item)
        if rows:
            break

    cleaned = []
    for index, row in enumerate(rows, start=1):
        distance_meters = float(row.get("distance") or row.get("distanceMeters") or 0)
        duration_seconds = float(
            row.get("movingDuration")
            or row.get("duration")
            or row.get("elapsedDuration")
            or row.get("durationInSeconds")
            or 0
        )
        average_speed = float(row.get("averageSpeed") or row.get("avgSpeed") or 0)
        distance_km = distance_meters / 1000
        pace = (
            duration_seconds / distance_km
            if distance_km and duration_seconds
            else 1000 / average_speed
            if average_speed
            else None
        )
        if not distance_km and not pace:
            continue
        cleaned.append(
            {
                "index": (
                    row.get("splitIndex")
                    or row.get("splitNumber")
                    or row.get("index")
                    or index
                ),
                "distance_km": round(distance_km, 3) if distance_km else None,
                "pace_seconds_per_km": round(pace) if pace else None,
                "avg_hr_bpm": row.get("averageHR") or row.get("avgHR"),
            }
        )
    return cleaned


def _fit_track_rows(
    archive_bytes: bytes, max_points: int = 1500,
) -> tuple[list[dict[str, Any]], int, list[tuple[float, float]]]:
    """Decode GPS-like record samples from Garmin's zipped original FIT file."""
    with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
        fit_member = next(
            (item for item in archive.infolist() if item.filename.lower().endswith(".fit")),
            None,
        )
        if fit_member is None:
            return [], 0, []
        if fit_member.file_size > 50 * 1024 * 1024:
            raise ValueError("Garmin FIT file is unexpectedly large")
        fit_bytes = archive.read(fit_member)

    fit_file = FitFile(BytesIO(fit_bytes))
    rows: list[dict[str, Any]] = []
    route: list[tuple[float, float]] = []
    first_timestamp = None
    previous_timestamp = None
    previous_distance = 0.0

    for message in fit_file.get_messages("record"):
        fields = message.get_values()
        latitude = fields.get("position_lat")
        longitude = fields.get("position_long")
        if latitude is not None and longitude is not None:
            # The default fitparse processor leaves GPS coordinates in FIT semicircles.
            degrees_per_semicircle = 180 / (2 ** 31)
            lat = latitude * degrees_per_semicircle
            lon = longitude * degrees_per_semicircle
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                point = (round(lat, 6), round(lon, 6))
                if not route or point != route[-1]:
                    route.append(point)
        timestamp = fields.get("timestamp")
        distance = fields.get("distance")
        speed = fields.get("enhanced_speed") or fields.get("speed")
        heart_rate = fields.get("heart_rate")
        cadence = fields.get("cadence")
        altitude = fields.get("enhanced_altitude") or fields.get("altitude")

        elapsed = None
        delta_seconds = None
        if timestamp is not None:
            if first_timestamp is None:
                first_timestamp = timestamp
            elapsed = max(0, int((timestamp - first_timestamp).total_seconds()))
            if previous_timestamp is not None:
                delta_seconds = max(0, (timestamp - previous_timestamp).total_seconds())
            previous_timestamp = timestamp

        if distance is not None:
            previous_distance = max(previous_distance, float(distance))
        elif speed is not None and delta_seconds:
            previous_distance += max(0, float(speed)) * delta_seconds
        else:
            continue

        speed_value = float(speed) if speed is not None else None
        pace = 1000 / speed_value if speed_value and speed_value > 0.3 else None
        if pace is None and delta_seconds and distance is not None:
            distance_delta = float(distance) - (rows[-1]["distance_meters"] if rows else 0)
            if distance_delta > 0:
                pace = delta_seconds * 1000 / distance_delta

        rows.append({
            "elapsed_seconds": elapsed if elapsed is not None else (rows[-1]["elapsed_seconds"] + 1 if rows else 0),
            "distance_meters": round(previous_distance, 1),
            "pace_seconds_per_km": round(pace, 1) if pace and 120 <= pace <= 1800 else None,
            "heart_rate_bpm": int(heart_rate) if heart_rate is not None else None,
            "cadence_spm": round(float(cadence)) if cadence is not None else None,
            "elevation_meters": round(float(altitude), 1) if altitude is not None else None,
        })

    total_count = len(rows)
    if total_count > max_points:
        stride = math.ceil(total_count / max_points)
        sampled = rows[::stride]
        if sampled[-1] is not rows[-1]:
            sampled.append(rows[-1])
        rows = sampled
    max_route_points = 700
    if len(route) > max_route_points:
        last = len(route) - 1
        route = [route[round(index * last / (max_route_points - 1))] for index in range(max_route_points)]
    return rows, total_count, route


def _records(payload: Any) -> list[dict[str, Any]]:
    """Flatten Garmin's list and nested summary envelopes into candidate rows."""
    rows: list[dict[str, Any]] = []

    def visit(value: Any) -> None:
        if isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            rows.append(value)
            for nested in value.values():
                if isinstance(nested, (dict, list)):
                    visit(nested)

    visit(payload)
    return rows


def _date_value(row: dict[str, Any]) -> str | None:
    for key in ("calendarDate", "date", "measurementDate", "startTimeLocal", "timestamp"):
        value = row.get(key)
        if value:
            return str(value)[:10]
    for key in ("hrvSummary", "dailySleepDTO", "sleepSummary", "generic", "summary", "data"):
        nested = row.get(key)
        if isinstance(nested, dict):
            value = _date_value(nested)
            if value:
                return value
    return None


def _metric_rows(payload: Any, metric: str) -> list[dict[str, Any]]:
    results_by_date: dict[tuple[str, float], dict[str, Any]] = {}
    for row in _records(payload):
        day = _date_value(row)
        if not day:
            continue
        value = None
        if metric == "hrv":
            value = row.get("lastNight") or row.get("lastNightAvg") or row.get("lastNightAverage") or row.get("hrvValue")
            nested = row.get("hrvSummary")
            if value is None and isinstance(nested, dict):
                value = nested.get("lastNight") or nested.get("lastNightAvg")
        elif metric == "vo2_max":
            value = row.get("vo2MaxPreciseValue") or row.get("vo2MaxValue") or row.get("vo2Max")
            nested = row.get("generic")
            if value is None and isinstance(nested, dict):
                value = nested.get("vo2MaxPreciseValue") or nested.get("vo2MaxValue")
        elif metric == "resting_hr":
            value = row.get("restingHeartRate") or row.get("restingHr")
            nested = row.get("heartRate")
            if value is None and isinstance(nested, dict):
                value = nested.get("restingValue") or nested.get("restingHeartRate") or nested.get("restingHr")
        elif metric == "weight":
            value = row.get("weight") or row.get("weightInGrams") or row.get("weightInKg")
            if value is not None:
                value = float(value)
                if "Grams" in "".join(row.keys()) or value > 1000:
                    value /= 1000
        elif metric == "sleep":
            value = next((row.get(key) for key in (
                "sleepTimeSeconds", "totalSleepSeconds", "sleepDurationSeconds",
                "sleepSeconds", "sleepTimeInSeconds", "durationInSeconds",
            ) if row.get(key) is not None), None)
            nested = row.get("dailySleepDTO") or row.get("sleepSummary") or row.get("summary")
            if value is None and isinstance(nested, dict):
                value = next((nested.get(key) for key in (
                    "sleepTimeSeconds", "totalSleepSeconds", "sleepDurationSeconds",
                    "sleepSeconds", "sleepTimeInSeconds", "durationInSeconds",
                ) if nested.get(key) is not None), None)
        elif metric == "stress":
            value = next((row.get(key) for key in (
                "averageStressLevel", "avgStressLevel", "averageStress", "avgStress",
                "overallStressLevel", "stressLevel",
            ) if row.get(key) is not None), None)
        try:
            if value is not None and float(value) > 0:
                numeric_value = float(value)
                if metric == "sleep" and numeric_value > 24 * 60:
                    numeric_value /= 3600
                results_by_date[(day, numeric_value)] = {"date": day, "value": numeric_value}
        except (TypeError, ValueError):
            continue
    return list(results_by_date.values())


def get_activities(start_date: str, end_date: str, start: int = 0, limit: int = 100, *, key: str, cache_path: Path) -> list[dict[str, Any]]:
    """Read one page of activity summaries for an inclusive date range."""
    limit = max(1, min(int(limit), 100))
    with PersonalApiAuthenticator(bearer_token_cache_file=cache_path) as authenticator:
        token = authenticator.obtain_token(key)
    with GarminPersonalApiClient(
        token.access_token, timeout=settings.garmin_api_timeout_seconds
    ) as client:
        activities = client.search_activities(
            start=int(start), limit=limit, start_date=start_date,
            end_date=end_date,
        )
    return [_clean_activity(item) for item in activities]


def get_running_activity_splits(activity_id: str, *, key: str, cache_path: Path) -> list[dict[str, Any]]:
    """Fetch split summaries for one running activity, when Garmin provides them."""
    if not activity_id.isdigit() or int(activity_id) <= 0:
        raise ValueError("Activity ID must be a positive integer")

    with PersonalApiAuthenticator(bearer_token_cache_file=cache_path) as authenticator:
        token = authenticator.obtain_token(key)
    with GarminPersonalApiClient(
        token.access_token, timeout=settings.garmin_api_timeout_seconds
    ) as client:
        activity = client.get_activity(activity_id)
    return _split_rows(activity)


def get_running_activity_detail(activity_id: str, *, key: str, cache_path: Path) -> dict[str, Any]:
    """Fetch one run's splits and downsampled pace/HR/elevation FIT records."""
    if not activity_id.isascii() or not activity_id.isdecimal() or int(activity_id) <= 0:
        raise ValueError("Activity ID must be a positive integer")

    with PersonalApiAuthenticator(bearer_token_cache_file=cache_path) as authenticator:
        token = authenticator.obtain_token(key)

    with GarminPersonalApiClient(
        token.access_token, timeout=settings.garmin_activity_timeout_seconds
    ) as client:
        activity = client.get_activity(activity_id)
        if not isinstance(activity, dict):
            raise ValueError("Unexpected Garmin activity response")
        nested = activity.get("activity")
        raw = {**activity, **nested} if isinstance(nested, dict) else activity
        if raw.get("activityId") is not None and str(raw["activityId"]) != activity_id:
            raise ValueError("Garmin activity ID did not match the request")

        splits = _split_rows(activity)
        summary = raw.get("summaryDTO")
        fields = {**summary, **raw} if isinstance(summary, dict) else raw
        refreshed_activity = _clean_activity(fields)
        if "description" in raw:
            note = raw["description"]
            refreshed_activity["description"] = note.strip() if isinstance(note, str) else None
        try:
            file_bytes = client.download_activity(activity_id)
            points, sample_count, route = _fit_track_rows(file_bytes)
            track_message = "" if points else "В исходном файле Garmin нет точек записи FIT."
        except Exception:
            points, sample_count, route = [], 0, []
            track_message = "Garmin не вернул исходный FIT-файл этой тренировки."

    return {
        "description": refreshed_activity.get("description"),
        "activity": refreshed_activity,
        "splits": splits,
        "points": points,
        "route": route,
        "sample_count": sample_count,
        "track_available": bool(points),
        "track_message": track_message,
    }


def get_wellness_metrics(start_date: str, end_date: str, *, key: str, cache_path: Path) -> dict[str, Any]:
    """Read Garmin sleep, stress, HRV, VO2 max, resting heart rate and weight records."""
    with PersonalApiAuthenticator(bearer_token_cache_file=cache_path) as authenticator:
        token = authenticator.obtain_token(key)

    metrics: dict[str, list[dict[str, Any]]] = {}
    errors: dict[str, str] = {}

    def date_chunks(start: date, end: date, max_days: int):
        current = start
        while current <= end:
            chunk_end = min(end, current + timedelta(days=max_days - 1))
            yield current, chunk_end
            current = chunk_end + timedelta(days=1)

    with GarminPersonalApiClient(
        token.access_token, timeout=settings.garmin_api_timeout_seconds
    ) as client:
        range_start = date.fromisoformat(start_date)
        range_end = date.fromisoformat(end_date)
        for metric, method_name, max_days in (
            ("sleep", "get_daily_sleep_summaries", 90),
            ("stress", "get_daily_stress", 90),
            ("hrv", "get_daily_hrv_summaries", 28),
            ("vo2_max", "get_daily_vo2_max", 365),
            ("resting_hr", "get_daily_summaries", 90),
            ("weight", "get_weight_measurements", 90),
        ):
            metric_rows: list[dict[str, Any]] = []
            try:
                method = getattr(client, method_name, None)
                for chunk_start, chunk_end in date_chunks(range_start, range_end, max_days):
                    for attempt in range(2):
                        try:
                            if metric == "vo2_max" and method is None:
                                # Older installed client builds may not yet wrap this endpoint.
                                payload = client.get(
                                    f"/metrics-service/metrics/maxmet/daily/{chunk_start}/{chunk_end}",
                                    params={"sport": "running"},
                                )
                            elif metric == "vo2_max":
                                payload = method(chunk_start.isoformat(), chunk_end.isoformat(), sport="running")
                            else:
                                payload = method(chunk_start.isoformat(), chunk_end.isoformat())
                            break
                        except Exception:
                            if attempt:
                                raise
                            time.sleep(0.5)
                    metric_rows.extend(_metric_rows(payload, metric))
                metrics[metric] = metric_rows
            except Exception as exc:
                metrics[metric] = metric_rows
                errors[metric] = str(exc)[:240]

        # Some Garmin accounts return an empty range summary even though daily
        # sleep records exist. Recover the recent dashboard window via the
        # single-day endpoint instead of silently persisting an empty metric.
        if not metrics.get("sleep"):
            daily_sleep = getattr(client, "get_daily_sleep", None)
            if daily_sleep is not None:
                fallback_start = max(range_start, range_end - timedelta(days=13))
                recovered: list[dict[str, Any]] = []
                try:
                    current = fallback_start
                    while current <= range_end:
                        payload = daily_sleep(current.isoformat())
                        recovered.extend(_metric_rows(payload, "sleep"))
                        current += timedelta(days=1)
                    metrics["sleep"] = recovered
                    if not recovered:
                        errors["sleep"] = "Garmin вернул пустые записи сна за последние 14 дней."
                    else:
                        errors.pop("sleep", None)
                except Exception:
                    metrics["sleep"] = recovered
                    errors["sleep"] = "Не удалось получить данные сна Garmin."
    return {"metrics": metrics, "errors": errors}
