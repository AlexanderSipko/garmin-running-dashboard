import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from store import Database
from weather import add_weather_routes, daily_forecast


class WeatherRoutesTests(unittest.TestCase):
    def test_forecast_is_account_scoped_and_uses_local_dates(self):
        location = {"id": 1, "name": "Екатеринбург", "latitude": 56.84, "longitude": 60.6}
        daily = {
            "time": ["2026-11-30", "2026-12-01"],
            "weather_code": [3, 71],
            "temperature_2m_min": [-8, -10],
            "temperature_2m_max": [-3, -5],
            "precipitation_probability_max": [0, 85],
        }
        with TemporaryDirectory() as directory:
            database = Database("", Path(directory) / "weather.sqlite3")
            first = database.register_user("first@example.org", "test")
            second = database.register_user("second@example.org", "test")

            def current(request: Request):
                user = request.headers.get("test-user")
                if user not in (first, second):
                    raise HTTPException(401)
                return user, ""

            router = APIRouter()
            add_weather_routes(router, database, current)
            app = FastAPI()
            app.include_router(router)
            client = TestClient(app)
            headers = {"test-user": first}
            self.addCleanup(daily_forecast.cache_clear)

            with patch("weather.provider_json", side_effect=[{"results": [location]}, location, {"daily": daily}]) as provider:
                self.assertEqual(client.get("/weather").status_code, 401)
                self.assertEqual(client.get("/weather/search?city=Екатеринбург", headers=headers).json()[0]["id"], 1)
                self.assertEqual(client.put("/weather/location", headers=headers, json={"id": 1}).json()["name"], location["name"])
                forecast = client.get("/weather", headers=headers).json()
                self.assertEqual(forecast["days"]["2026-12-01"]["precipitation"], 85)
                self.assertEqual(forecast["days"]["2026-11-30"]["precipitation"], 0)
                self.assertEqual(provider.call_args.kwargs["forecast_days"], 14)
                self.assertEqual(provider.call_args.kwargs["timezone"], "auto")
                self.assertIsNone(client.get("/weather", headers={"test-user": second}).json()["location"])
                self.assertIsNone(client.put("/weather/location", headers=headers, json={"id": None}).json())
                self.assertEqual(client.get("/weather", headers=headers).json()["days"], {})
