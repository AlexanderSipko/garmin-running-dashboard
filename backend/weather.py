"""Account weather settings and Open-Meteo forecasts."""

from functools import lru_cache
from time import time

import httpx
from fastapi import HTTPException, Query, Request
from pydantic import BaseModel, Field

GEOCODING = "https://geocoding-api.open-meteo.com/v1"
FORECAST = "https://api.open-meteo.com/v1/forecast"
DAILY_FIELDS = {
    "code": "weather_code",
    "min": "temperature_2m_min",
    "max": "temperature_2m_max",
    "precipitation": "precipitation_probability_max",
}


class WeatherLocation(BaseModel):
    id: int = Field(gt=0)
    name: str
    admin1: str = ""
    country: str = ""
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class LocationSelection(BaseModel):
    id: int | None = Field(default=None, gt=0)


def provider_json(url: str, **params) -> dict:
    response = httpx.get(url, params=params, timeout=6)
    response.raise_for_status()
    return response.json()


@lru_cache(maxsize=128)
def daily_forecast(latitude: float, longitude: float, cache_window: int) -> dict:
    daily = provider_json(
        FORECAST, latitude=latitude, longitude=longitude, timezone="auto",
        daily=",".join(DAILY_FIELDS.values()), forecast_days=14,
    )["daily"]
    return {
        day: {name: daily[field][index] for name, field in DAILY_FIELDS.items()}
        for index, day in enumerate(daily["time"])
    }


def location_forecast(location: dict | None) -> dict:
    if not location:
        return {"location": None, "days": {}}
    try:
        days = daily_forecast(location["latitude"], location["longitude"], int(time()) // 1800)
        return {"location": location, "days": days}
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError):
        return {"location": location, "days": {}, "unavailable": True}


def add_weather_routes(router, database, current):
    @router.get("/weather/search")
    def search(request: Request, city: str = Query(min_length=2, max_length=100)):
        current(request)
        try:
            payload = provider_json(f"{GEOCODING}/search", name=city.strip(), count=6, language="ru")
            return [WeatherLocation.model_validate(row) for row in payload.get("results", [])]
        except (httpx.HTTPError, ValueError, AttributeError):
            raise HTTPException(502, "Поиск городов сейчас недоступен.") from None

    @router.put("/weather/location")
    def set_location(selection: LocationSelection, request: Request):
        user_id, _ = current(request)
        location = None
        if selection.id is not None:
            try:
                location = WeatherLocation.model_validate(
                    provider_json(f"{GEOCODING}/get", id=selection.id, language="ru")
                ).model_dump()
            except (httpx.HTTPError, ValueError):
                raise HTTPException(502, "Не удалось сохранить город. Повтори поиск.") from None

        def save(store):
            store["weather_location"] = location

        database.update(user_id, save)
        return location

    @router.get("/weather")
    def weather(request: Request):
        user_id, _ = current(request)
        return location_forecast(database.read(user_id).get("weather_location"))
