import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

from store import Database


class AuthAttemptsTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "test.sqlite3"
        self.database = Database("", self.path)
        self.database.ensure_ready()

    def test_limit_is_shared_across_instances_and_expires(self):
        second_instance = Database("", self.path)
        self.assertEqual(self.attempt(self.database, "register:one", 100), 0)
        self.assertEqual(self.attempt(second_instance, "register:one", 110), 0)
        self.assertEqual(self.attempt(second_instance, "register:one", 120), 40)
        self.assertEqual(self.attempt(self.database, "register:one", 159), 1)
        self.assertEqual(self.attempt(self.database, "register:one", 160), 0)
        self.assertEqual(self.attempt(self.database, "login:one", 160), 0)
        self.assertEqual(self.attempt(self.database, "register:two", 160), 0)

    def test_concurrent_requests_cannot_exceed_limit(self):
        with ThreadPoolExecutor(max_workers=8) as workers:
            waits = list(workers.map(
                lambda _: self.attempt(self.database, "register:one", 100),
                range(12),
            ))
        self.assertEqual(waits.count(0), 2)
        self.assertEqual(waits.count(60), 10)

    @staticmethod
    def attempt(database, bucket, now):
        return database.consume_auth_attempt(bucket, now=now, window=60, limit=2)
