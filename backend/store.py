"""Small database layer with SQLite for local runs and PostgreSQL for hosting."""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import threading
from contextlib import contextmanager, closing
from pathlib import Path
from typing import Callable
from datetime import date
from time import time

from activity_retention import TRACK_FIELDS, archive_expired_track, retention_cutoff, stamp_fresh_track
from dashboard_data import parse_date


MAX_USERS = 3


class RegistrationLimitReached(Exception):
    pass


class Database:
    def __init__(self, url: str, sqlite_path: Path) -> None:
        self.url = url
        self.sqlite_path = sqlite_path
        self.is_postgres = url.startswith(("postgres://", "postgresql://"))
        self._ready = False
        self._init_lock = threading.Lock()

    def connect(self):
        if self.is_postgres:
            import psycopg
            return psycopg.connect(self.url, connect_timeout=5)
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.sqlite_path, timeout=30)
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    @contextmanager
    def transaction(self):
        self.ensure_ready()
        with self._raw_transaction() as connection:
            yield connection

    @contextmanager
    def _raw_transaction(self):
        with closing(self.connect()) as connection, connection:
            yield connection

    def ensure_ready(self) -> None:
        if self._ready:
            return
        with self._init_lock:
            if not self._ready:
                self._initialize()
                self._ready = True

    def _initialize(self) -> None:
        if (self.url and not self.is_postgres) or (os.environ.get("VERCEL") and not self.is_postgres):
            raise ValueError("PostgreSQL DATABASE_URL is required")
        with self._raw_transaction() as connection:
            if self.is_postgres:
                connection.execute("SELECT pg_advisory_xact_lock(629438001)")
            connection.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, garmin_key TEXT, ai_key TEXT)")
            connection.execute("""
                CREATE TABLE IF NOT EXISTS coach_settings (
                    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    openai_key TEXT,
                    provider TEXT NOT NULL DEFAULT 'gigachat'
                )
            """)
            connection.execute("CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, payload TEXT NOT NULL DEFAULT '{}')")

            connection.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)")
            connection.execute("""
                CREATE TABLE IF NOT EXISTS activity_details (
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    activity_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (user_id, activity_id)
                )
            """)

            connection.execute("""
                CREATE TABLE IF NOT EXISTS auth_attempts (
                    bucket_key TEXT PRIMARY KEY,
                    attempts INTEGER NOT NULL,
                    expires_at BIGINT NOT NULL
                )
            """)
            connection.execute(
                "CREATE INDEX IF NOT EXISTS auth_attempts_expiration ON auth_attempts (expires_at)"
            )

            connection.execute("""
                CREATE TABLE IF NOT EXISTS password_resets (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at BIGINT NOT NULL
                )
            """)
            connection.execute("CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets (user_id)")

            connection.execute("""
                CREATE TABLE IF NOT EXISTS recovery_owners (
                    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
                )
            """)

    def database_size_bytes(self) -> int:
        with self.transaction() as connection:
            if self.is_postgres:
                size, = connection.execute("SELECT pg_database_size(current_database())").fetchone()
                return size
            pages, = connection.execute("PRAGMA page_count").fetchone()
            page_size, = connection.execute("PRAGMA page_size").fetchone()
            return pages * page_size

    def is_recovery_owner(self, user_id: str) -> bool:
        with self.transaction() as connection:
            row = connection.execute(
                f"SELECT 1 FROM recovery_owners WHERE user_id = {self.json_parameter()}", (user_id,)
            ).fetchone()
        return row is not None

    def list_user_emails(self, *, after: str, limit: int) -> list[str]:
        mark = self.json_parameter()
        with self.transaction() as connection:
            rows = connection.execute(
                f"SELECT email FROM users WHERE email > {mark} ORDER BY email LIMIT {mark}",
                (after, limit),
            ).fetchall()
        return [row[0] for row in rows]

    def create_password_reset(self, user_id: str, token_hash: str, now: int, expires_at: int) -> None:
        mark = self.json_parameter()
        with self.transaction() as connection:
            self._lock_account(connection, user_id)
            connection.execute(
                f"DELETE FROM password_resets WHERE user_id = {mark} AND expires_at <= {mark}",
                (user_id, now),
            )
            connection.execute(
                f"INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ({mark}, {mark}, {mark})",
                (user_id, token_hash, expires_at),
            )

    def password_reset_user(self, token_hash: str, now: int) -> str | None:
        mark = self.json_parameter()
        with self.transaction() as connection:
            row = connection.execute(
                f"SELECT user_id FROM password_resets WHERE token_hash = {mark} AND expires_at > {mark}",
                (token_hash, now),
            ).fetchone()
        return row[0] if row else None

    def reset_password(
        self, user_id: str, token_hash: str, now: int, password_hash: str, *, owner_email: str = "",
    ) -> bool:
        mark = self.json_parameter()
        with self.transaction() as connection:
            self._lock_account(connection, user_id)
            used = connection.execute(
                f"DELETE FROM password_resets WHERE token_hash = {mark} AND user_id = {mark} "
                f"AND expires_at > {mark} RETURNING user_id",
                (token_hash, user_id, now),
            ).fetchone()
            if not used:
                return False
            connection.execute(f"UPDATE users SET password_hash = {mark} WHERE id = {mark}", (password_hash, user_id))
            if owner_email:
                connection.execute(
                    f"INSERT INTO recovery_owners (user_id) SELECT id FROM users WHERE id = {mark} "
                    f"AND email = {mark} ON CONFLICT (user_id) DO NOTHING",
                    (user_id, owner_email),
                )
            connection.execute(f"DELETE FROM sessions WHERE user_id = {mark}", (user_id,))
            connection.execute(f"DELETE FROM password_resets WHERE user_id = {mark}", (user_id,))
        return True

    def _lock_account(self, connection, user_id: str) -> None:
        if self.is_postgres:
            connection.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user_id,)).fetchone()
        else:
            connection.execute("BEGIN IMMEDIATE")

    def consume_auth_attempt(
        self, bucket_key: str, *, now: int, window: int, limit: int,
    ) -> int:
        """Reserve an attempt atomically. Return the wait in seconds if the bucket is full."""
        mark = self.json_parameter()
        with self.transaction() as connection:
            connection.execute(f"DELETE FROM auth_attempts WHERE expires_at <= {mark}", (now,))
            accepted = connection.execute(
                f"""
                INSERT INTO auth_attempts (bucket_key, attempts, expires_at)
                VALUES ({mark}, 1, {mark})
                ON CONFLICT (bucket_key) DO UPDATE
                SET attempts = auth_attempts.attempts + 1
                WHERE auth_attempts.attempts < {mark}
                RETURNING bucket_key
                """,
                (bucket_key, now + window, limit),
            ).fetchone()
            if accepted:
                return 0
            expires_at, = connection.execute(
                f"SELECT expires_at FROM auth_attempts WHERE bucket_key = {mark}", (bucket_key,)
            ).fetchone()
            return max(1, expires_at - now)

    def register_user(self, email: str, password_hash: str) -> str | None:
        user_id = secrets.token_urlsafe(18)
        with self.transaction() as connection:
            # Serialize the capacity check with account creation across workers.
            if self.is_postgres:
                connection.execute("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE")
            else:
                connection.execute("BEGIN IMMEDIATE")
            count, = connection.execute("SELECT COUNT(*) FROM users").fetchone()
            if count >= MAX_USERS:
                existing = connection.execute(
                    f"SELECT 1 FROM users WHERE email = {self.json_parameter()}", (email,),
                ).fetchone()
                if existing:
                    return None
                raise RegistrationLimitReached()
            result = connection.execute(
                f"INSERT INTO users (id, email, password_hash, created_at) VALUES ({self.json_parameter()}, {self.json_parameter()}, {self.json_parameter()}, CURRENT_TIMESTAMP) ON CONFLICT (email) DO NOTHING",
                (user_id, email, password_hash),
            )
            if result.rowcount == 0:
                return None
            connection.execute(
                f"INSERT INTO user_data (user_id, payload) VALUES ({self.json_parameter()}, '{{}}')",
                (user_id,),
            )
        return user_id

    def find_user(self, email: str):
        with self.transaction() as connection:
            return connection.execute(
                f"SELECT id, password_hash FROM users WHERE email = {self.json_parameter()}",
                (email,),
            ).fetchone()

    def create_session(
        self, user_id: str, token_hash: str, expires_at: str, *, verified_password_hash: str | None = None,
    ) -> bool:
        with self.transaction() as connection:
            if verified_password_hash is not None:
                self._lock_account(connection, user_id)
                row = connection.execute(
                    f"SELECT password_hash FROM users WHERE id = {self.json_parameter()}", (user_id,)
                ).fetchone()
                if row != (verified_password_hash,):
                    return False
            connection.execute(
                f"INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ({self.json_parameter()}, {self.json_parameter()}, {self.json_parameter()})",
                (token_hash, user_id, expires_at),
            )
        return True

    def session_user(self, token_hash: str, now: str):
        with self.transaction() as connection:
            return connection.execute(
                f"SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = {self.json_parameter()} AND expires_at > {self.json_parameter()}",
                (token_hash, now),
            ).fetchone()

    def delete_session(self, token_hash: str) -> None:
        with self.transaction() as connection:
            connection.execute(f"DELETE FROM sessions WHERE token_hash = {self.json_parameter()}", (token_hash,))

    def json_parameter(self) -> str:
        return "%s" if self.is_postgres else "?"

    def keys(self, user_id: str):
        mark = self.json_parameter()
        with self.transaction() as connection:
            return connection.execute(
                f"SELECT garmin_key, ai_key FROM user_settings WHERE user_id = {mark}",
                (user_id,),
            ).fetchone() or (None, None)

    def save_key(self, user_id: str, provider: str, value: str | None) -> None:
        column = {"garmin": "garmin_key", "ai": "ai_key"}[provider]
        mark = self.json_parameter()
        with self.transaction() as connection:
            connection.execute(
                f"INSERT INTO user_settings (user_id, {column}) VALUES ({mark}, {mark}) "
                f"ON CONFLICT (user_id) DO UPDATE SET {column} = excluded.{column}",
                (user_id, value),
            )

    def coach_settings(self, user_id: str):
        mark = self.json_parameter()
        with self.transaction() as connection:
            return connection.execute(
                f"SELECT provider, openai_key FROM coach_settings WHERE user_id = {mark}", (user_id,),
            ).fetchone() or ("gigachat", None)

    def save_coach_setting(self, user_id: str, field: str, value: str | None):
        column = {"provider": "provider", "openai_key": "openai_key"}[field]
        mark = self.json_parameter()
        with self.transaction() as connection:
            connection.execute(
                f"INSERT INTO coach_settings (user_id, {column}) VALUES ({mark}, {mark}) "
                f"ON CONFLICT (user_id) DO UPDATE SET {column} = excluded.{column}",
                (user_id, value),
            )

    def read(self, user_id: str) -> dict:
        mark = self.json_parameter()
        with self.transaction() as connection:
            row = connection.execute(
                f"SELECT payload FROM user_data WHERE user_id = {mark}", (user_id,)
            ).fetchone()
        return json.loads(row[0]) if row else {}

    def read_activity_detail(self, user_id: str, activity_id: str) -> dict | None:
        mark = self.json_parameter()
        with self.transaction() as connection:
            row = connection.execute(
                f"SELECT payload FROM activity_details WHERE user_id = {mark} AND activity_id = {mark}",
                (user_id, activity_id),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def read_activity_details(self, user_id: str, activity_ids: list[str]) -> dict[str, dict]:
        if not activity_ids:
            return {}
        mark = self.json_parameter()
        details = {}
        with self.transaction() as connection:
            for offset in range(0, len(activity_ids), 300):
                batch = activity_ids[offset:offset + 300]
                placeholders = ", ".join([mark] * len(batch))
                rows = connection.execute(
                    f"SELECT activity_id, payload FROM activity_details WHERE user_id = {mark} "
                    f"AND activity_id IN ({placeholders})",
                    (user_id, *batch),
                )
                details.update((activity_id, json.loads(payload)) for activity_id, payload in rows)
        return details

    def prune_old_activity_tracks(self, user_id: str, today: date) -> None:
        day_key = today.isoformat()
        cutoff = retention_cutoff(today)
        mark = self.json_parameter()

        with self.transaction() as connection:
            def prune(store):
                if store.get("activity_tracks_pruned_on") == day_key:
                    return
                old_ids = [
                    str(row["id"]) for row in store.get("activities", [])
                    if row.get("id") and (day := parse_date(row.get("start_time"))) and day < cutoff
                ]
                now = time()
                for offset in range(0, len(old_ids), 300):
                    batch = old_ids[offset:offset + 300]
                    placeholders = ", ".join([mark] * len(batch))
                    rows = connection.execute(
                        f"SELECT activity_id, payload FROM activity_details WHERE user_id = {mark} "
                        f"AND activity_id IN ({placeholders})",
                        (user_id, *batch),
                    ).fetchall()
                    for activity_id, payload in rows:
                        detail = json.loads(payload)
                        archived = archive_expired_track(detail, now)
                        if archived is not detail:
                            connection.execute(
                                f"UPDATE activity_details SET payload = {mark} WHERE user_id = {mark} AND activity_id = {mark}",
                                (json.dumps(archived, ensure_ascii=False), user_id, activity_id),
                            )
                store["activity_tracks_pruned_on"] = day_key

            self._update_user_data(connection, user_id, prune)

    def update_activity_detail(
        self, user_id: str, activity_id: str, detail: dict, callback: Callable[[dict], None],
    ) -> dict:
        mark = self.json_parameter()
        detail = dict(detail)
        track_failed = detail.pop("track_refresh_failed", False)
        with self.transaction() as connection:
            self._update_user_data(connection, user_id, callback)
            if track_failed or not detail.get("heart_rate_seconds_by_bpm"):
                row = connection.execute(
                    f"SELECT payload FROM activity_details WHERE user_id = {mark} AND activity_id = {mark}",
                    (user_id, activity_id),
                ).fetchone()
                previous = json.loads(row[0]) if row else {}
                if track_failed:
                    detail.pop("heart_rate_seconds_by_bpm", None)
                    for field in (*TRACK_FIELDS, "track_cached_at", "track_archived", "running_power",
                                  "running_power_seconds_by_watt"):
                        if field in previous:
                            detail[field] = previous[field]
                    if previous.get("points") or previous.get("route"):
                        detail["track_message"] = "Не удалось обновить трек. Показана сохранённая запись."
                if previous.get("heart_rate_seconds_by_bpm") and not detail.get("heart_rate_seconds_by_bpm"):
                    detail["heart_rate_seconds_by_bpm"] = previous["heart_rate_seconds_by_bpm"]
                    if "heart_rate_source" in previous:
                        detail["heart_rate_source"] = previous["heart_rate_source"]
            if not track_failed:
                stamp_fresh_track(detail, time())
            connection.execute(
                f"INSERT INTO activity_details (user_id, activity_id, payload) VALUES ({mark}, {mark}, {mark}) "
                "ON CONFLICT (user_id, activity_id) DO UPDATE SET payload = excluded.payload",
                (user_id, activity_id, json.dumps(detail, ensure_ascii=False)),
            )

        return detail

    def update(self, user_id: str, callback: Callable[[dict], None]) -> None:
        with self.transaction() as connection:
            self._update_user_data(connection, user_id, callback)

    def _update_user_data(self, connection, user_id: str, callback: Callable[[dict], None]) -> None:
        mark = self.json_parameter()
        if not self.is_postgres:
            connection.execute("BEGIN IMMEDIATE")
        lock = " FOR UPDATE" if self.is_postgres else ""
        row = connection.execute(
            f"SELECT payload FROM user_data WHERE user_id = {mark}{lock}", (user_id,)
        ).fetchone()
        data = json.loads(row[0])
        callback(data)
        connection.execute(
            f"UPDATE user_data SET payload = {mark} WHERE user_id = {mark}",
            (json.dumps(data, ensure_ascii=False), user_id),
        )
