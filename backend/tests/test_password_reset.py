import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import httpx

from password_reset import RECOVERY_OWNER_EMAIL, reset_origin, send_reset_email
from settings import settings
from store import Database


class PasswordResetTests(unittest.TestCase):
    def test_expired_and_used_links_cannot_change_password_and_sessions_are_revoked(self):
        with TemporaryDirectory() as directory:
            db = Database("", Path(directory) / "test.sqlite3")
            first = db.register_user("first@example.org", "old")
            second = db.register_user("second@example.org", "second")
            db.create_session(first, "session-first", "2099")
            db.create_session(second, "session-second", "2099")
            db.create_password_reset(first, "expired", 10, 100)
            self.assertFalse(db.reset_password(first, "expired", 100, "expired-password"))
            db.create_password_reset(first, "valid", 100, 200)
            db.create_password_reset(first, "another", 100, 200)
            db.create_password_reset(second, "unrelated", 100, 200)

            self.assertEqual(db.password_reset_user("valid", 101), first)
            self.assertFalse(db.reset_password(second, "valid", 101, "wrong-account"))
            self.assertTrue(db.reset_password(first, "valid", 101, "new"))
            self.assertEqual(db.find_user("first@example.org"), (first, "new"))
            self.assertIsNone(db.session_user("session-first", "2026"))
            self.assertIsNotNone(db.session_user("session-second", "2026"))
            self.assertFalse(db.create_session(first, "stale", "2099", verified_password_hash="old"))
            self.assertTrue(db.create_session(first, "fresh", "2099", verified_password_hash="new"))
            self.assertFalse(db.reset_password(first, "valid", 102, "replayed"))
            self.assertIsNone(db.password_reset_user("another", 102))
            self.assertEqual(db.password_reset_user("unrelated", 102), second)

    def test_simultaneous_submissions_only_allow_one_change(self):
        with TemporaryDirectory() as directory:
            db = Database("", Path(directory) / "test.sqlite3")
            user = db.register_user("runner@example.org", "old")
            for token in ("first", "second"):
                db.create_password_reset(user, token, 100, 200)
            with ThreadPoolExecutor(max_workers=2) as workers:
                results = list(workers.map(
                    lambda token: db.reset_password(user, token, 101, "new"),
                    ("first", "second"),
                ))
            self.assertCountEqual(results, [True, False])

    def test_only_owner_who_completed_reset_can_manage_recovery(self):
        with TemporaryDirectory() as directory:
            db = Database("", Path(directory) / "test.sqlite3")
            owner = db.register_user(RECOVERY_OWNER_EMAIL, "old")
            colleague = db.register_user("colleague@example.org", "old")
            self.assertFalse(db.is_recovery_owner(owner))
            db.create_password_reset(colleague, "manual-link", 100, 200)
            self.assertTrue(db.reset_password(colleague, "manual-link", 101, "new", owner_email=RECOVERY_OWNER_EMAIL))
            self.assertFalse(db.is_recovery_owner(colleague))
            db.create_password_reset(owner, "email-link", 100, 200)
            self.assertTrue(db.reset_password(owner, "email-link", 101, "new", owner_email=RECOVERY_OWNER_EMAIL))
            self.assertTrue(db.is_recovery_owner(owner))
            self.assertEqual(db.list_user_emails(after=RECOVERY_OWNER_EMAIL, limit=50), ["colleague@example.org"])

    def test_mail_uses_configured_sender_and_reset_link(self):
        config = replace(
            settings, app_origin="https://dashboard.example.org/",
            password_reset_from="noreply@example.org", resend_api_key="test",
        )
        request = httpx.Request("POST", "https://api.resend.com/emails")
        with patch("password_reset.settings", config), patch(
            "password_reset.httpx.post", return_value=httpx.Response(200, request=request),
        ) as post:
            origin = reset_origin()
            self.assertEqual(origin, "https://dashboard.example.org")
            link = f"{origin}/#reset-password=mock-token"
            send_reset_email("runner@example.org", link)
            payload = post.call_args.kwargs["json"]
            self.assertIn(link, payload["text"])
            self.assertEqual(payload["from"], "noreply@example.org")
            self.assertEqual(payload["to"], ["runner@example.org"])
