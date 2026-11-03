from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from .core.config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_url TEXT,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    video_path TEXT,
    audio_path TEXT,
    transcript_path TEXT,
    duration REAL,
    width INTEGER,
    height INTEGER,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    is_hot INTEGER NOT NULL DEFAULT 0,
    hook TEXT,
    title TEXT,
    hashtags TEXT NOT NULL DEFAULT '[]',
    canvas TEXT NOT NULL DEFAULT 'vertical_9x16',
    video_template TEXT NOT NULL DEFAULT 'auto_crop',
    caption_template TEXT NOT NULL DEFAULT 'plain_white',
    caption_enabled INTEGER NOT NULL DEFAULT 1,
    font_preset TEXT NOT NULL DEFAULT 'anton',
    face_track_path TEXT,
    crop_json TEXT,
    overlays_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS renders (
    id TEXT PRIMARY KEY,
    clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    canvas TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    output_path TEXT,
    batch_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT NOT NULL DEFAULT 'openai',
    model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    encrypted_api_key TEXT,
    base_url TEXT,
    temperature REAL NOT NULL DEFAULT 0.3,
    max_clips INTEGER NOT NULL DEFAULT 20,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clips_job_id ON clips(job_id);
CREATE INDEX IF NOT EXISTS idx_renders_clip_id ON renders(clip_id);

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    niche TEXT NOT NULL DEFAULT 'generic',
    canvas TEXT NOT NULL DEFAULT 'vertical_9x16',
    video_template TEXT NOT NULL DEFAULT 'auto_crop',
    caption_template TEXT NOT NULL DEFAULT 'plain_white',
    font_preset TEXT NOT NULL DEFAULT 'anton',
    accent TEXT NOT NULL DEFAULT '#CCFF00',
    caption_enabled INTEGER NOT NULL DEFAULT 1,
    language TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

# Columns added after the first release. init_db() adds them to existing DBs.
MIGRATIONS: list[tuple[str, str, str]] = [
    ("jobs", "niche", "TEXT"),
    ("jobs", "channel_id", "TEXT"),
    ("jobs", "source_start", "REAL"),
    ("jobs", "source_end", "REAL"),
    ("jobs", "meta_json", "TEXT"),
    ("jobs", "transcript_scope", "TEXT"),
    ("clips", "face_track_path", "TEXT"),
    ("clips", "crop_json", "TEXT"),
    ("clips", "overlays_json", "TEXT"),
    ("clips", "badge", "TEXT"),
    ("clips", "accent", "TEXT"),
    ("clips", "meta_json", "TEXT"),
    ("clips", "reason", "TEXT"),
    ("clips", "signals_json", "TEXT"),
    ("app_settings", "whisper_model", "TEXT"),
    ("app_settings", "whisper_backend", "TEXT"),
    ("app_settings", "whisper_language", "TEXT"),
    ("app_settings", "whisper_mode", "TEXT"),
    ("app_settings", "whisper_hotwords", "TEXT"),
    ("app_settings", "remote_whisper_url", "TEXT"),
    ("app_settings", "encrypted_remote_token", "TEXT"),
    ("renders", "engine", "TEXT"),
    ("renders", "duration_ms", "INTEGER"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        _apply_migrations(conn)
        row = conn.execute("SELECT id FROM app_settings WHERE id = 1").fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO app_settings (id, provider, model, temperature, max_clips, updated_at)
                VALUES (1, 'openai', 'gpt-4o-mini', 0.3, 20, ?)
                """,
                (now_iso(),),
            )


def _apply_migrations(conn: sqlite3.Connection) -> None:
    for table, column, ddl in MIGRATIONS:
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            print(f"[db] added column {table}.{column}")


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    data = dict(row)
    if "hashtags" in data and isinstance(data["hashtags"], str):
        try:
            data["hashtags"] = json.loads(data["hashtags"])
        except json.JSONDecodeError:
            data["hashtags"] = []
    if "is_hot" in data:
        data["is_hot"] = bool(data["is_hot"])
    if "caption_enabled" in data:
        data["caption_enabled"] = bool(data["caption_enabled"])
    if "meta_json" in data:
        raw = data["meta_json"]
        if isinstance(raw, str) and raw.strip():
            try:
                data["meta"] = json.loads(raw)
            except json.JSONDecodeError:
                data["meta"] = None
        else:
            data["meta"] = None
    if "crop_json" in data:
        raw = data["crop_json"]
        if isinstance(raw, str) and raw.strip():
            try:
                data["crop"] = json.loads(raw)
            except json.JSONDecodeError:
                data["crop"] = None
        else:
            data["crop"] = None
    if "overlays_json" in data:
        raw = data["overlays_json"]
        if isinstance(raw, str) and raw.strip():
            try:
                data["overlays"] = json.loads(raw)
            except json.JSONDecodeError:
                data["overlays"] = []
        else:
            data["overlays"] = []
    if "signals_json" in data:
        raw = data["signals_json"]
        if isinstance(raw, str) and raw.strip():
            try:
                data["signals"] = json.loads(raw)
            except json.JSONDecodeError:
                data["signals"] = None
        else:
            data["signals"] = None
    return data


def update_job(
    conn: sqlite3.Connection,
    job_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    progress: int | None = None,
    error: str | None = None,
    **fields: Any,
) -> None:
    updates: list[str] = []
    params: list[Any] = []
    for key, value in {
        "status": status,
        "stage": stage,
        "progress": progress,
        "error": error,
        **fields,
    }.items():
        if value is not None:
            updates.append(f"{key} = ?")
            params.append(value)
    updates.append("updated_at = ?")
    params.append(now_iso())
    params.append(job_id)
    conn.execute(f"UPDATE jobs SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
