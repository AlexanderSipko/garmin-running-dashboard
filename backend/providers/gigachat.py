from __future__ import annotations

import json
import ssl
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from settings import settings
from coach_usage import TokenUsage
from coach_presets import DEFAULT_GIGACHAT_PRESET, normalize_coach_preset


GIGACHAT_PRESETS = {
    "gigachat-max": "GigaChat-2-Max",
    "gigachat-ultra": "GigaChat-3-Ultra",
}


class GigaChatError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class GigaChatClient:
    """Small REST client with cached GigaChat OAuth access tokens."""

    oauth_url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    api_url = "https://api.giga.chat/v1/chat/completions"

    def __init__(self, auth_key: str, preset: str = DEFAULT_GIGACHAT_PRESET) -> None:
        self.auth_key = auth_key
        self.usage = TokenUsage()
        self.scope = settings.gigachat_scope
        self.model = GIGACHAT_PRESETS.get(normalize_coach_preset(preset), GIGACHAT_PRESETS[DEFAULT_GIGACHAT_PRESET])
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
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float,
        *,
        functions: list[dict] | None = None,
        function_call: str = "auto",
        timeout: float = 45,
        auth_timeout: float = 25,
    ) -> dict[str, Any]:
        token = self._get_access_token(timeout=auth_timeout)
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        if functions:
            payload["functions"] = functions
            payload["function_call"] = function_call

        try:
            response = httpx.post(
                self.api_url,
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
                timeout=timeout,
                verify=self.verify,
            )
        except httpx.RequestError as exc:
            raise GigaChatError(
                f"GigaChat connection failed ({type(exc).__name__})"
            ) from None

        if not response.is_success:
            raise self._response_error(response)

        try:
            payload = response.json()
        except ValueError:
            raise GigaChatError("GigaChat returned invalid JSON") from None
        self.usage.record(payload.get("usage") or {}, input_key="prompt_tokens", output_key="completion_tokens")
        return payload

    def complete_with_tools(self, messages, max_tokens, temperature, tools):
        functions = tools.discover()
        chat_limits = {"timeout": 13, "auth_timeout": 10}
        def plain_reply():
            return self.complete(messages, max_tokens, temperature, **chat_limits)

        def with_functions(turns, **options):
            return self.complete(turns, max_tokens, temperature, functions=functions, **chat_limits, **options)

        try:
            return self._complete_tool_turn(messages, functions, tools, with_functions)
        except GigaChatError as exc:
            if exc.code != "functions_unsupported" and exc.status_code != 422:
                raise
            return plain_reply()

    def _complete_tool_turn(self, messages, functions, tools, with_functions):
        response = with_functions(messages)
        choices = response.get("choices") or []
        turn = choices[0].get("message", {}) if choices else {}
        call = turn.get("function_call")
        if not isinstance(call, dict):
            return response

        name = call.get("name")
        arguments = call.get("arguments")
        if name not in {tool["name"] for tool in functions} or not isinstance(arguments, dict):
            return with_functions(messages, function_call="none")

        try:
            result = tools.call(name, arguments)
        except Exception:
            result = {"error": "Инструмент Garmin временно недоступен."}
        assistant_turn = {"role": "assistant", "content": turn.get("content") or "", "function_call": call}
        if turn.get("functions_state_id"):
            assistant_turn["functions_state_id"] = turn["functions_state_id"]

        return with_functions([
            *messages,
            assistant_turn,
            {"role": "function", "name": name, "content": json.dumps(result, ensure_ascii=False, separators=(",", ":"))},
        ], function_call="none")

    def token_balance(self) -> list[dict]:
        token = self._get_access_token(timeout=10)
        try:
            response = httpx.get(
                self.api_url.rsplit("/", 2)[0] + "/balance",
                headers={"Authorization": f"Bearer {token}", "User-Agent": "GarminRunningDashboard"},
                timeout=10, verify=self.verify,
            )
            if not response.is_success:
                raise self._response_error(response)
            rows = response.json()["balance"]
            return [{"name": str(row["usage"]), "tokens": int(row["value"])} for row in rows]
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            raise GigaChatError("Unable to read token balance") from None

    def check_credentials(self) -> None:
        self._get_access_token()

    def _get_access_token(self, timeout: float = 25) -> str:
        if not self.auth_key:
            raise GigaChatError("No GigaChat key configured for this account")
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
                    timeout=timeout,
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
                message = str(details.get("message") or "").lower()
                if "model does not support functions" in message:
                    code = "functions_unsupported"
        except ValueError:
            pass

        return GigaChatError(
            "GigaChat API request failed",
            status_code=response.status_code,
            code=str(code) if code else None,
        )
