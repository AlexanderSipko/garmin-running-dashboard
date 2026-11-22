"""FastAPI entry point for the Vercel backend project."""

import os

if os.environ.get("VERCEL") and not os.environ.get("DATABASE_URL"):
    raise RuntimeError("Set DATABASE_URL for the Vercel backend")

from main import app
