"""All configuration comes from environment variables (see deploy/.env.example)."""
from __future__ import annotations

import os
import secrets
from pathlib import Path


def _bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
PHOTO_DIR = DATA_DIR / "photos"
DB_PATH = DATA_DIR / "tellerblick.db"

# Signs login tokens and photo URLs. MUST be set in production, otherwise every restart logs everyone out.
SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
SECRET_KEY_IS_RANDOM = "SECRET_KEY" not in os.environ
TOKEN_DAYS = int(os.environ.get("TOKEN_DAYS", "90"))

# Public base URL, used in password-reset mails, e.g. https://api.tellerblick.app
PUBLIC_URL = os.environ.get("PUBLIC_URL", "http://localhost:8300").rstrip("/")
# Comma-separated origins allowed to call the API from a browser (the Capacitor app uses capacitor://localhost / https://localhost)
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS", "capacitor://localhost,https://localhost,http://localhost,http://localhost:8300").split(",") if o.strip()]

# Billing: "revenuecat" (production), "off" (everyone premium – local testing), "none" (nobody premium)
BILLING_MODE = os.environ.get("BILLING_MODE", "off")
REVENUECAT_SECRET_KEY = os.environ.get("REVENUECAT_SECRET_KEY", "")
REVENUECAT_WEBHOOK_AUTH = os.environ.get("REVENUECAT_WEBHOOK_AUTH", "")
ENTITLEMENT_ID = os.environ.get("ENTITLEMENT_ID", "premium")

# AI cost control
AI_MODEL = os.environ.get("TELLERBLICK_MODEL", "claude-opus-5-5")
FREE_SCANS = int(os.environ.get("FREE_SCANS", "3"))           # lifetime photo analyses for free users
DAILY_SCAN_LIMIT = int(os.environ.get("DAILY_SCAN_LIMIT", "40"))  # fair-use cap for premium users
AI_ENABLED = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))

# E-mail (password reset). Without SMTP_HOST the reset endpoint reports that mail is unavailable.
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
MAIL_FROM = os.environ.get("MAIL_FROM", "Tellerblick <noreply@example.com>")

CONSENT_VERSION = "2026-11"
DEBUG = _bool("DEBUG")
