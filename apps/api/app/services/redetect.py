"""Re-detect clips from an existing transcript.

The default build picks moments from the audio loudness curve. Once a transcript
exists (opt-in from the Studio), the user can ask for transcript-aware picking
instead: the configured LLM proposes the moments, or the local heuristic does
when no key is set. This module only reads ``transcript.json``; it never runs
Whisper again.

Two modes:

* ``merge``   - add windows that do not overlap existing clips, so manual crop
                and badge edits on those clips survive.
* ``replace`` - delete the job's clips and insert the transcript result.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

from ..db import get_conn, row_to_dict
from .llm import detect_clips
from .pipeline import clip_meta, insert_clips, load_channel, resolve_preset

# Two windows closer than this many seconds count as the same moment.
OVERLAP_MARGIN = 1.0

_LOCK = threading.Lock()
_STATE: dict[str, dict] = {}

_EMPTY = {
    "status": "idle",
    "mode": None,
    "added": 0,
    "skipped": 0,
    "source": None,
    "error": "",
}


def _read_state(job_id: str) -> dict:
    with _LOCK:
        return dict(_EMPTY, **(_STATE.get(job_id) or {}))


def _write_state(job_id: str, **fields) -> dict:
    with _LOCK:
        state = dict(_EMPTY, **(_STATE.get(job_id) or {}))
        state.update(fields)
        _STATE[job_id] = state
        return dict(state)


def redetect_status(job_id: str) -> dict:
    return _read_state(job_id)


def is_running(job_id: str) -> bool:
    return _read_state(job_id).get("status") == "running"


def _transcript_duration(transcript: dict) -> float:
    ends = [
        float(segment.get("end") or 0.0)
        for segment in transcript.get("segments") or []
    ]
    return max(ends) if ends else 0.0


def _overlaps(
    start: float, end: float, intervals: list[tuple[float, float]], margin: float = OVERLAP_MARGIN
) -> bool:
    for other_start, other_end in intervals:
        overlap = min(end, other_end) - max(start, other_start)
        if overlap > margin:
            return True
    return False


def _new_windows(
    windows: list[dict], intervals: list[tuple[float, float]]
) -> list[dict]:
    chosen: list[dict] = []
    taken = list(intervals)
    for window in windows:
        start = float(window["start"])
        end = float(window["end"])
        if _overlaps(start, end, taken):
            continue
        chosen.append(window)
        taken.append((start, end))
    return chosen


def redetect_clips(job_id: str, mode: str = "merge") -> dict:
    mode = "replace" if mode == "replace" else "merge"
    _write_state(job_id, status="running", mode=mode, added=0, skipped=0, source=None, error="")
    try:
        with get_conn() as conn:
            job = row_to_dict(
                conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            )
        if job is None:
            raise RuntimeError("Job not found.")

        raw_path = job.get("transcript_path")
        if not raw_path or not Path(raw_path).exists():
            raise RuntimeError("Generate a transcript first.")

        transcript = json.loads(Path(raw_path).read_text(encoding="utf-8"))
        duration = float(job.get("duration") or 0.0) or _transcript_duration(transcript)
        if duration <= 0:
            raise RuntimeError("Could not determine the video duration.")

        detected, source = detect_clips(transcript, duration, job.get("niche"))
        if not detected:
            raise RuntimeError("No clips were found in the transcript.")

        with get_conn() as conn:
            channel = load_channel(conn, job.get("channel_id"))
            preset = resolve_preset(job, channel)
            meta = clip_meta(job, channel)
            meta_json = json.dumps(meta, ensure_ascii=False) if meta else None
            default_badge = (preset.get("badges") or [None])[0]

            existing_rows = conn.execute(
                "SELECT start_time, end_time FROM clips WHERE job_id = ?", (job_id,)
            ).fetchall()
            existing = [
                (float(row["start_time"]), float(row["end_time"])) for row in existing_rows
            ]

            if mode == "replace":
                conn.execute("DELETE FROM clips WHERE job_id = ?", (job_id,))
                conn.commit()
                chosen = detected
                skipped = 0
            else:
                chosen = _new_windows(detected, existing)
                skipped = len(detected) - len(chosen)

            clip_ids = (
                insert_clips(
                    conn,
                    job_id,
                    chosen,
                    preset,
                    meta_json=meta_json,
                    default_badge=default_badge,
                )
                if chosen
                else []
            )

        state = _write_state(
            job_id,
            status="done",
            added=len(clip_ids),
            skipped=skipped,
            source=source,
            error="",
        )
        print(
            f"[redetect] job {job_id} {mode}: +{len(clip_ids)} clips "
            f"({skipped} skipped, {source})"
        )
        return state
    except Exception as exc:  # noqa: BLE001
        print(f"[redetect] job {job_id} failed: {exc}")
        return _write_state(job_id, status="error", error=str(exc))
