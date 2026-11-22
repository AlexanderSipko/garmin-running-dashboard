from __future__ import annotations

import ssl
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from settings import settings


class GigaChatError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class GigaChatClient:
    """Small REST client with cached GigaChat OAuth access tokens."""

    oauth_url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    api_url = "https://api.giga.chat/v1/chat/completions"

    def __init__(self, auth_key: str | None = None) -> None:
        self.auth_key = settings.gigachat_auth_key if auth_key is None else auth_key
        self.scope = settings.gigachat_scope
        self.model = settings.gigachat_model
        self.ca_bundle = settings.gigachat_ca_bundle
        if not self.ca_bundle and os.environ.get("VERCEL"):
            self.ca_bundle = str(Path(__file__).with_name("certs") / "russian_trusted_root_ca_pem.crt")
        self.ca_bundle_missing = bool(
            self.ca_bundle and not Path(self.ca_bundle).is_file()
        )
        self.verify: bool | ssl.SSLContext = True
        if self.ca_bundle and not self.ca_bundle_missing:
            self.verify = ssl.create_default_context()
            self.verify.load_verify_locations(cafile=self.ca_bundle)
            root_bundle = Path(self.ca_bundle)
            if root_bundle.name == "russian_trusted_root_ca_pem.crt":
                issuing_bundle = root_bundle.with_name(
                    "russian_trusted_sub_ca_pem.crt"
                )
                if issuing_bundle.is_file():
                    self.verify.load_verify_locations(cafile=issuing_bundle)
        self._access_token = ""
        self._token_expires_at = 0.0
        self._token_lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.auth_key)

    def complete(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
    ) -> dict[str, Any]:
        token = self._get_access_token()
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        try:
            response = httpx.post(
                self.api_url,
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
                timeout=45,
                verify=self.verify,
            )
        except httpx.RequestError as exc:
            raise GigaChatError(
                f"GigaChat connection failed ({type(exc).__name__})"
            ) from None

        if not response.is_success:
            raise self._response_error(response)

        try:
            return response.json()
        except ValueError:
            raise GigaChatError("GigaChat returned invalid JSON") from None

    def check_credentials(self) -> None:
        self._get_access_token()

    def _get_access_token(self) -> str:
        if not self.auth_key:
            raise GigaChatError("GIGACHAT_AUTH_KEY is not configured")
        if self.ca_bundle_missing:
            raise GigaChatError(
                "GigaChat CA certificate file is missing",
                code="ca_bundle_missing",
            )

        if self._access_token and time.monotonic() < self._token_expires_at:
            return self._access_token

        with self._token_lock:
            if self._access_token and time.monotonic() < self._token_expires_at:
                return self._access_token

            auth_key = self.auth_key
            authorization = (
                auth_key if auth_key.lower().startswith("basic ") else f"Basic {auth_key}"
            )
            try:
                response = httpx.post(
                    self.oauth_url,
                    headers={
                        "Authorization": authorization,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json",
                        "RqUID": str(uuid.uuid4()),
                    },
                    data={"scope": self.scope},
                    timeout=25,
                    verify=self.verify,
                )
            except httpx.RequestError as exc:
                raise GigaChatError(
                    f"GigaChat OAuth connection failed ({type(exc).__name__})"
                ) from None

            if not response.is_success:
                raise self._response_error(response)

            try:
                result = response.json()
                access_token = str(result["access_token"])
                expires_at = float(result.get("expires_at", time.time() + 1800))
            except (KeyError, TypeError, ValueError):
                raise GigaChatError("GigaChat OAuth returned an invalid token response") from None

            self._access_token = access_token
            # Refresh one minute before the documented 30-minute expiration.
            self._token_expires_at = time.monotonic() + max(
                0.0, expires_at - time.time() - 60
            )
            return self._access_token

    @staticmethod
    def _response_error(response: httpx.Response) -> GigaChatError:
        code = None
        try:
            body = response.json()
            details = body.get("error", body) if isinstance(body, dict) else {}
            if isinstance(details, dict):
                code = details.get("code") or details.get("type")
        except ValueError:
            pass

        return GigaChatError(
            "GigaChat API request failed",
            status_code=response.status_code,
            code=str(code) if code else None,
        )
