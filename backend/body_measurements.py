from datetime import date
from typing import Annotated

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

Circumference = Annotated[float, Field(gt=0, le=500, allow_inf_nan=False)]


class Measurement(BaseModel):
    day: date
    weight: float | None = Field(default=None, gt=0, le=700, allow_inf_nan=False)
    chest: Circumference | None = None
    waist: Circumference | None = None
    hips: Circumference | None = None
    shoulders: Circumference | None = None
    arm: Circumference | None = None
    thigh: Circumference | None = None
    neck: Circumference | None = None
    calf: Circumference | None = None
    glutes: Circumference | None = None
    note: str = Field(default="", max_length=1000)


def add_body_measurement_routes(router, database, current):
    @router.get("/measurements")
    def list_measurements(request: Request):
        user_id, _ = current(request)
        entries = database.read(user_id).get("body_measurements", {})
        return {"entries": [entries[day] for day in sorted(entries, reverse=True)]}

    @router.put("/measurements")
    def save_measurement(body: Measurement, request: Request):
        user_id, _ = current(request)
        entry = body.model_dump(mode="json")
        entry["note"] = body.note.strip()
        if not any(value for key, value in entry.items() if key != "day"):
            raise HTTPException(422, "Добавь хотя бы один замер или заметку.")

        def save(store):
            store.setdefault("body_measurements", {})[entry["day"]] = entry

        database.update(user_id, save)
        return {"entry": entry}

    @router.delete("/measurements/{day}")
    def delete_measurement(day: date, request: Request):
        user_id, _ = current(request)

        def remove(store):
            store.get("body_measurements", {}).pop(day.isoformat(), None)

        database.update(user_id, remove)
        return {"deleted": True}
