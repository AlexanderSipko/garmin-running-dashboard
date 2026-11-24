"""Send password recovery links through the configured transactional mail service."""

import logging
from urllib.parse import urlsplit

import httpx

from settings import settings

RESET_TTL_SECONDS = 30 * 60
RECOVERY_OWNER_EMAIL = "avsipko@gmail.com"
logger = logging.getLogger(__name__)


def reset_origin(*, require_mail: bool = True) -> str | None:
    origin = settings.app_origin.rstrip("/")
    if not origin or (require_mail and not (settings.resend_api_key and settings.password_reset_from)):
        return None
    url = urlsplit(origin)
    if url.path or url.query or url.fragment or not url.hostname or url.username or url.password:
        return None
    if url.scheme == "https" or (url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}):
        return origin
    return None


def send_reset_email(email: str, link: str) -> None:
    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.password_reset_from,
                "to": [email],
                "subject": "Сброс пароля Garmin-дашборда",
                "text": (
                    "Чтобы задать новый пароль, открой ссылку в течение 30 минут:\n\n"
                    f"{link}\n\nЕсли ты не запрашивал смену пароля, проигнорируй письмо."
                ),
            },
            timeout=8,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        logger.warning("Password recovery email rejected by provider (HTTP %d)", error.response.status_code)
    except httpx.RequestError:
        logger.warning("Password recovery email provider unavailable")
