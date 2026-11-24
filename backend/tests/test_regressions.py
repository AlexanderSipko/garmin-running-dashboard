import asyncio
import unittest
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError

from coach_context import daily_coach_context
from dashboard_data import build_dashboard
from garmin_api import _metric_rows
from request_security import check_origin, validation_error
from store import Database
from training_week import save_calendar_session


class DashboardTests(unittest.TestCase):
    def test_running_stats_exclude_strength_and_pair_time_with_distance(self):
        today = date.today()
        activities = [
            {"type": "running", "distance_meters": 5000, "duration_seconds": 1800},
            {"type": "trail_running", "distance_meters": 3000},
            {"type": "strength_training", "duration_seconds": 3600},
        ]
        store = {"activities": [dict(row, start_time=today.isoformat()) for row in activities]}
        dashboard = build_dashboard(30, store, configured=True)
        self.assertEqual(len(dashboard["activities"]), 3)
        self.assertEqual(dashboard["stats"]["run_count"], 2)
        self.assertEqual(dashboard["stats"]["average_pace_seconds_per_km"], 360)
        self.assertEqual(dashboard["weekly"][-1]["km"], 8)
        context = daily_coach_context(store, today)
        self.assertEqual(context["current_week_through_today"]["strength_sessions"], 1)

    def test_short_sleep_and_invalid_weight(self):
        day = "2026-11-22"
        sleep = _metric_rows([{"calendarDate": day, "sleepTimeSeconds": 900}], "sleep")
        self.assertEqual(sleep, [{"date": day, "value": 0.25}])
        weight = _metric_rows([
            {"calendarDate": day, "weight": "invalid"},
            {"calendarDate": day, "weightInGrams": 70500},
        ], "weight")
        self.assertEqual(weight, [{"date": day, "value": 70.5}])

    def test_stale_calendar_edit_preserves_the_saved_plan(self):
        today = date.today()
        day = today + timedelta(days=1)
        store = {}
        save_calendar_session(store, today, day, "easy", 5, "Первый вариант", None)
        save_calendar_session(store, today, day, "tempo", 6, "Новый вариант", 1)
        with self.assertRaises(ValueError):
            save_calendar_session(store, today, day, "long", 10, "Устаревшая правка", 1)
        self.assertEqual(store["calendar_training_sessions"][day.isoformat()]["instruction"], "Новый вариант")

    def test_partial_refresh_preserves_only_own_saved_track(self):
        with TemporaryDirectory() as directory:
            db = Database("", Path(directory) / "test.sqlite3")
            first = db.register_user("one@example.org", "test")
            second = db.register_user("two@example.org", "test")
            def update_activity(store):
                store["refreshed"] = True

            original = {"points": [1], "route": [[1, 2]], "track_available": True, "sample_count": 1}
            partial = {"points": [], "route": [], "splits": [2], "track_refresh_failed": True}
            db.update_activity_detail(first, "42", original, update_activity)
            saved = db.update_activity_detail(first, "42", partial, update_activity)
            self.assertEqual(saved["route"], original["route"])
            self.assertEqual(saved["splits"], [2])
            self.assertEqual(db.read_activity_detail(first, "42"), saved)
            own = db.update_activity_detail(second, "42", partial, update_activity)
            self.assertEqual(own["route"], [])
            replacement = {"route": [], "points": []}
            self.assertEqual(db.update_activity_detail(first, "42", replacement, update_activity), replacement)


class RequestSecurityTests(unittest.TestCase):
    @staticmethod
    def request(path, origin):
        return Request({"type": "http", "scheme": "https", "method": "POST", "path": path,
                        "headers": [(b"host", b"dashboard.test"), (b"origin", origin.encode())],
                        "query_string": b""})

    def test_write_origin_includes_scheme(self):
        check_origin(self.request("/api/sync", "https://dashboard.test"))
        with self.assertRaises(HTTPException) as caught:
            check_origin(self.request("/api/sync", "http://dashboard.test"))
        self.assertEqual(caught.exception.status_code, 403)

    def test_validation_does_not_echo_credentials(self):
        error = RequestValidationError([{"loc": ["body"], "input": "example-private-value", "msg": "invalid"}])
        for path in ("/api/account/login", "/api/account/register", "/api/account/keys/garmin"):
            with self.subTest(path=path):
                response = asyncio.run(validation_error(self.request(path, "https://dashboard.test"), error))
                self.assertEqual(response.status_code, 422)
                self.assertNotIn(b"example-private-value", response.body)
