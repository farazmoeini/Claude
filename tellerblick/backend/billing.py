"""Subscription status. The app buys through Apple/Google via RevenueCat; the server never trusts the
client and asks RevenueCat directly (cached for 10 minutes, invalidated by webhook)."""
from __future__ import annotations

import time
from datetime import datetime, timezone

import config
import db

CACHE_SECONDS = 600


def _rc_entitlement_expiry(user_id: str) -> tuple[bool, str | None]:
    import httpx

    r = httpx.get(f"https://api.revenuecat.com/v1/subscribers/{user_id}",
                  headers={"Authorization": f"Bearer {config.REVENUECAT_SECRET_KEY}"}, timeout=10)
    r.raise_for_status()
    ent = (r.json().get("subscriber") or {}).get("entitlements", {}).get(config.ENTITLEMENT_ID)
    if not ent:
        return False, None
    exp = ent.get("expires_date")
    if exp is None:  # lifetime purchase
        return True, None
    active = datetime.fromisoformat(exp.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    return active, exp


def is_premium(user: dict, force: bool = False) -> bool:
    if config.BILLING_MODE == "off":
        return True
    if config.BILLING_MODE != "revenuecat" or not config.REVENUECAT_SECRET_KEY:
        return False
    fresh = time.time() - (user.get("premium_checked") or 0) < CACHE_SECONDS
    if fresh and not force:
        return user.get("premium_until") in ("lifetime",) or bool(
            user.get("premium_until") and user["premium_until"] > datetime.now(timezone.utc).isoformat())
    try:
        active, exp = _rc_entitlement_expiry(user["id"])
    except Exception:
        # RevenueCat unreachable: keep the last known state rather than locking paying users out
        return bool(user.get("premium_until")) and (
            user["premium_until"] == "lifetime" or user["premium_until"] > datetime.now(timezone.utc).isoformat())
    until = ("lifetime" if active and exp is None else exp) if active else None
    db.run("UPDATE users SET premium_until = ?, premium_checked = ? WHERE id = ?", (until, time.time(), user["id"]))
    user["premium_until"], user["premium_checked"] = until, time.time()
    return active


def invalidate(user_id: str) -> None:
    db.run("UPDATE users SET premium_checked = 0 WHERE id = ?", (user_id,))
