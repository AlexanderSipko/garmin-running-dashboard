import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from coach_context import strength_summary
from dashboard_data import merge_activities
from strength_notes import StrengthNote, get_strength_note, store_strength_note


class StrengthNotesTests(unittest.TestCase):
    def test_note_survives_garmin_sync_and_is_available_to_coach(self):
        activity = {"id": 42, "type": "strength_training", "start_time": "2026-11-24", "name": "Силовая"}
        store = {"activities": [activity], "coach_daily": {"old": "summary"}}
        note = StrengthNote(title=" Грудь и трицепс ", note=" Жим лёжа 60 кг, 3×8. ")
        store_strength_note(store, 42, note)
        store["activities"] = merge_activities(store["activities"], [{**activity, "name": "Garmin"}])

        self.assertEqual(get_strength_note(store, 42), {"title": "Грудь и трицепс", "note": "Жим лёжа 60 кг, 3×8."})
        self.assertEqual(store["activities"][0]["name"], "Garmin")
        self.assertNotIn("coach_daily", store)
        self.assertEqual(store["review_revision"], 1)

        result = strength_summary(store["activities"], include_details=True, notes=store["strength_notes"])
        self.assertEqual(result["sessions"], 1)
        self.assertEqual(result["recent_sessions"][0]["name"], "Грудь и трицепс")
        self.assertEqual(result["recent_sessions"][0]["runner_note"], "Жим лёжа 60 кг, 3×8.")

    def test_does_not_allow_writing_notes_to_runs_or_unknown_activities(self):
        store = {"activities": [{"id": 42, "type": "running"}]}
        for activity_id in (42, 99):
            with self.assertRaises(HTTPException) as error:
                store_strength_note(store, activity_id, StrengthNote(title="Силовая"))
            self.assertEqual(error.exception.status_code, 404)
        self.assertNotIn("strength_notes", store)
        with self.assertRaises(ValidationError):
            StrengthNote(title="  ")
