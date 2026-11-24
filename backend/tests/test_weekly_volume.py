import unittest
from datetime import date, timedelta

from dashboard_data import dashboard_weekly_volume, monday_of
from training_week import recent_training_load


def run(day: date, distance_km: int) -> dict:
    return {"start_time": day.isoformat(), "type": "running", "distance_meters": distance_km * 1000}


class WeeklyVolumeTests(unittest.TestCase):
    def test_calendar_and_plan_share_baseline_for_short_history(self):
        today = date(2026, 11, 25)
        monday = monday_of(today)
        activities = [
            run(monday - timedelta(days=17), 8),  # Incomplete first week.
            run(monday - timedelta(days=13), 12),
            run(today, 20),  # Ongoing week does not affect the reference.
            run(today + timedelta(days=1), 100),
        ]

        reference = dashboard_weekly_volume(activities, today, monday)[monday.isoformat()]
        self.assertEqual(reference, {"previous_km": 0, "typical_km": 6, "weeks": 2})
        self.assertEqual(recent_training_load(activities, today)["typical_km"], reference["typical_km"])

    def test_does_not_invent_baseline_when_no_completed_week_is_covered(self):
        today = date(2026, 11, 25)
        monday = monday_of(today)
        activities = [run(monday - timedelta(days=3), 12), run(today, 20)]
        self.assertEqual(dashboard_weekly_volume(activities, today, monday), {})
        self.assertIsNone(recent_training_load(activities, today)["typical_km"])

    def test_reference_uses_at_most_six_completed_weeks(self):
        today = date(2026, 11, 25)
        monday = monday_of(today)
        activities = [run(monday - timedelta(weeks=offset), offset * 10) for offset in range(1, 8)]
        reference = dashboard_weekly_volume(activities, today, monday)[monday.isoformat()]
        self.assertEqual(reference, {"previous_km": 10, "typical_km": 35, "weeks": 6})
        self.assertEqual(recent_training_load(activities, today)["typical_km"], reference["typical_km"])
