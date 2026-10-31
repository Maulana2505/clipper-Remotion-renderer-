from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..db import get_conn, now_iso, row_to_dict
from ..schemas import ChannelCreate, ChannelUpdate
from ..templates import NICHE_BY_ID, NICHE_PRESETS

router = APIRouter(prefix="/api/channels", tags=["channels"])

CHANNEL_FIELDS = (
    "name",
    "niche",
    "canvas",
    "video_template",
    "caption_template",
    "font_preset",
    "accent",
    "caption_enabled",
    "language",
    "notes",
)


def _niche_defaults(niche: str) -> dict:
    preset = NICHE_BY_ID.get(niche) or NICHE_BY_ID["generic"]
    return {
        "canvas": preset["canvas"],
        "video_template": preset["video_template"],
        "caption_template": preset["caption_template"],
        "font_preset": preset["font_preset"],
        "accent": preset["accent"],
    }


@router.get("/niches")
def list_niches():
    return NICHE_PRESETS


@router.get("")
def list_channels():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM channels ORDER BY created_at ASC").fetchall()
    return [row_to_dict(row) for row in rows]


@router.post("")
def create_channel(payload: ChannelCreate):
    niche = payload.niche if payload.niche in NICHE_BY_ID else "generic"
    defaults = _niche_defaults(niche)
    channel_id = uuid.uuid4().hex
    values = {
        "name": payload.name,
        "niche": niche,
        "canvas": payload.canvas or defaults["canvas"],
        "video_template": payload.video_template or defaults["video_template"],
        "caption_template": payload.caption_template or defaults["caption_template"],
        "font_preset": payload.font_preset or defaults["font_preset"],
        "accent": payload.accent or defaults["accent"],
        "caption_enabled": 1 if payload.caption_enabled else 0,
        "language": payload.language,
        "notes": payload.notes,
    }
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO channels (id, name, niche, canvas, video_template, caption_template,
                font_preset, accent, caption_enabled, language, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                channel_id,
                values["name"],
                values["niche"],
                values["canvas"],
                values["video_template"],
                values["caption_template"],
                values["font_preset"],
                values["accent"],
                values["caption_enabled"],
                values["language"],
                values["notes"],
                now_iso(),
                now_iso(),
            ),
        )
        row = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
    return row_to_dict(row)


@router.get("/{channel_id}")
def get_channel(channel_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Channel not found.")
    return row_to_dict(row)


@router.patch("/{channel_id}")
def update_channel(channel_id: str, payload: ChannelUpdate):
    changes = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    if payload.caption_enabled is not None:
        changes["caption_enabled"] = 1 if payload.caption_enabled else 0
    if "niche" in changes and changes["niche"] not in NICHE_BY_ID:
        raise HTTPException(status_code=422, detail="Unknown niche.")
    if not changes:
        return get_channel(channel_id)

    assignments = ", ".join(f"{field} = ?" for field in changes)
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM channels WHERE id = ?", (channel_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Channel not found.")
        conn.execute(
            f"UPDATE channels SET {assignments}, updated_at = ? WHERE id = ?",
            (*changes.values(), now_iso(), channel_id),
        )
        row = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/{channel_id}")
def delete_channel(channel_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM channels WHERE id = ?", (channel_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Channel not found.")
        conn.execute("UPDATE jobs SET channel_id = NULL WHERE channel_id = ?", (channel_id,))
        conn.execute("DELETE FROM channels WHERE id = ?", (channel_id,))
        conn.commit()
    return {"ok": True}
