from __future__ import annotations

import json
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from ..core.config import JOBS_DIR
from ..db import get_conn, now_iso, row_to_dict
from ..schemas import RenderRequest
from ..services.media import MediaError
from ..services.render_remotion import render_clip_remotion
from ..templates import CANVAS_BY_ID, CANVAS_PRESETS

router = APIRouter(tags=["renders"])


def _load_context(clip_id: str) -> tuple[dict, dict, dict, dict, str]:
    with get_conn() as conn:
        clip_row = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
        if clip_row is None:
            raise HTTPException(status_code=404, detail="Clip not found.")
        clip = row_to_dict(clip_row) or {}
        job_row = conn.execute("SELECT * FROM jobs WHERE id = ?", (clip["job_id"],)).fetchone()
        if job_row is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        job = row_to_dict(job_row) or {}
    transcript: dict = {}
    if job.get("transcript_path") and Path(job["transcript_path"]).exists():
        transcript = json.loads(Path(job["transcript_path"]).read_text(encoding="utf-8"))
    face_track: dict = {"fallback": True, "keyframes": []}
    if clip.get("face_track_path") and Path(clip["face_track_path"]).exists():
        face_track = json.loads(Path(clip["face_track_path"]).read_text(encoding="utf-8"))
    canvas = clip.get("canvas") or "vertical_9x16"
    return clip, job, transcript, face_track, canvas


def _create_render(clip_id: str, canvas: str, batch_id: str | None = None) -> str:
    render_id = uuid.uuid4().hex
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO renders (id, clip_id, canvas, status, progress, batch_id, created_at, updated_at)
            VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)
            """,
            (render_id, clip_id, canvas, batch_id, now_iso(), now_iso()),
        )
        conn.commit()
    return render_id


def _do_render(render_id: str) -> None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM renders WHERE id = ?", (render_id,)).fetchone()
        if row is None:
            return
        render = row_to_dict(row) or {}
        conn.execute(
            "UPDATE renders SET status = 'rendering', progress = 10, engine = 'remotion', updated_at = ? WHERE id = ?",
            (now_iso(), render_id),
        )
        conn.commit()

    def report(progress: int) -> None:
        with get_conn() as conn:
            conn.execute(
                "UPDATE renders SET progress = ?, updated_at = ? WHERE id = ?",
                (max(0, min(99, progress)), now_iso(), render_id),
            )
            conn.commit()

    try:
        clip, job, transcript, face_track, _default_canvas = _load_context(render["clip_id"])
        canvas = CANVAS_BY_ID.get(render["canvas"])
        if canvas is None:
            raise MediaError("Unknown canvas.")
        source = Path(job.get("video_path") or JOBS_DIR / job["id"] / "source.mp4")
        if not source.exists():
            raise MediaError("Source video is missing.")
        output_dir = JOBS_DIR / job["id"] / "renders" / render_id
        output = output_dir / "output.mp4"

        meta: dict = {}
        for raw in (job.get("meta_json"), clip.get("meta_json")):
            if raw:
                try:
                    meta.update(json.loads(raw))
                except json.JSONDecodeError:
                    pass

        result = render_clip_remotion(
            source=source,
            clip=clip,
            job=job,
            canvas=canvas,
            transcript=transcript,
            face_track=face_track,
            output=output,
            accent=clip.get("accent") or "#CCFF00",
            badge=clip.get("badge"),
            meta=meta,
            on_progress=report,
        )
        with get_conn() as conn:
            conn.execute(
                "UPDATE renders SET status = 'completed', progress = 100, output_path = ?, duration_ms = ?, engine = 'remotion', updated_at = ? WHERE id = ?",
                (str(output), result.get("duration_ms"), now_iso(), render_id),
            )
            conn.commit()
    except Exception as exc:  # noqa: BLE001
        print(f"[render] {render_id} failed: {exc}")
        with get_conn() as conn:
            conn.execute(
                "UPDATE renders SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
                (str(exc), now_iso(), render_id),
            )
            conn.commit()


def _process_batch(render_ids: list[str]) -> None:
    for render_id in render_ids:
        _do_render(render_id)


@router.post("/api/clips/{clip_id}/render")
def render_one(clip_id: str, payload: RenderRequest, background_tasks: BackgroundTasks):
    _clip, _job, _transcript, _face, default_canvas = _load_context(clip_id)
    canvas = payload.canvas or default_canvas
    if canvas not in CANVAS_BY_ID:
        raise HTTPException(status_code=422, detail="Unknown canvas.")
    render_id = _create_render(clip_id, canvas)
    background_tasks.add_task(_do_render, render_id)
    return {"render_id": render_id, "status": "queued", "canvas": canvas}


@router.post("/api/clips/{clip_id}/render-all")
def render_all(clip_id: str, background_tasks: BackgroundTasks):
    _clip, _job, _transcript, _face, _default_canvas = _load_context(clip_id)
    batch_id = uuid.uuid4().hex
    render_ids = [_create_render(clip_id, canvas["id"], batch_id) for canvas in CANVAS_PRESETS]
    background_tasks.add_task(_process_batch, render_ids)
    return {"batch_id": batch_id, "render_ids": render_ids, "status": "queued"}


@router.get("/api/clips/{clip_id}/renders")
def list_renders(clip_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM renders WHERE clip_id = ? ORDER BY created_at ASC", (clip_id,)
        ).fetchall()
    return [row_to_dict(row) for row in rows]


@router.get("/api/renders/{render_id}/download")
def download_render(render_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM renders WHERE id = ?", (render_id,)).fetchone()
    if row is None or not row["output_path"]:
        raise HTTPException(status_code=404, detail="Render not found.")
    path = Path(row["output_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Render file not found.")
    return FileResponse(path, media_type="video/mp4", filename=f"{render_id}.mp4")


@router.get("/api/clips/{clip_id}/download-all")
def download_all(clip_id: str):
    with get_conn() as conn:
        clip = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
        if clip is None:
            raise HTTPException(status_code=404, detail="Clip not found.")
        rows = conn.execute(
            "SELECT * FROM renders WHERE clip_id = ? AND status = 'completed'", (clip_id,)
        ).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No completed renders.")
    # Keep only the newest completed render per canvas so the archive never
    # contains colliding file names when a canvas was rendered more than once.
    latest: dict[str, Path] = {}
    for row in rows:  # already ordered oldest -> newest
        if row["output_path"] and Path(row["output_path"]).exists():
            latest[row["canvas"]] = Path(row["output_path"])
    if not latest:
        raise HTTPException(status_code=404, detail="No completed render files found.")
    job_dir = JOBS_DIR / clip["job_id"]
    zip_path = job_dir / f"clip-{clip_id}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for canvas, path in latest.items():
            archive.write(path, arcname=f"{canvas}.mp4")
    return FileResponse(zip_path, media_type="application/zip", filename=f"clip-{clip_id}.zip")
