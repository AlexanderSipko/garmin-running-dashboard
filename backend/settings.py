"""Environment-backed application settings with safe development defaults."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path


def _value(name: str, default: str = "") -> str:
    value = os.environ.get(name, "").strip()
    return value or default


def _enabled(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    garmin_personal_api_key: str = field(repr=False)
    garmin_bearer_token_cache: Path
    garmin_data_file: Path
    database_url: str = field(repr=False)
    app_origin: str
    secrets_encryption_key: str = field(repr=False)
    garmin_api_timeout_seconds: float
    garmin_activity_timeout_seconds: float
    coach_enabled: bool
    gigachat_auth_key: str = field(repr=False)
    gigachat_scope: str
    gigachat_model: str
    gigachat_ca_bundle: str
    mcp_server_path: Path
    python_executable: str

    def garmin_mcp_environment(self) -> dict[str, str]:
        network_settings = (
            "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
            "http_proxy", "https_proxy", "all_proxy", "no_proxy",
            "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
        )
        return {
            **{name: os.environ[name] for name in network_settings if name in os.environ},
            "GARMIN_PERSONAL_API_KEY": self.garmin_personal_api_key,
            "GARMIN_BEARER_TOKEN_CACHE": str(self.garmin_bearer_token_cache),
        }


settings = Settings(
    garmin_personal_api_key=_value("GARMIN_PERSONAL_API_KEY"),
    garmin_bearer_token_cache=Path(
        _value("GARMIN_BEARER_TOKEN_CACHE", "/app/data/garmin-bearer-token.json")
    ),
    garmin_data_file=Path(_value("GARMIN_DATA_FILE", "data/dashboard.json")),
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
    coach_enabled=_enabled("COACH_ENABLED", default=False),
    gigachat_auth_key=_value("GIGACHAT_AUTH_KEY"),
    gigachat_scope=_value("GIGACHAT_SCOPE", "GIGACHAT_API_PERS"),
    gigachat_model=_value("GIGACHAT_MODEL", "GigaChat-2"),
    gigachat_ca_bundle=_value("GIGACHAT_CA_BUNDLE"),
    mcp_server_path=Path(__file__).with_name("garmin_mcp_server.py"),
    python_executable=sys.executable,
)
