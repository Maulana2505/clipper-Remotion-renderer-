from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Callable

from ..core.config import JOBS_DIR
from ..db import get_conn, now_iso, row_to_dict
from .activity import finish as activity_finish, start as activity_start, update as activity_update
from .media import extract_audio
from .transcribe import (
    fallback_transcript,
    transcribe_audio,
    transcribe_clips,
    transcribe_from_vtt,
    transcribe_from_vtt_clips,
)

_RUNNING: set[str] = set()
_LOCK = threading.Lock()


def is_running(job_id: str) -> bool:
    with _LOCK:
        return job_id in _RUNNING


def _set_running(job_id: str, running: bool) -> None:
    with _LOCK:
        if running:
            _RUNNING.add(job_id)
        else:
            _RUNNING.discard(job_id)


def run_transcript(job_id: str, scope: str = "clips", on_progress: Callable[[int, int], None] | None = None) -> None:
    scope = "full" if scope == "full" else "clips"
    _set_running(job_id, True)
    activity_start(f"transcript:{job_id}", "transcript", job_id, "Transkripsi", total=1)
    try:
        with get_conn() as conn:
            job = row_to_dict(conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone())
            clip_rows = conn.execute(
                "SELECT start_time, end_time FROM clips WHERE job_id = ? ORDER BY start_time", (job_id,)
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
                transcript = transcribe_clips(
                    source, clips, duration, on_progress=on_progress
                )
            else:
                audio = extract_audio(source, job_dir / "audio.wav")
                transcript = transcribe_audio(
                    audio, duration, on_progress=on_progress
                )

        if transcript is None and vtts:
            transcript = (
                transcribe_from_vtt(vtts[0], duration)
                if scope == "full"
                else transcribe_from_vtt_clips(vtts[0], clips, duration)
            )

        if transcript is None:
            transcript = fallback_transcript(duration)

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
        _set_running(job_id, False)
        activity_finish(f"transcript:{job_id}")
