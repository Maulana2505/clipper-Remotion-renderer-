from __future__ import annotations

import json
import uuid
from pathlib import Path

from ..core.config import FFMPEG, JOBS_DIR
from ..db import get_conn, now_iso, update_job
from ..templates import NICHE_BY_ID
from .face import track_faces
from .llm import detect_clips
from .media import (
    MediaError,
    download_video,
    ensure_disk_space,
    extract_audio,
    fetch_video_title,
    probe_media,
    run,
    try_download_subtitles,
)
from .transcribe import fallback_transcript, transcribe_audio, transcribe_from_vtt

PRESET_FIELDS = ("canvas", "video_template", "caption_template", "font_preset", "accent")


def _job_dir(job_id: str) -> Path:
    path = JOBS_DIR / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_channel(conn, channel_id: str | None) -> dict | None:
    if not channel_id:
        return None
    row = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
    return dict(row) if row else None


def _resolve_preset(job: dict, channel: dict | None) -> dict:
    """Niche default, overridden by the channel profile. Clip edits win later."""
    niche = (channel or {}).get("niche") or job.get("niche") or "generic"
    preset = dict(NICHE_BY_ID.get(niche) or NICHE_BY_ID["generic"])
    preset["caption_enabled"] = True
    if channel:
        for field in PRESET_FIELDS:
            if channel.get(field):
                preset[field] = channel[field]
        if channel.get("caption_enabled") is not None:
            preset["caption_enabled"] = bool(channel["caption_enabled"])
    return preset


def _clip_meta(job: dict, channel: dict | None) -> dict:
    meta: dict = {}
    raw = job.get("meta_json")
    if raw:
        try:
            meta.update(json.loads(raw))
        except json.JSONDecodeError:
            pass
    if channel and channel.get("language") and not meta.get("language"):
        meta["language"] = channel["language"]
    return {key: value for key, value in meta.items() if value not in (None, "", [], {})}


def _trim_source(source: Path, start: float, end: float, job_dir: Path) -> Path:
    """Cut an uploaded file down to the requested import window."""
    trimmed = job_dir / "source-window.mp4"
    duration = max(0.1, end - start)
    base = [FFMPEG, "-hide_banner", "-y", "-ss", f"{max(0.0, start):.3f}", "-i", str(source), "-t", f"{duration:.3f}", "-an"]
    fast = base + ["-c:v", "copy", "-avoid_negative_ts", "make_zero", str(trimmed)]
    result = run(fast, timeout=60 * 30)
    if result.returncode == 0 and trimmed.exists() and trimmed.stat().st_size > 0:
        return trimmed
    slow = base + ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(trimmed)]
    result = run(slow, timeout=60 * 60)
    if result.returncode != 0 or not trimmed.exists():
        raise MediaError(f"Could not trim the import range: {result.stderr[-300:]}")
    return trimmed


