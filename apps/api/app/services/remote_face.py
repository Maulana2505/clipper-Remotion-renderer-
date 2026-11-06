from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import httpx

from ..core.config import FFMPEG
from ..services.media import run


def _config() -> dict[str, str]:
    from ..db import get_conn, row_to_dict

    with get_conn() as conn:
        row = row_to_dict(conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone())
    data = row or {}
    from ..core.security import decrypt_secret

    token = decrypt_secret(data.get("encrypted_remote_token"))
    return {
        "url": (data.get("remote_whisper_url") or "").rstrip("/"),
        "token": token or "",
        "timeout": os.getenv("REMOTE_FACE_TIMEOUT", "300"),
    }


def is_configured() -> bool:
    cfg = _config()
    return bool(cfg["url"] and cfg["token"])


def _auth_headers(cfg: dict[str, str]) -> dict[str, str]:
    return {"Authorization": "Bearer " + cfg["token"]}


def extract_face_clip(source, start, end, destination, sample_seconds=0.4, width=480):
    duration = max(0.1, float(end) - float(start))
    fps = 1.0 / max(0.1, sample_seconds)
    vf = "fps={:.4f},scale={}: -2".format(fps, width).replace(" ", "")
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
        "-ss", "{:.3f}".format(max(0.0, start)),
        "-i", str(source),
        "-t", "{:.3f}".format(duration),
        "-an",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
        "-movflags", "+faststart",
        str(destination),
    ]
    result = run(cmd, timeout=60 * 10)
    if result.returncode != 0 or not destination.exists() or destination.stat().st_size < 1024:
        raise RuntimeError("Could not extract face clip: " + str(result.stderr)[-300:])
    return destination


def remote_face_track(source, start, end, on_progress=None, sample_seconds=0.4):
    cfg = _config()
    if not cfg["url"] or not cfg["token"]:
        raise RuntimeError("Remote worker not configured.")

    try:
        with httpx.Client(timeout=10.0) as client:
            hr = client.get(cfg["url"] + "/health", headers=_auth_headers(cfg))
        if hr.status_code >= 400:
            raise RuntimeError("Worker health check failed " + str(hr.status_code))
        health = hr.json()
        if health.get("face_ready") is False:
            raise RuntimeError("Worker does not support face tracking (opencv missing).")
    except RuntimeError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Could not reach worker: " + str(exc)) from exc

    job_dir = source.parent
    clip_path = job_dir / ("_face_remote_%d_%d.mp4" % (int(start), int(end)))
    try:
        extract_face_clip(source, start, end, clip_path, sample_seconds=sample_seconds)
        if on_progress is not None:
            try:
                on_progress(10)
            except Exception:  # noqa: BLE001
                pass

        timeout = httpx.Timeout(connect=15.0, read=float(cfg["timeout"]), write=300.0, pool=15.0)
        last_exc = None
        for attempt in range(3):
            try:
                with clip_path.open("rb") as handle:
                    files = {"file": (clip_path.name, handle, "video/mp4")}
                    data = {
                        "offset": str(start),
                        "sample_seconds": str(sample_seconds),
                    }
                    with httpx.Client(timeout=timeout) as client:
                        response = client.post(
                            cfg["url"] + "/face-track",
                            headers=_auth_headers(cfg),
                            files=files,
                            data=data,
                        )
                if response.status_code >= 400:
                    raise RuntimeError("Worker " + str(response.status_code) + ": " + response.text[:300])
                payload = response.json()
                if on_progress is not None:
                    try:
                        on_progress(100)
                    except Exception:  # noqa: BLE001
                        pass
                return payload
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < 2:
                    time.sleep(2 ** attempt * 2)
                else:
                    break
        assert last_exc is not None
        raise last_exc
    finally:
        try:
            clip_path.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
