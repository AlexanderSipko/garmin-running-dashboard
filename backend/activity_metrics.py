"""Shared activity classification and running pace formatting."""

def activity_kind(row: dict) -> str | None:
    kind = str(row.get("type") or "").lower().replace("-", "_").replace(" ", "_")
    if any(tag in kind for tag in ("strength", "gym", "weight_training", "силов", "зал")):
        return "strength"
    return "run" if "run" in kind else None


def pace_label(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    total_seconds = round(seconds)
    if total_seconds <= 0:
        return None
    minutes, remainder = divmod(total_seconds, 60)
    return f"{minutes}:{remainder:02d} мин/км"


def activity_pace(activity: dict) -> str | None:
    distance = float(activity.get("distance_meters") or 0)
    seconds = float(activity.get("moving_duration_seconds") or activity.get("duration_seconds") or 0)
    return pace_label(round(seconds * 1000 / distance)) if distance > 0 and seconds > 0 else None
