"""Private names and training notes for completed Garmin strength sessions."""

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator

from activity_metrics import activity_kind


class StrengthNote(BaseModel):
    title: str = Field(default="", max_length=100)
    note: str = Field(default="", max_length=2000)

    @field_validator("title", "note", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


def strength_activity(store: dict, activity_id: int) -> dict:
    key = str(activity_id)
    for activity in store.get("activities", []):
        if str(activity.get("id")) == key and activity_kind(activity) == "strength":
            return activity
    raise HTTPException(404, "Силовая тренировка отсутствует в истории Garmin.")


def get_strength_note(store: dict, activity_id: int) -> dict | None:
    strength_activity(store, activity_id)
    return store.get("strength_notes", {}).get(str(activity_id))


def refresh_strength_activity(store: dict, activity_id: int, fields: dict) -> dict:
    activity = strength_activity(store, activity_id)
    # Garmin metadata and the runner's own note are kept in separate records.
    updates = {key: fields[key] for key in (
        "name", "description", "duration_seconds", "moving_duration_seconds",
        "avg_hr_bpm", "max_hr_bpm", "calories",
    ) if key in fields}
    if any(activity.get(key) != value for key, value in updates.items()):
        activity.update(updates)
        store["review_revision"] = store.get("review_revision", 0) + 1
        store.pop("coach_daily", None)
    return dict(activity)


def store_strength_note(store: dict, activity_id: int, note: StrengthNote) -> None:
    entry = note.model_dump()
    if get_strength_note(store, activity_id) == entry:
        return
    store.setdefault("strength_notes", {})[str(activity_id)] = entry
    store["review_revision"] = store.get("review_revision", 0) + 1
    store.pop("coach_daily", None)
