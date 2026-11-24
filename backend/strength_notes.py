"""Private names and training notes for completed Garmin strength sessions."""

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator

from activity_metrics import activity_kind


class StrengthNote(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    note: str = Field(default="", max_length=2000)

    @field_validator("title", "note", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


def get_strength_note(store: dict, activity_id: int) -> dict | None:
    key = str(activity_id)
    if not any(
        str(activity.get("id")) == key and activity_kind(activity) == "strength"
        for activity in store.get("activities", [])
    ):
        raise HTTPException(404, "Силовая тренировка отсутствует в истории Garmin.")
    return store.get("strength_notes", {}).get(key)


def store_strength_note(store: dict, activity_id: int, note: StrengthNote) -> None:
    entry = note.model_dump()
    if get_strength_note(store, activity_id) == entry:
        return
    store.setdefault("strength_notes", {})[str(activity_id)] = entry
    store["review_revision"] = store.get("review_revision", 0) + 1
    store.pop("coach_daily", None)
