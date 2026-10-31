from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from ..db import get_conn, row_to_dict
from ..schemas import ClipPatch
from ..templates import CANVAS_BY_ID, CAPTION_BY_ID, FONT_BY_ID, VIDEO_TEMPLATES

router = APIRouter(prefix="/api/clips", tags=["clips"])
VIDEO_TEMPLATE_IDS = {item["id"] for item in VIDEO_TEMPLATES}


@router.get("/{clip_id}")
def get_clip(clip_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Clip not found.")
    return row_to_dict(row)


@router.get("/{clip_id}/face-track")
def get_clip_face_track(clip_id: str):
    from pathlib import Path

    with get_conn() as conn:
        row = conn.execute("SELECT face_track_path FROM clips WHERE id = ?", (clip_id,)).fetchone()
    if row is None or not row["face_track_path"]:
        raise HTTPException(status_code=404, detail="Face track not found.")
    path = Path(row["face_track_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Face track file not found.")
    return json.loads(path.read_text(encoding="utf-8"))


@router.patch("/{clip_id}")
def update_clip(clip_id: str, payload: ClipPatch):
    updates: list[str] = []
    params: list[object] = []

    if payload.title is not None:
        updates.append("title = ?")
        params.append(payload.title.strip()[:160])
    if payload.hashtags is not None:
        tags = [tag if tag.startswith("#") else f"#{tag}" for tag in payload.hashtags if tag.strip()]
        updates.append("hashtags = ?")
        params.append(json.dumps(tags[:8], ensure_ascii=False))
    if payload.canvas is not None:
        if payload.canvas not in CANVAS_BY_ID:
            raise HTTPException(status_code=422, detail="Unknown canvas.")
        updates.append("canvas = ?")
        params.append(payload.canvas)
    if payload.video_template is not None:
        if payload.video_template not in VIDEO_TEMPLATE_IDS:
            raise HTTPException(status_code=422, detail="Unknown video template.")
        updates.append("video_template = ?")
        params.append(payload.video_template)
    if payload.caption_template is not None:
        if payload.caption_template not in CAPTION_BY_ID:
            raise HTTPException(status_code=422, detail="Unknown caption template.")
        updates.append("caption_template = ?")
        params.append(payload.caption_template)
    if payload.caption_enabled is not None:
        updates.append("caption_enabled = ?")
        params.append(1 if payload.caption_enabled else 0)
    if payload.font_preset is not None:
        if payload.font_preset not in FONT_BY_ID:
            raise HTTPException(status_code=422, detail="Unknown font preset.")
        updates.append("font_preset = ?")
        params.append(payload.font_preset)
    if payload.accent is not None:
        accent = payload.accent.strip()
        if not accent.startswith("#"):
            accent = f"#{accent}"
        if len(accent) not in (4, 7):
            raise HTTPException(status_code=422, detail="Accent must be a hex colour.")
        updates.append("accent = ?")
        params.append(accent.lower())
    if payload.badge is not None:
        updates.append("badge = ?")
        params.append(payload.badge.strip().upper()[:24] or None)
    if payload.meta is not None:
        values = payload.meta.model_dump(exclude_none=True)
        if values:
            updates.append("meta_json = ?")
            params.append(json.dumps(values, ensure_ascii=False))
        else:
            updates.append("meta_json = NULL")

    if not updates:
        return get_clip(clip_id)

    params.append(clip_id)
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM clips WHERE id = ?", (clip_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Clip not found.")
        conn.execute(f"UPDATE clips SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        updated = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
    return row_to_dict(updated)


@router.delete("/{clip_id}")
def delete_clip(clip_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM clips WHERE id = ?", (clip_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Clip not found.")
        conn.execute("DELETE FROM clips WHERE id = ?", (clip_id,))
        conn.commit()
    return {"ok": True}
