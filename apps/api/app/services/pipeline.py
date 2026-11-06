from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from ..core.config import FFMPEG, JOBS_DIR
from ..db import get_conn, now_iso, update_job
from ..templates import NICHE_BY_ID
from .highlights import detect_clips_from_audio
from .transcript_job import run_transcript
from .media import (
    MediaError,
    download_video,
    ensure_disk_space,
    fetch_video_title,
    probe_media,
    run,
    try_download_subtitles,
)

PRESET_FIELDS = ("canvas", "video_template", "caption_template", "font_preset", "accent")


def _job_dir(job_id: str) -> Path:
    path = JOBS_DIR / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_channel(conn, channel_id: str | None) -> dict | None:
    if not channel_id:
        return None
    row = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
    return dict(row) if row else None


def resolve_preset(job: dict, channel: dict | None) -> dict:
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


def clip_meta(job: dict, channel: dict | None) -> dict:
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


def insert_clips(
    conn,
    job_id: str,
    clips: list[dict],
    preset: dict,
    *,
    meta_json: str | None = None,
    default_badge: str | None = None,
    on_insert=None,
) -> list[str]:
    """Persist detected windows as clips. Shared by the build and re-detect."""
    total = len(clips)
    clip_ids: list[str] = []
    for index, clip in enumerate(clips, start=1):
        clip_id = uuid.uuid4().hex
        clip_ids.append(clip_id)
        signals_json = clip.get("signals_json")
        if signals_json is None and clip.get("signals") is not None:
            try:
                signals_json = json.dumps(clip.get("signals"), ensure_ascii=False)
            except (TypeError, ValueError):
                signals_json = None
        conn.execute(
            """
            INSERT INTO clips (
                id, job_id, start_time, end_time, score, is_hot, hook, title, hashtags,
                canvas, video_template, caption_template, caption_enabled, font_preset,
                badge, accent, meta_json, reason, signals_json, face_track_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                clip.get("reason") or "",
                signals_json,
                None,
                now_iso(),
            ),
        )
        conn.commit()
        if on_insert is not None:
            on_insert(index, total)
    return clip_ids


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


def _refine_clip_boundaries(job_id: str) -> None:
    """Snap each clip's start/end to the nearest word edges after transcription."""
    try:
        from .templates import DETECT_PROFILES
        import json
        with get_conn() as conn:
            job = row_to_dict(conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone())
        if not job or not job.get("video_path"):
            return
        niche = (job.get("niche") or "generic").lower()
        profile = DETECT_PROFILES.get(niche, DETECT_PROFILES["generic"])
        min_len = profile.get("min_len", 12)
        max_len = profile.get("max_len", 60)
        duration = float(job.get("duration") or 0.0)
        tpath = job.get("transcript_path")
        if not tpath:
            tpath = str(Path(job["video_path"]).parent / "transcript.json")
        tpath = Path(tpath)
        if not tpath.exists():
            return
        transcript = json.loads(tpath.read_text(encoding="utf-8"))
        words: list[tuple[float, float]] = []
        for seg in transcript.get("segments") or []:
            for w in seg.get("words") or []:
                try:
                    words.append((float(w["start"]), float(w["end"])))
                except (KeyError, TypeError, ValueError):
                    continue
        if not words:
            return
        with get_conn() as conn:
            rows = conn.execute("SELECT id, start_time, end_time FROM clips WHERE job_id = ?", (job_id,)).fetchall()
            for row in rows:
                cid = row["id"]
                start = float(row["start_time"])
                end = float(row["end_time"])
                cand = [w for w in words if w[1] >= start - 1.2 and w[0] <= end + 1.2]
                if not cand:
                    continue
                ns_opts = [w[0] for w in cand if start - 1.2 <= w[0] <= start + 1.2]
                ne_opts = [w[1] for w in cand if end - 1.2 <= w[1] <= end + 1.2]
                ns = (min(ns_opts) - 0.12) if ns_opts else start
                ne = (max(ne_opts) + 0.25) if ne_opts else end
                ns = max(0.0, ns)
                ne = min(duration if duration > 0 else end, ne)
                if ne - ns < min_len or ne - ns > max_len:
                    continue
                if abs(ns - start) < 0.05 and abs(ne - end) < 0.05:
                    continue
                conn.execute("UPDATE clips SET start_time = ?, end_time = ? WHERE id = ?", (ns, ne, cid))
            conn.commit()
        print(f"[pipeline] refined clip boundaries for job {job_id}")
    except Exception as exc:  # noqa: BLE001
        print(f"[pipeline] boundary refine skipped: {exc}")


def process_job(job_id: str) -> None:
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            return
        job = dict(row)
        job_dir = _job_dir(job_id)
        source = Path(job.get("video_path") or job_dir / "source.mp4")
        channel = load_channel(conn, job.get("channel_id"))
        preset = resolve_preset(job, channel)

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

        # Transcription and face tracking are opt-in from the Studio, so the
        # build only needs the loudness curve to find candidate moments.
        update_job(conn, job_id, stage="detect", progress=45)
        clips, clip_source = detect_clips_from_audio(source, duration, job.get("niche"))
        if not clips:
            raise MediaError("No clips could be detected.")

        # Re-running a job should replace its clips rather than duplicate them.
        conn.execute("DELETE FROM clips WHERE job_id = ?", (job_id,))
        conn.commit()

        meta = clip_meta(job, channel)
        meta_json = json.dumps(meta, ensure_ascii=False) if meta else None
        default_badge = (preset.get("badges") or [None])[0]

        insert_clips(
            conn,
            job_id,
            clips,
            preset,
            meta_json=meta_json,
            default_badge=default_badge,
            on_insert=lambda index, total: update_job(
                conn,
                job_id,
                stage="clips",
                progress=min(98, 70 + int((index / max(1, total)) * 28)),
            ),
        )
        total = len(clips)

        # Auto-transcription / full analysis at queue time.
        try:
            from ..db import row_to_dict as _rtd
            with get_conn() as _c:
                _settings = _rtd(_c.execute("SELECT auto_full_analysis, whisper_backend, remote_whisper_url, encrypted_remote_token FROM app_settings WHERE id = 1").fetchone()) or {}
        except Exception:  # noqa: BLE001
            _settings = {}
        auto_full = bool(_settings.get("auto_full_analysis"))
        if auto_full:
            update_job(conn, job_id, stage="transcribe", progress=80, error="")
            try:
                from .face_job import run_full_analysis
                # run synchronously inside the pipeline worker
                run_full_analysis(job_id, force=True)
            except Exception as exc:  # noqa: BLE001
                print(f"[pipeline] full analysis skipped: {exc}")
        else:
            mode = (os.getenv("TRANSCRIBE_ON_QUEUE") or "clips").lower()
            if mode in ("clips", "full"):
                update_job(conn, job_id, stage="transcribe", progress=80, error="")
                try:
                    run_transcript(
                        job_id,
                        mode,
                        on_progress=lambda done, tot: update_job(
                            conn,
                            job_id,
                            stage="transcribe",
                            progress=80 + int(18 * done / max(1, tot)),
                        ),
                    )
                except Exception as exc:  # noqa: BLE001
                    print(f"[pipeline] transcript skipped: {exc}")

            # Auto-refine clip boundaries to word edges (only at queue time).
            if mode in ("clips", "full"):
                _refine_clip_boundaries(job_id)

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