def process_job(job_id: str) -> None:
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            return
        job = dict(row)
        job_dir = _job_dir(job_id)
        source = Path(job.get("video_path") or job_dir / "source.mp4")
        channel = _load_channel(conn, job.get("channel_id"))
        preset = _resolve_preset(job, channel)

        raw_start = job.get("source_start")
        raw_end = job.get("source_end")
        window = None
        if raw_start is not None:
            window = (max(0.0, float(raw_start)), float(raw_end) if raw_end is not None else None)

        update_job(conn, job_id, status="processing", stage="download", progress=5, error="")
        ensure_disk_space()

        if job["source_type"] == "url":
            if not job.get("source_url"):
                raise MediaError("Missing source URL.")
            update_job(conn, job_id, stage="download", progress=8)
            section = None
            if window is not None:
                # Sections need an end; without one import the rest of the video.
                end = window[1] if window[1] is not None else window[0] + 3600
                section = (window[0], max(window[0] + 1.0, end))
            source = download_video(job["source_url"], job_dir / "source.mp4", section=section)
            title = fetch_video_title(job["source_url"])
            if title:
                update_job(conn, job_id, stage="download", progress=24, title=title)
            try_download_subtitles(job["source_url"], job_dir)
            # yt-dlp sections start at 0, so the file is already the window.
            window = None
        elif not source.exists():
            raise MediaError("Uploaded video file is missing.")

        if window is not None and source.exists():
            probe = probe_media(source)
            total = float(probe["duration"] or 0)
            start = min(window[0], max(0.0, total - 1.0))
            end = window[1] if window[1] is not None else total
            end = min(end, total) if total > 0 else end
            if end - start >= 1.0:
                update_job(conn, job_id, stage="trim", progress=26)
                source = _trim_source(source, start, end, job_dir)
            else:
                raise MediaError("Import range is outside the video.")

        update_job(conn, job_id, stage="probe", progress=28, video_path=str(source))
        probe = probe_media(source)
        duration = float(probe["duration"] or 0)
        if duration <= 0:
            raise MediaError("Could not determine video duration.")
        update_job(
            conn,
            job_id,
            stage="audio",
            progress=32,
            duration=duration,
            width=int(probe.get("width") or 0),
            height=int(probe.get("height") or 0),
        )

        audio_path = extract_audio(source, job_dir / "audio.wav")
        update_job(conn, job_id, stage="transcribe", progress=38, audio_path=str(audio_path))

        transcript = transcribe_audio(audio_path, duration)
        if transcript is None:
            vtts = sorted(job_dir.glob("subs*.vtt"))
            transcript = transcribe_from_vtt(vtts[0], duration) if vtts else None
        if transcript is None:
            transcript = fallback_transcript(duration)

        transcript_path = job_dir / "transcript.json"
        transcript_path.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
        update_job(conn, job_id, stage="detect", progress=62, transcript_path=str(transcript_path))

        clips, clip_source = detect_clips(transcript, duration, job.get("niche"))
        if not clips:
            raise MediaError("No clips could be detected.")

        # Re-running a job should replace its clips rather than duplicate them.
        conn.execute("DELETE FROM clips WHERE job_id = ?", (job_id,))
        conn.commit()

        meta = _clip_meta(job, channel)
        meta_json = json.dumps(meta, ensure_ascii=False) if meta else None
        default_badge = (preset.get("badges") or [None])[0]

        total = len(clips)
        clip_ids: list[str] = []
        for index, clip in enumerate(clips, start=1):
            clip_id = uuid.uuid4().hex
            clip_ids.append(clip_id)
            clip_dir = job_dir / "clips" / clip_id
            clip_dir.mkdir(parents=True, exist_ok=True)
            face_track = track_faces(source, clip["start"], clip["end"])
            face_path = clip_dir / "face.json"
            face_path.write_text(json.dumps(face_track, ensure_ascii=False), encoding="utf-8")

            conn.execute(
                """
                INSERT INTO clips (
                    id, job_id, start_time, end_time, score, is_hot, hook, title, hashtags,
                    canvas, video_template, caption_template, caption_enabled, font_preset,
                    badge, accent, meta_json, face_track_path, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clip_id,
                    job_id,
                    clip["start"],
                    clip["end"],
                    clip["score"],
                    1 if clip.get("is_hot") else 0,
                    clip.get("hook") or "",
                    clip.get("title") or f"Clip {index}",
                    json.dumps(clip.get("hashtags") or []),
                    preset["canvas"],
                    preset["video_template"],
                    preset["caption_template"],
                    1 if preset.get("caption_enabled", True) else 0,
                    preset["font_preset"],
                    clip.get("badge") or default_badge,
                    preset["accent"],
                    meta_json,
                    str(face_path),
                    now_iso(),
                ),
            )
            conn.commit()
            progress = 70 + int((index / max(1, total)) * 28)
            update_job(conn, job_id, stage="face_track", progress=min(98, progress))

        update_job(
            conn,
            job_id,
            status="completed",
            stage="ready",
            progress=100,
            error="",
        )
        print(f"[pipeline] job {job_id} completed with {total} clips ({clip_source})")
    except Exception as exc:  # noqa: BLE001
        print(f"[pipeline] job {job_id} failed: {exc}")
        try:
            update_job(conn, job_id, status="failed", stage="failed", error=str(exc))
        except Exception:
            pass
    finally:
        conn.close()
