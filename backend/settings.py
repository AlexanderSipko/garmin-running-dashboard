"""Environment-backed application settings with safe development defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _value(name: str, default: str = "") -> str:
    value = os.environ.get(name, "").strip()
    return value or default


@dataclass(frozen=True)
class Settings:
    sqlite_path: Path
    database_url: str = field(repr=False)
    app_origin: str
    secrets_encryption_key: str = field(repr=False)
    garmin_api_timeout_seconds: float
    garmin_activity_timeout_seconds: float
    gigachat_scope: str
    gigachat_model: str
    gigachat_ca_bundle: str


settings = Settings(
    sqlite_path=Path(_value("SQLITE_PATH", str(Path(__file__).parent / "data/dashboard.sqlite3"))),
    database_url=(
        _value("DATABASE_URL")
        or _value("GARMIN_DATABASE_URL")
        or _value("GARMIN_POSTGRES_URL")
        or _value("GARMIN_DATABASE_URL_UNPOOLED")
    ),
    app_origin=_value("APP_ORIGIN"),
    secrets_encryption_key=_value("SECRETS_ENCRYPTION_KEY"),
    garmin_api_timeout_seconds=25.0,
    garmin_activity_timeout_seconds=40.0,
    gigachat_scope=_value("GIGACHAT_SCOPE", "GIGACHAT_API_PERS"),
    gigachat_model=_value("GIGACHAT_MODEL", "GigaChat-2"),
    gigachat_ca_bundle=_value("GIGACHAT_CA_BUNDLE"),
)
