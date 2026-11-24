import unittest
from datetime import date

from coach_history import chat_history_page


class CoachHistoryTests(unittest.TestCase):
    def test_today_uses_send_day_and_keeps_question_and_answer_together(self):
        today = date(2026, 11, 24)
        old = {"focus_date": "2026-11-23", "role": "user"}
        today_exchange = [
            {"sent_day": "2026-11-24", "focus_date": "2025-03-01", "role": role}
            for role in ("user", "assistant")
        ]
        page = chat_history_page([old, *today_exchange], today)
        self.assertEqual(page, {"messages": today_exchange, "has_history": True})

    def test_pages_follow_dates_without_duplicates_and_include_undated_history(self):
        today = date(2026, 11, 24)
        rows = [{}, *({"focus_date": f"2026-11-{day}"} for day in (19, 21, 23, 24))]
        first = chat_history_page(rows, today, today)
        self.assertEqual([group["day"] for group in first["days"]], ["2026-11-23", "2026-11-21"])
        second = chat_history_page(rows, today, date.fromisoformat(first["next_before"]))
        self.assertEqual([group["day"] for group in second["days"]], ["2026-11-19", None])
        self.assertIsNone(second["next_before"])
