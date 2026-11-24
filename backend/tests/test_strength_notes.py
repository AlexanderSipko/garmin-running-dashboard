import unittest
from datetime import date

from fastapi import HTTPException
from pydantic import ValidationError

from coach_context import strength_summary
from dashboard_data import build_dashboard, merge_activities
from strength_notes import StrengthNote, get_strength_note, refresh_strength_activity, store_strength_note


class StrengthNotesTests(unittest.TestCase):
    def test_note_survives_garmin_sync_and_coach_reads_garmin_fields(self):
        activity = {"id": 42, "type": "strength_training", "start_time": date.today().isoformat(), "name": "Силовая"}
        store = {"activities": [activity], "coach_daily": {"old": "summary"}}
        note = StrengthNote(title=" Грудь и трицепс ", note=" Жим лёжа 60 кг, 3×8. ")
        store_strength_note(store, 42, note)
        store["activities"] = merge_activities(store["activities"], [{**activity, "name": "Garmin", "description": "Описание из Garmin"}])

        self.assertEqual(get_strength_note(store, 42), {"title": "Грудь и трицепс", "note": "Жим лёжа 60 кг, 3×8."})
        self.assertEqual(store["activities"][0]["name"], "Garmin")
        self.assertNotIn("coach_daily", store)
        self.assertEqual(store["review_revision"], 1)
        dashboard = build_dashboard(30, store, configured=True)
        self.assertEqual(dashboard["activities"][0]["name"], "Garmin")
        self.assertNotIn("strength_title", dashboard["activities"][0])
        self.assertNotIn("note", dashboard["activities"][0])

        result = strength_summary(store["activities"], include_details=True)
        self.assertEqual(result["sessions"], 1)
        self.assertEqual(result["recent_sessions"][0]["name"], "Garmin")
        self.assertEqual(result["recent_sessions"][0]["garmin_description"], "Описание из Garmin")
        self.assertNotIn("runner_note", result["recent_sessions"][0])

    def test_does_not_allow_writing_notes_to_runs_or_unknown_activities(self):
        store = {"activities": [{"id": 42, "type": "running"}]}
        for activity_id in (42, 99):
            with self.assertRaises(HTTPException) as error:
                store_strength_note(store, activity_id, StrengthNote(title="Силовая"))
            self.assertEqual(error.exception.status_code, 404)
        self.assertNotIn("strength_notes", store)
        with self.assertRaises(ValidationError):
            StrengthNote(title="x" * 101)

    def test_refresh_keeps_garmin_metadata_separate_from_the_runner_note(self):
        original = {"id": 42, "type": "strength_training", "name": "Старая силовая"}
        store = {"activities": [original]}
        note = StrengthNote(title="Грудь и трицепс", note="Жим 60 кг.")
        store_strength_note(store, 42, note)
        updated = refresh_strength_activity(
            store, 42, {"name": "Новое имя Garmin", "description": "Подходы из Garmin"},
        )
        self.assertEqual(updated["name"], "Новое имя Garmin")
        self.assertEqual(updated["description"], "Подходы из Garmin")
        self.assertNotIn("strength_title", updated)
        self.assertEqual(get_strength_note(store, 42), note.model_dump())

        store_strength_note(store, 42, StrengthNote(note=note.note))
        updated = refresh_strength_activity(store, 42, {"name": "Последнее имя Garmin"})
        self.assertEqual(updated["description"], "Подходы из Garmin")
        self.assertEqual(get_strength_note(store, 42)["note"], note.note)
