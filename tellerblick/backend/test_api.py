"""Run: cd backend && python -m pytest -q"""
import io
import os
import tempfile
from datetime import date

os.environ["DATA_DIR"] = tempfile.mkdtemp()
os.environ["BILLING_MODE"] = "none"          # nobody premium -> exercises the paywall
os.environ["FREE_SCANS"] = "2"
os.environ.pop("ANTHROPIC_API_KEY", None)

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app as appmod
import auth
import config
import nutrition

c = TestClient(appmod.app)
TODAY = date.today().isoformat()
PROFILE = dict(sex="m", age=34, height_cm=182, weight_kg=88, activity="leicht", goal="abnehmen")


def user(email):
    auth._hits.clear()
    r = c.post("/api/auth/register", json=dict(email=email, password="geheim123", consent_health=True, consent_terms=True))
    assert r.status_code == 200, r.text
    h = {"Authorization": "Bearer " + r.json()["token"]}
    assert c.put("/api/profile", json=PROFILE, headers=h).status_code == 200
    return h


def jpeg():
    b = io.BytesIO()
    Image.new("RGB", (64, 64), "orange").save(b, "JPEG")
    return b.getvalue()


def entry(**kw):
    return {"day": TODAY, "meal": "Mittagessen", "name": "Reis", "grams": 180, "kcal": 234, "protein": 5, "carbs": 50, "fat": 1, **kw}


def test_register_requires_consent_and_valid_email():
    base = dict(email="a@b.de", password="geheim123", consent_terms=True)
    assert c.post("/api/auth/register", json={**base, "consent_health": False}).status_code == 400
    assert c.post("/api/auth/register", json={**base, "email": "kaputt", "consent_health": True}).status_code == 400
    assert c.post("/api/auth/register", json={**base, "password": "kurz", "consent_health": True}).status_code == 422


def test_login_and_wrong_password():
    user("login@test.de")
    assert c.post("/api/auth/login", json={"email": "LOGIN@test.de", "password": "geheim123"}).status_code == 200
    assert c.post("/api/auth/login", json={"email": "login@test.de", "password": "falsch"}).status_code == 401
    assert c.post("/api/auth/register", json=dict(email="login@test.de", password="geheim123", consent_health=True,
                                                  consent_terms=True)).status_code == 409


def test_requests_without_token_are_rejected():
    for path in ("/api/me", "/api/day/" + TODAY, "/api/stats", "/api/foods?q=reis"):
        assert c.get(path).status_code == 401
    assert c.get("/api/me", headers={"Authorization": "Bearer manipuliert.token"}).status_code == 401


def test_users_cannot_see_or_delete_each_others_data():
    a, b = user("a@iso.de"), user("b@iso.de")
    eid = c.post("/api/entries", json=[entry()], headers=a).json()["entries"][0]["id"]
    assert c.get(f"/api/day/{TODAY}", headers=b).json()["entries"] == []
    assert c.delete(f"/api/entries/{eid}", headers=b).status_code == 404
    assert len(c.get(f"/api/day/{TODAY}", headers=a).json()["entries"]) == 1


def test_free_scans_then_paywall_and_photo_ownership():
    a, b = user("scan@test.de"), user("other@test.de")
    r1 = c.post("/api/analyze", files={"photo": ("m.jpg", jpeg(), "image/jpeg")}, headers=a)
    assert r1.status_code == 200 and r1.json()["ai"] is False  # AI off in tests -> not counted
    # simulate two successful analyses
    appmod.db.run("UPDATE users SET free_scans_used = 2 WHERE email = 'scan@test.de'")
    r = c.post("/api/analyze", files={"photo": ("m.jpg", jpeg(), "image/jpeg")}, headers=a)
    assert r.status_code == 402
    # photo URL works only with valid signature; other users can't attach someone else's photo
    url = r1.json()["photo_url"]
    assert c.get(url).status_code == 200
    assert c.get(url.split("?")[0] + "?t=falsch").status_code == 404
    assert c.post("/api/entries", json=[entry(photo=r1.json()["photo"])], headers=b).status_code == 400
    assert c.post("/api/entries", json=[entry(photo=r1.json()["photo"])], headers=a).status_code == 200


def test_validation():
    a = user("val@test.de")
    assert c.post("/api/entries", json=[entry(meal="Brunch")], headers=a).status_code == 400
    assert c.post("/api/entries", json=[entry(day="2999-01-01")], headers=a).status_code == 400
    assert c.post("/api/entries", json=[entry(kcal=-5)], headers=a).status_code == 422
    assert c.post("/api/analyze", files={"photo": ("x.jpg", b"kein bild", "image/jpeg")}, headers=a).status_code == 400


def test_weight_updates_targets_and_export():
    a = user("w@test.de")
    before = c.get("/api/me", headers=a).json()["targets"]["kcal"]
    c.post("/api/weights", json={"day": TODAY, "kg": 80}, headers=a)
    me = c.get("/api/me", headers=a).json()
    assert me["profile"]["weight_kg"] == 80 and me["targets"]["kcal"] < before
    c.post("/api/entries", json=[entry()], headers=a)
    ex = c.get("/api/me/export", headers=a).json()
    assert ex["account"]["email"] == "w@test.de" and len(ex["entries"]) == 1 and ex["weights"]


def test_delete_account_removes_everything():
    a = user("del@test.de")
    ph = c.post("/api/analyze", files={"photo": ("m.jpg", jpeg(), "image/jpeg")}, headers=a).json()["photo"]
    c.post("/api/entries", json=[entry(photo=ph)], headers=a)
    assert c.request("DELETE", "/api/me", json={"password": "falsch"}, headers=a).status_code == 403
    assert c.request("DELETE", "/api/me", json={"password": "geheim123"}, headers=a).status_code == 200
    assert not (config.PHOTO_DIR / ph).exists()
    assert c.get("/api/me", headers=a).status_code == 401
    assert appmod.db.one("SELECT COUNT(*) n FROM entries WHERE photo = ?", (ph,))["n"] == 0


def test_logout_everywhere_invalidates_tokens():
    a = user("out@test.de")
    assert c.post("/api/auth/logout-everywhere", headers=a).status_code == 200
    assert c.get("/api/me", headers=a).status_code == 401


def test_webhook_requires_secret():
    assert c.post("/api/billing/webhook", json={"event": {}}).status_code == 401


def test_password_hash_and_tokens():
    h = auth.hash_password("abc12345")
    assert auth.verify_password("abc12345", h) and not auth.verify_password("x", h)
    assert auth.unsign(auth.sign({"a": 1, "exp": 1})) is None  # expired


def test_targets_floor():
    t = nutrition.targets(dict(sex="w", age=60, height_cm=155, weight_kg=50, activity="sitzend", goal="abnehmen", rate_kg_week=0.75))
    assert t["kcal"] == 1200 and t["floor_applied"]


def test_recent_foods():
    a = user("recent@test.de")
    c.post("/api/entries", json=[entry(), entry(grams=90, kcal=117)], headers=a)
    r = c.get("/api/recent", headers=a).json()
    assert r[0]["name"] == "Reis" and r[0]["kcal"] == pytest.approx(130, abs=1)


def test_rate_limit_on_login():
    auth._hits.clear()
    codes = [c.post("/api/auth/login", json={"email": "x@y.de", "password": "falsch1234"}).status_code for _ in range(12)]
    assert codes[:10] == [401] * 10 and codes[-1] == 429
    auth._hits.clear()
