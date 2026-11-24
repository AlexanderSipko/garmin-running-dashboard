"""Origin checks and validation responses for requests carrying account secrets."""

from fastapi import HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from settings import settings


def check_origin(request):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
        same_origin = f"{request.url.scheme}://{request.headers.get('host')}"
        if origin != same_origin and origin != settings.app_origin:
            raise HTTPException(403, "Запрос с другого сайта.")


async def validation_error(request: Request, exc: RequestValidationError):
    path = request.url.path.rstrip("/")
    if path in {"/api/account/register", "/api/account/login"} or path.startswith("/api/account/keys/"):
        # FastAPI validation details may include the rejected password or API key.
        return JSONResponse({"detail": "Проверь введённые данные."}, status_code=422)
    return await request_validation_exception_handler(request, exc)
