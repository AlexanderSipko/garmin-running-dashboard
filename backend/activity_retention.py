"""Retention policy for cached Garmin tracks."""

from calendar import monthrange
from datetime import date, timedelta

from heart_rate_distribution import seconds_by_bpm

TRACK_CACHE_SECONDS = int(timedelta(days=7).total_seconds())
TRACK_FIELDS = ("points", "route", "sample_count", "track_available")


def retention_cutoff(today: date) -> date:
    year = max(1, today.year - 1)
    return today.replace(year=year, day=min(today.day, monthrange(year, today.month)[1]))


def archive_expired_track(detail: dict, now: float) -> dict:
    if not (detail.get("points") or detail.get("route")):
        return detail
    if (detail.get("track_cached_at") or 0) + TRACK_CACHE_SECONDS > now:
        return detail

    archived = {key: value for key, value in detail.items() if key not in TRACK_FIELDS}
    if archived.get("heart_rate_seconds_by_bpm") is None:
        histogram = seconds_by_bpm(detail.get("points") or [])
        if histogram:
            archived["heart_rate_seconds_by_bpm"] = histogram
            archived["heart_rate_source"] = "sampled_fit_estimate"
    archived.pop("track_cached_at", None)
    archived["track_archived"] = True
    archived["track_message"] = "Трек старой тренировки можно снова загрузить из Garmin."
    return archived


def stamp_fresh_track(detail: dict, now: float) -> None:
    if detail.get("points") or detail.get("route"):
        detail["track_cached_at"] = now
