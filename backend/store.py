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

    def register_user(self, email: str, password_hash: str) -> str | None:
        user_id = secrets.token_urlsafe(18)
        with self.transaction() as connection:
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

    def create_session(self, user_id: str, token_hash: str, expires_at: str) -> None:
        with self.transaction() as connection:
            connection.execute(
                f"INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ({self.json_parameter()}, {self.json_parameter()}, {self.json_parameter()})",
                (token_hash, user_id, expires_at),
            )

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

    def update_activity_detail(
        self, user_id: str, activity_id: str, detail: dict, callback: Callable[[dict], None],
    ) -> dict:
        mark = self.json_parameter()
        detail = dict(detail)
        track_failed = detail.pop("track_refresh_failed", False)
        with self.transaction() as connection:
            self._update_user_data(connection, user_id, callback)
            if track_failed:
                row = connection.execute(
                    f"SELECT payload FROM activity_details WHERE user_id = {mark} AND activity_id = {mark}",
                    (user_id, activity_id),
                ).fetchone()
                previous = json.loads(row[0]) if row else {}
                if previous.get("points") or previous.get("route"):
                    for field in ("points", "route", "sample_count", "track_available"):
                        if field in previous:
                            detail[field] = previous[field]
                    detail["track_message"] = "Не удалось обновить трек. Показана сохранённая запись."
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
