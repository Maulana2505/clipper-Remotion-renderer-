from __future__ import annotations

import json
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..core.config import JOBS_DIR
from ..db import get_conn, now_iso, row_to_dict
from ..schemas import JobCreate, RedetectRequest
from ..services.media import MediaError, ensure_disk_space, extract_audio, is_safe_url, probe_url_duration
from ..services.pipeline import process_job
from ..services.redetect import is_running as is_redetect_running
from ..services.redetect import redetect_clips, redetect_status
from ..services.transcribe import (
    fallback_transcript,
    transcribe_audio,
    transcribe_clips,
    transcribe_from_vtt,
    transcribe_from_vtt_clips,
)
from ..templates import NICHE_BY_ID

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}

# Transcription is opt-in: the job pipeline no longer runs Whisper, the Studio
# asks for it only when the user wants captions.
_TRANSCRIPT_RUNNING: set[str] = set()
_TRANSCRIPT_LOCK = threading.Lock()


def _run_transcript(job_id: str, scope: str = "clips") -> None:
    scope = "full" if scope == "full" else "clips"
    try:
        with get_conn() as conn:
            job = row_to_dict(
                conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            )
            clip_rows = conn.execute(
                "SELECT start_time, end_time FROM clips WHERE job_id = ? ORDER BY start_time",
                (job_id,),
            ).fetchall()
        if not job or not job.get("video_path"):
            return
        source = Path(job["video_path"])
        if not source.exists():
            return
        job_dir = source.parent
        duration = float(job.get("duration") or 0.0)
        clips = [{"start": float(r["start_time"]), "end": float(r["end_time"])} for r in clip_rows]

        vtts = sorted(job_dir.glob("subs*.vtt"))

        transcript = None
        if scope == "clips" and vtts:
            transcript = transcribe_from_vtt_clips(vtts[0], clips, duration)
        elif scope == "full" and vtts:
            transcript = transcribe_from_vtt(vtts[0], duration)

        if transcript is None:
            if scope == "clips" and clips:
                transcript = transcribe_clips(source, clips, duration)
            else:
                audio = extract_audio(source, job_dir / "audio.wav")
                transcript = transcribe_audio(audio, duration)

        if transcript is None and vtts:
            transcript = transcribe_from_vtt(vtts[0], duration) if scope == "full" else transcribe_from_vtt_clips(vtts[0], clips, duration)

        if transcript is None:
            transcript = fallback_transcript(duration)

        # Ensure scope reflects reality.
        transcript["scope"] = scope
        path = job_dir / "transcript.json"
        path.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
        with get_conn() as conn:
            conn.execute(
                "UPDATE jobs SET transcript_path = ?, transcript_scope = ?, updated_at = ? WHERE id = ?",
                (str(path), scope, now_iso(), job_id),
            )
            conn.commit()
        print(f"[transcript] job {job_id} ready (scope={scope})")
    except Exception as exc:  # noqa: BLE001
        print(f"[transcript] job {job_id} failed: {exc}")
    finally:
        with _TRANSCRIPT_LOCK:
            _TRANSCRIPT_RUNNING.discard(job_id)


