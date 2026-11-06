"""Remotion-based clip renderer.

The clip visuals are produced exclusively by the shared React package
(`packages/video`) through `apps/render/render.mjs`. FFmpeg is only used for
media preparation: extracting the frame sequence and the clip audio, then
muxing the rendered video with that audio.

Frame-sequence prepass exists because Remotion's `OffthreadVideo` costs a
per-frame process spawn; on a 2-core laptop that limits rendering to ~4 fps.
Feeding Chromium pre-extracted JPEGs measures ~12 fps at the same 1080p output
(see spike results in README).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Callable

from ..core.config import FFMPEG, JOBS_DIR
from ..services.media import download_video
from .media import MediaError, run

RENDER_APP_DIR = Path(__file__).resolve().parents[3] / "render"
FPS = 30
JPEG_QUALITY = 3
MAX_FRAME_WIDTH = 1920

# Remotion renders are CPU heavy; run them one at a time.
_RENDER_LOCK = threading.Lock()

ProgressCallback = Callable[[int], None]


def _node_binary() -> str:
    node = shutil.which("node")
    if not node:
        raise MediaError("Node.js not found. Install Node 20+ to render clips.")
    return node


def _frame_count(duration: float, fps: int = FPS) -> int:
    return max(1, round(duration * fps))


def _extract_frames(source: Path, start: float, end: float, out_dir: Path, prefix: str = "main") -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = max(0.1, end - start)
    # Keep the source aspect ratio: scale the long edge, never distort.
    scale = (
        f"scale=w='if(gte(iw,ih),{MAX_FRAME_WIDTH},-2)':"
        f"h='if(gte(iw,ih),-2,{MAX_FRAME_WIDTH})'"
    )
    cmd = [
        FFMPEG,
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(source),
        "-vf",
        f"fps={FPS},{scale}",
        "-frames:v",
        str(_frame_count(duration)),
        "-q:v",
        str(JPEG_QUALITY),
        str(out_dir / f"{prefix}-%04d.jpg"),
    ]
    result = run(cmd, timeout=60 * 20)
    if result.returncode != 0:
        raise MediaError(f"Frame extraction failed: {result.stderr[-400:]}")
    produced = len(list(out_dir.glob(f"{prefix}-*.jpg")))
    if produced == 0:
        raise MediaError("Frame extraction produced no frames.")
    return produced


def _extract_frames_loop(source: Path, frame_count: int, out_dir: Path, prefix: str) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = max(0.1, frame_count / FPS)
    scale = (
        f"scale=w='if(gte(iw,ih),{MAX_FRAME_WIDTH},-2)':"
        f"h='if(gte(iw,ih),-2,{MAX_FRAME_WIDTH})'"
    )
    cmd = [
        FFMPEG,
        "-hide_banner",
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        str(source),
        "-t",
        f"{duration:.3f}",
        "-vf",
        f"fps={FPS},{scale}",
        "-frames:v",
        str(frame_count),
        "-q:v",
        str(JPEG_QUALITY),
        str(out_dir / f"{prefix}-%04d.jpg"),
    ]
    result = run(cmd, timeout=60 * 20)
    if result.returncode != 0:
        raise MediaError(f"Frame extraction failed: {result.stderr[-400:]}")
    produced = len(list(out_dir.glob(f"{prefix}-*.jpg")))
    if produced == 0:
        raise MediaError("Frame extraction produced no frames.")
    return produced


def _extract_audio(source: Path, start: float, end: float, destination: Path) -> bool:
    duration = max(0.1, end - start)
    cmd = [
        FFMPEG,
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(source),
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(destination),
    ]
    result = run(cmd, timeout=60 * 10)
    return result.returncode == 0 and destination.exists() and destination.stat().st_size > 0


def _run_renderer(props_path: Path, output: Path, on_progress: ProgressCallback | None) -> int:
    cmd = [_node_binary(), "render.mjs", "--props", str(props_path), "--out", str(output)]
    process = subprocess.Popen(
        cmd,
        cwd=str(RENDER_APP_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    tail: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip()
        tail.append(line)
        if len(tail) > 40:
            tail.pop(0)
        if line.startswith("PROGRESS ") and on_progress:
            try:
                on_progress(int(line.split()[1]))
            except (IndexError, ValueError):
                pass
    code = process.wait()
    if code != 0:
        detail = "\n".join(tail[-12:]) or "no output"
        raise MediaError(f"Remotion render failed (exit {code}):\n{detail}")
    return code


def _mux_audio(video: Path, audio: Path, output: Path) -> None:
    cmd = [
        FFMPEG,
        "-hide_banner",
        "-y",
        "-i",
        str(video),
        "-i",
        str(audio),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(output),
    ]
    result = run(cmd, timeout=60 * 10)
    if result.returncode != 0:
        raise MediaError(f"Audio mux failed: {result.stderr[-400:]}")


def _shift_words(transcript: dict, start: float, end: float) -> list[dict]:
    words: list[dict] = []
    for segment in transcript.get("segments") or []:
        for word in segment.get("words") or []:
            try:
                w_start = float(word["start"])
                w_end = float(word["end"])
            except (KeyError, TypeError, ValueError):
                continue
            text = str(word.get("word") or "").strip()
            if not text or w_end <= start or w_start >= end:
                continue
            words.append(
                {
                    "word": text,
                    "start": round(max(0.0, w_start - start), 3),
                    "end": round(max(0.0, w_end - start), 3),
                }
            )
    words.sort(key=lambda item: item["start"])
    return words


def _shift_face(face_track: dict, duration: float) -> list[dict]:
    keyframes: list[dict] = []
    for item in face_track.get("keyframes") or []:
        try:
            t = float(item["t"])
            x = float(item["x"])
            y = float(item["y"])
        except (KeyError, TypeError, ValueError):
            continue
        if -0.05 <= t <= duration + 0.05:
            keyframes.append({"t": round(max(0.0, t), 3), "x": x, "y": y})
    return keyframes


def build_props(
    *,
    canvas: dict,
    clip: dict,
    job: dict,
    transcript: dict,
    face_track: dict,
    frames_prefix: str,
    accent: str,
    badge: str | None,
    meta: dict | None,
) -> dict:
    start = float(clip["start_time"])
    end = float(clip["end_time"])
    duration = max(0.1, end - start)

    return {
        "canvas": {
            "id": canvas.get("id"),
            "width": int(canvas["width"]),
            "height": int(canvas["height"]),
            "fps": FPS,
            "safe_area": canvas.get("safe_area"),
        },
        "clip": {"start": start, "end": end},
        "source": {
            "url": "spike/placeholder.mp4",
            "width": int(job.get("width") or 1920),
            "height": int(job.get("height") or 1080),
        },
        "media": {"mode": "frames", "frames": {"mainPrefix": frames_prefix}},
        "layout": clip.get("video_template") or "auto_crop",
        "crop": clip.get("crop") or {"x": 0.5, "y": 0.5, "zoom": 1.0},
        "overlays": clip.get("overlays") or [],
        "caption": {
            "enabled": bool(clip.get("caption_enabled", 1)),
            "template": clip.get("caption_template") or "plain_white",
            "font": clip.get("font_preset") or "anton",
            "accent": accent,
            "layout": clip.get("caption_layout") or None,
        },
        "words": _shift_words(transcript, start, end),
        "face": {"keyframes": _shift_face(face_track, duration)},
        "meta": {**(meta or {}), "title": clip.get("title") or "", "badge": badge},
    }


def render_clip_remotion(*,
    source: Path,
    clip: dict,
    job: dict,
    canvas: dict,
    transcript: dict,
    face_track: dict,
    output: Path,
    accent: str = "#CCFF00",
    badge: str | None = None,
    meta: dict | None = None,
    on_progress: ProgressCallback | None = None,
) -> dict:
    """Render one clip and return ``{"duration_ms", "frames"}``."""
    start = float(clip["start_time"])
    end = float(clip["end_time"])

    # Remotion's staticFile() only resolves inside apps/render/public, so the
    # frame sequence and the silent render live there; the final file is moved
    # to the job folder afterwards.
    workspace = RENDER_APP_DIR / "public" / "renders" / output.parent.name
    if workspace.exists():
        shutil.rmtree(workspace, ignore_errors=True)
    workspace.mkdir(parents=True, exist_ok=True)
    frames_dir = workspace / "frames"
    silent = workspace / "silent.mp4"
    audio = workspace / "audio.m4a"
    props_path = workspace / "props.json"
    output.parent.mkdir(parents=True, exist_ok=True)

    with _RENDER_LOCK:
        if on_progress:
            on_progress(5)
        frames = _extract_frames(source, start, end, frames_dir)
        # Align composition duration with the extracted frames so the last frame
        # can never be missing.
        effective_end = start + frames / FPS

        # Extract frames for overlays that use a different source video.
        overlays = [dict(o) for o in (clip.get("overlays") or [])]
        main_source_str = str(source)
        for overlay in overlays:
            source_url = (overlay.get("source_url") or "").strip()
            if not source_url or source_url == main_source_str:
                overlay["framePrefix"] = f"renders/{workspace.name}/frames/main-"
                continue
            try:
                if Path(source_url).exists():
                    overlay_source = Path(source_url)
                else:
                    dest = workspace / f"overlay-src-{overlay.get('id') or 'x'}.mp4"
                    overlay_source = download_video(source_url, dest)
                prefix = f"overlay-{overlay.get('id') or 'x'}"
                _extract_frames_loop(overlay_source, frames, frames_dir, prefix)
                overlay["framePrefix"] = f"renders/{workspace.name}/frames/{prefix}-"
            except Exception as exc:  # noqa: BLE001
                print(f"[render] overlay source failed: {exc}")
                overlay["framePrefix"] = None

        has_audio = _extract_audio(source, start, effective_end, audio)
        if on_progress:
            on_progress(20)

        aligned_clip = {**clip, "start_time": start, "end_time": effective_end, "overlays": overlays}
        props = build_props(
            canvas=canvas,
            clip=aligned_clip,
            job=job,
            transcript=transcript,
            face_track=face_track,
            frames_prefix=f"renders/{workspace.name}/frames/main-",
            accent=accent,
            badge=badge,
            meta=meta,
        )
        props_path.write_text(json.dumps(props, ensure_ascii=False, indent=2), encoding="utf-8")

        def report(percent: int) -> None:
            if on_progress:
                on_progress(min(95, 20 + int(percent * 0.75)))

        _run_renderer(props_path, silent, report)

        if has_audio:
            _mux_audio(silent, audio, output)
        else:
            shutil.move(str(silent), str(output))

        if on_progress:
            on_progress(98)

        shutil.rmtree(workspace, ignore_errors=True)

    return {"duration_ms": int(round(frames / FPS * 1000)), "frames": frames}
