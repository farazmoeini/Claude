"""Password hashing (scrypt), signed tokens (HMAC-SHA256), login rate limiting. Standard library only."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request

import config
import db

# ---------------------------------------------------------------- passwords
_N, _R, _P = 2 ** 14, 8, 1


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, dk = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got.hex(), dk)
    except Exception:
        return False


# ---------------------------------------------------------------- signed tokens
def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    mac = hmac.new(config.SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(mac)}"


def unsign(token: str) -> dict | None:
    try:
        body, mac = token.split(".")
        want = hmac.new(config.SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64(want), mac):
            return None
        data = json.loads(_unb64(body))
        return data if data.get("exp", 0) > time.time() else None
    except Exception:
        return None


def login_token(user: dict) -> str:
    return sign({"uid": user["id"], "v": user["token_version"], "exp": int(time.time() + config.TOKEN_DAYS * 86400)})


def current_user(authorization: str = Header(default="")) -> dict:
    tok = authorization.removeprefix("Bearer ").strip()
    data = unsign(tok) if tok else None
    user = db.one("SELECT * FROM users WHERE id = ?", (data["uid"],)) if data and "uid" in data else None
    if not user or user["token_version"] != data.get("v"):
        raise HTTPException(401, "Bitte erneut anmelden.")
    return user


def photo_url(name: str, hours: int = 24) -> str:
    if not name:
        return ""
    exp = int(time.time() + hours * 3600)
    sig = sign({"p": name, "exp": exp})
    return f"/photos/{name}?t={sig}"


def check_photo(name: str, t: str) -> bool:
    data = unsign(t)
    return bool(data and data.get("p") == name)


# ---------------------------------------------------------------- rate limiting (per process)
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request, key: str, limit: int, per_seconds: int) -> None:
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "?")
    q = _hits[f"{key}:{ip}"]
    now = time.time()
    while q and q[0] < now - per_seconds:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Zu viele Versuche – bitte kurz warten.")
    q.append(now)