def _create_job(
    source_type: str,
    source_url: str | None,
    title: str,
    *,
    niche: str | None = None,
    channel_id: str | None = None,
    source_start: float | None = None,
    source_end: float | None = None,
    meta: dict | None = None,
) -> str:
    job_id = uuid.uuid4().hex
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    niche = niche if niche in NICHE_BY_ID else None
    with get_conn() as conn:
        if channel_id:
            row = conn.execute("SELECT id FROM channels WHERE id = ?", (channel_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=422, detail="Channel not found.")
        conn.execute(
            """
            INSERT INTO jobs (
                id, source_type, source_url, title, status, stage, progress,
                niche, channel_id, source_start, source_end, meta_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'queued', 'queued', 0, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                source_type,
                source_url,
                title,
                niche,
                channel_id or None,
                source_start,
                source_end,
                json.dumps(meta, ensure_ascii=False) if meta else None,
                now_iso(),
                now_iso(),
            ),
        )
        conn.commit()
    return job_id


def _range(payload: JobCreate) -> tuple[float | None, float | None]:
    if payload.source_start is None and payload.source_end is None:
        return None, None
    start = max(0.0, float(payload.source_start or 0.0))
    end = float(payload.source_end) if payload.source_end is not None else None
    if end is not None and end <= start:
        raise HTTPException(status_code=422, detail="Import end must be after the start.")
    return start, end


@router.get("/probe")
def probe_url(url: str):
    """Duration lookup so the UI can offer a range import for long VODs."""
    ok, message = is_safe_url(url)
    if not ok:
        raise HTTPException(status_code=422, detail=message)
    duration = probe_url_duration(url)
    return {"url": url, "duration": duration, "long": duration > 30 * 60}


@router.post("")
def create_url_job(payload: JobCreate, background_tasks: BackgroundTasks):
    if payload.source_type != "url":
        raise HTTPException(status_code=422, detail="Use /api/jobs/upload for local files.")
    ok, message = is_safe_url(payload.url)
    if not ok:
        raise HTTPException(status_code=422, detail=message)
    try:
        ensure_disk_space()
    except MediaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    start, end = _range(payload)
    job_id = _create_job(
        "url",
        payload.url,
        "New clip job",
        niche=payload.niche,
        channel_id=payload.channel_id,
        source_start=start,
        source_end=end,
        meta=payload.meta.model_dump(exclude_none=True) if payload.meta else None,
    )
    background_tasks.add_task(process_job, job_id)
    return {"job_id": job_id, "status": "queued"}


@router.post("/upload")
async def create_upload_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    niche: str | None = Form(None),
    channel_id: str | None = Form(None),
    source_start: float | None = Form(None),
    source_end: float | None = Form(None),
    meta: str | None = Form(None),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Unsupported video format.")
    try:
        ensure_disk_space()
    except MediaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    meta_data = None
    if meta:
        try:
            meta_data = json.loads(meta)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail="Invalid meta JSON.") from exc

    job_id = _create_job(
        "upload",
        None,
        file.filename or "Uploaded video",
        niche=niche,
        channel_id=channel_id or None,
        source_start=max(0.0, source_start) if source_start is not None else None,
        source_end=source_end,
        meta=meta_data,
    )
    job_dir = JOBS_DIR / job_id
    destination = job_dir / f"source{suffix}"
    with destination.open("wb") as target:
        shutil.copyfileobj(file.file, target)
    with get_conn() as conn:
        conn.execute(
            "UPDATE jobs SET video_path = ?, updated_at = ? WHERE id = ?",
            (str(destination), now_iso(), job_id),
        )
        conn.commit()
    background_tasks.add_task(process_job, job_id)
    return {"job_id": job_id, "status": "queued"}


@router.get("")
def list_jobs():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
        jobs = []
        for row in rows:
            data = row_to_dict(row)
            count = conn.execute("SELECT COUNT(*) FROM clips WHERE job_id = ?", (row["id"],)).fetchone()[0]
            data["clip_count"] = count
            jobs.append(data)
    return jobs


@router.get("/{job_id}")
def get_job(job_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        data = row_to_dict(row)
        data["clip_count"] = conn.execute(
            "SELECT COUNT(*) FROM clips WHERE job_id = ?", (job_id,)
        ).fetchone()[0]
    return data


@router.get("/{job_id}/clips")
def get_job_clips(job_id: str):
    with get_conn() as conn:
        job = conn.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        rows = conn.execute(
            "SELECT * FROM clips WHERE job_id = ? ORDER BY start_time ASC", (job_id,)
        ).fetchall()
    return [row_to_dict(row) for row in rows]


@router.get("/{job_id}/transcript")
def get_job_transcript(job_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT transcript_path FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None or not row["transcript_path"]:
        raise HTTPException(status_code=404, detail="Transcript not found.")
    path = Path(row["transcript_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Transcript file not found.")
    return json.loads(path.read_text(encoding="utf-8"))


@router.post("/{job_id}/transcript")
def generate_job_transcript(job_id: str, force: bool = False, scope: str = "clips"):
    """Opt-in transcription. Runs in the background; poll the GET endpoint."""
    scope = "full" if scope == "full" else "clips"
    with get_conn() as conn:
        row = conn.execute("SELECT transcript_path, transcript_scope FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if row["transcript_path"] and Path(row["transcript_path"]).exists() and not force and (row["transcript_scope"] or "clips") == scope:
        return {"status": "ready", "scope": scope}
    with _TRANSCRIPT_LOCK:
        if job_id in _TRANSCRIPT_RUNNING:
            return {"status": "running", "scope": scope}
        _TRANSCRIPT_RUNNING.add(job_id)
    threading.Thread(target=_run_transcript, args=(job_id, scope), daemon=True).start()
    return {"status": "running", "scope": scope}


@router.post("/{job_id}/redetect")
def redetect_job_clips(job_id: str, payload: RedetectRequest):
    """Transcript-aware re-detection. Runs in the background; poll the GET."""
    with get_conn() as conn:
        row = conn.execute("SELECT transcript_path FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not row["transcript_path"] or not Path(row["transcript_path"]).exists():
        raise HTTPException(
            status_code=409, detail="Generate a transcript before re-detecting clips."
        )
    if is_redetect_running(job_id):
        return {"status": "running", "mode": payload.mode}
    threading.Thread(
        target=redetect_clips, args=(job_id, payload.mode), daemon=True
    ).start()
    return {"status": "running", "mode": payload.mode}


@router.get("/{job_id}/redetect")
def get_redetect_status(job_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return redetect_status(job_id)


@router.get("/{job_id}/video")
def get_job_video(job_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT video_path FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None or not row["video_path"]:
        raise HTTPException(status_code=404, detail="Video not found.")
    path = Path(row["video_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video file not found.")
    return FileResponse(path, media_type="video/mp4", filename=path.name)


@router.delete("/{job_id}")
def delete_job(job_id: str):
    job_dir = JOBS_DIR / job_id
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    return {"ok": True}
