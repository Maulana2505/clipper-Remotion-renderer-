from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Callable

from ..core.config import JOBS_DIR
from ..db import get_conn, now_iso, row_to_dict
from ..services.activity import finish as activity_finish, start as activity_start, update as activity_update
from ..services.face import track_faces


def _job_dir(job_id: str) -> Path:
    path = JOBS_DIR / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def run_face_track_clip(clip_id: str) -> None:
    activity_start("face:" + clip_id, "face", clip_id, "Face track", total=100)
    try:
        with get_conn() as conn:
            clip = row_to_dict(conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone())
            if clip is None:
                return
            job = row_to_dict(conn.execute("SELECT * FROM jobs WHERE id = ?", (clip["job_id"],)).fetchone())
        if not job or not job.get("video_path"):
            return
        source = Path(job["video_path"])
        if not source.exists():
            return
        track = track_faces(
            source, float(clip["start_time"]), float(clip["end_time"]),
            on_progress=lambda p: activity_update("face:" + clip_id, progress=p),
        )
        destination = source.parent / "clips" / clip_id / "face.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(track, ensure_ascii=False), encoding="utf-8")
        with get_conn() as conn:
            conn.execute("UPDATE clips SET face_track_path = ? WHERE id = ?", (str(destination), clip_id))
            conn.commit()
        print("[face] tracked clip " + clip_id + " (" + str(len(track.get("keyframes") or [])) + " keyframes)")
    except Exception as exc:  # noqa: BLE001
        print("[face] clip " + clip_id + " failed: " + str(exc))
    finally:
        activity_finish("face:" + clip_id)


def run_job_face_track(job_id: str, force: bool = False, on_progress: Callable[[int, int], None] | None = None) -> None:
    activity_start("face-all:" + job_id, "face", job_id, "Face track semua clip", total=100)
    try:
        with get_conn() as conn:
            job = row_to_dict(conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone())
            rows = conn.execute("SELECT id, face_track_path FROM clips WHERE job_id = ? ORDER BY start_time", (job_id,)).fetchall()
        clips = [dict(r) for r in rows]
        total = len(clips)
        if total == 0:
            return
        done = 0
        for clip in clips:
            cid = clip["id"]
            if (not force) and clip.get("face_track_path"):
                done += 1
                if on_progress is not None:
                    try:
                        on_progress(done, total)
                    except Exception:  # noqa: BLE001
                        pass
                continue
            run_face_track_clip(cid)
            done += 1
            if on_progress is not None:
                try:
                    on_progress(done, total)
                except Exception:  # noqa: BLE001
                    pass
            activity_update("face-all:" + job_id, progress=int(100 * done / total))
        print("[face] job " + job_id + " face track done (" + str(done) + "/" + str(total) + ")")
    except Exception as exc:  # noqa: BLE001
        print("[face] job " + job_id + " failed: " + str(exc))
    finally:
        activity_finish("face-all:" + job_id)


def run_full_analysis(job_id: str, force: bool = False) -> None:
    activity_start("analysis:" + job_id, "analysis", job_id, "Full analysis (transkrip + face)", total=100)
    try:
        from .transcript_job import run_transcript
        with get_conn() as conn:
            job = row_to_dict(conn.execute("SELECT transcript_scope FROM jobs WHERE id = ?", (job_id,)).fetchone())
        scope = (job or {}).get("transcript_scope") or "clips"
        if force or scope != "full":
            try:
                from ..services.transcribe import get_whisper_config
                if get_whisper_config().get("model"):
                    activity_update("analysis:" + job_id, progress=5)
                    run_transcript(job_id, "full", on_progress=lambda d, t: activity_update("analysis:" + job_id, progress=5 + int(45 * d / max(1, t))))
                else:
                    print("[analysis] no whisper model selected; skipping transcription, face track only.")
            except Exception as exc:  # noqa: BLE001
                print(f"[analysis] transcript skipped: {exc}")
        activity_update("analysis:" + job_id, progress=50)
        run_job_face_track(job_id, force=force, on_progress=lambda d, t: activity_update("analysis:" + job_id, progress=50 + int(45 * d / max(1, t))))
        activity_update("analysis:" + job_id, progress=100)
        print("[analysis] job " + job_id + " full analysis done")
    except Exception as exc:  # noqa: BLE001
        print("[analysis] job " + job_id + " failed: " + str(exc))
    finally:
        activity_finish("analysis:" + job_id)
