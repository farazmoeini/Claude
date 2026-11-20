"""SQLite storage (WAL mode). One file, easy backups; fine for tens of thousands of users on one server."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, pw_hash TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, consent_at TEXT NOT NULL, consent_version TEXT NOT NULL,
  profile TEXT, free_scans_used INTEGER NOT NULL DEFAULT 0,
  premium_until TEXT, premium_checked REAL NOT NULL DEFAULT 0, token_version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL, meal TEXT NOT NULL, name TEXT NOT NULL, grams REAL NOT NULL,
  kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
  photo TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manuell', created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_entries_user_day ON entries(user_id, day);
CREATE TABLE IF NOT EXISTS weights (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, kg REAL NOT NULL,
  PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS photos (
  name TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS scans (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires REAL NOT NULL);
"""


@contextmanager
def conn():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(config.DB_PATH, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    config.PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    with conn() as c:
        c.execute("PRAGMA journal_mode = WAL")
        c.executescript(SCHEMA)


def rows(sql: str, args: tuple = ()) -> list[dict]:
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def one(sql: str, args: tuple = ()) -> dict | None:
    r = rows(sql, args)
    return r[0] if r else None


def run(sql: str, args: tuple = ()) -> int:
    with conn() as c:
        return c.execute(sql, args).lastrowid
