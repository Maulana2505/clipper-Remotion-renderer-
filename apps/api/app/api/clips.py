from __future__ import annotations

import json
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..db import get_conn, row_to_dict
from ..schemas import ClipPatch
from ..services.activity import finish as activity_finish, start as activity_start, update as activity_update
from ..services.face import track_faces
from ..templates import CANVAS_BY_ID, CAPTION_BY_ID, FONT_BY_ID, VIDEO_TEMPLATES

router = APIRouter(prefix="/api/clips", tags=["clips"])
VIDEO_TEMPLATE_IDS = {item["id"] for item in VIDEO_TEMPLATES}

# Face tracking is opt-in and slow, so it runs in the background and only once
# per clip at a time.
_FACE_RUNNING: set[str] = set()
_FACE_LOCK = threading.Lock()


def _face_track_path(job_dir: Path, clip_id: str) -> Path:
    return job_dir / "clips" / clip_id / "face.json"


def _run_face_track(clip_id: str) -> None:
    activity_start(f"face:{clip_id}", "face", clip_id, "Face track", total=100)
    try:
        with get_conn() as conn:
            clip = row_to_dict(conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone())
            if clip is None:
                return
            job = row_to_dict(
                conn.execute("SELECT * FROM jobs WHERE id = ?", (clip["job_id"],)).fetchone()
            )
        if not job or not job.get("video_path"):
            return
        source = Path(job["video_path"])
        if not source.exists():
            return
        track = track_faces(
            source, float(clip["start_time"]), float(clip["end_time"]),
            on_progress=lambda p: activity_update(f"face:{clip_id}", progress=p),
        )
        destination = _face_track_path(source.parent, clip_id)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(track, ensure_ascii=False), encoding="utf-8")
        with get_conn() as conn:
            conn.execute(
                "UPDATE clips SET face_track_path = ? WHERE id = ?", (str(destination), clip_id)
            )
            conn.commit()
        print(f"[face] tracked clip {clip_id} ({len(track.get('keyframes') or [])} keyframes)")
    except Exception as exc:  # noqa: BLE001
        print(f"[face] clip {clip_id} failed: {exc}")
    finally:
        activity_finish(f"face:{clip_id}")
        with _FACE_LOCK:
            _FACE_RUNNING.discard(clip_id)


@router.get("/{clip_id}")
def get_clip(clip_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Clip not found.")
    return row_to_dict(row)


@router.get("/{clip_id}/face-track")
def get_clip_face_track(clip_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT face_track_path FROM clips WHERE id = ?", (clip_id,)).fetchone()
    if row is None or not row["face_track_path"]:
        raise HTTPException(status_code=404, detail="Face track not found.")
    path = Path(row["face_track_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Face track file not found.")
    return json.loads(path.read_text(encoding="utf-8"))


@router.post("/{clip_id}/face-track")
def generate_clip_face_track(clip_id: str):
    """Opt-in face tracking for one clip. Runs in the background."""
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM clips WHERE id = ?", (clip_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Clip not found.")
    with _FACE_LOCK:
        if clip_id in _FACE_RUNNING:
            return {"status": "running"}
        _FACE_RUNNING.add(clip_id)
    threading.Thread(target=_run_face_track, args=(clip_id,), daemon=True).start()
    return {"status": "running"}


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
    if payload.crop is not None:
        updates.append("crop_json = ?")
        params.append(json.dumps(payload.crop.model_dump(), ensure_ascii=False))
    if payload.overlays is not None:
        updates.append("overlays_json = ?")
        params.append(json.dumps([o.model_dump() for o in payload.overlays], ensure_ascii=False))
    if payload.caption_layout is not None:
        updates.append("caption_layout_json = ?")
        params.append(json.dumps(payload.caption_layout.model_dump(), ensure_ascii=False))

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
