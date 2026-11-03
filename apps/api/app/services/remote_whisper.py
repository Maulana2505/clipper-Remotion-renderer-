from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import httpx

from ..services.media import extract_audio_segment

_CHUNK_SECONDS = int(os.getenv("REMOTE_CHUNK_SECONDS", "600"))
_MAX_RETRIES = int(os.getenv("REMOTE_MAX_RETRIES", "2"))
_HEALTH_TIMEOUT = 10.0


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
        "timeout": os.getenv("REMOTE_WHISPER_TIMEOUT", "900"),
    }


def is_configured() -> bool:
    cfg = _config()
    return bool(cfg["url"] and cfg["token"])


def _auth_headers(cfg: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {cfg['token']}"}


def _http_timeout() -> httpx.Timeout:
    return httpx.Timeout(connect=15.0, read=float(_config()["timeout"]), write=300.0, pool=15.0)


def _parse_error(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            for key in ("detail", "error", "message"):
                if key in data:
                    val = data[key]
                    if isinstance(val, (dict, list)):
                        return str(val)[:500]
                    return str(val)[:500]
    except Exception:  # noqa: BLE001
        pass
    return (response.text or "")[:500]


def probe_remote(url: str, token: str | None) -> tuple[bool, str]:
    url = url.rstrip("/")
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with httpx.Client(timeout=_HEALTH_TIMEOUT) as client:
            response = client.get(f"{url}/health", headers=headers)
        if response.status_code == 401:
            return False, "Unauthorized: check the token."
        if response.status_code >= 400:
            return False, f"Worker error {response.status_code}: {_parse_error(response)}"
        data = response.json()
        status = data.get("status", "?")
        model = data.get("model", "?")
        device = data.get("device", "?")
        loaded = data.get("model_loaded")
        cuda = data.get("cuda_available")
        suffix = ""
        if loaded is False:
            suffix = " (model not loaded yet — first request will load it)"
        if cuda is False and device == "cuda":
            suffix += " (WARNING: CUDA not available on worker!)"
        return True, f"OK: {model} on {device} ({status}){suffix}"
    except Exception as exc:  # noqa: BLE001
        return False, f"Could not reach worker: {exc}"


def _post_one(cfg: dict[str, str], url_path: str, audio_path: Path, offset: float, params: dict[str, Any]) -> list[dict]:
    headers = _auth_headers(cfg)
    timeout = _http_timeout()
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            with audio_path.open("rb") as handle:
                files = {"file": (audio_path.name, handle, "audio/wav")}
                data = {
                    "offset": str(offset),
                    "language": params.get("language", "auto"),
                    "mode": params.get("mode", "balanced"),
                    "hotwords": params.get("hotwords") or "",
                }
                with httpx.Client(timeout=timeout) as client:
                    response = client.post(f"{cfg['url']}{url_path}", headers=headers, files=files, data=data)
            if response.status_code >= 400:
                raise RuntimeError(f"Worker {response.status_code}: {_parse_error(response)}")
            payload = response.json()
            segments = payload.get("segments") or []
            if payload.get("relative"):
                for seg in segments:
                    seg["start"] = float(seg["start"]) + offset
                    seg["end"] = float(seg["end"]) + offset
                    for w in seg.get("words") or []:
                        w["start"] = float(w["start"]) + offset
                        w["end"] = float(w["end"]) + offset
            return segments
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < _MAX_RETRIES:
                sleep_for = 2 ** attempt * 2
                print(f"[remote_whisper] attempt {attempt + 1} failed: {exc}; retrying in {sleep_for}s", flush=True)
                time.sleep(sleep_for)
            else:
                break
    assert last_exc is not None
    raise last_exc


def _dedupe(segments: list[dict]) -> list[dict]:
    # Drop segments whose midpoint duplicates an earlier one (chunk overlap).
    out: list[dict] = []
    for seg in sorted(segments, key=lambda s: s["start"]):
        mid = (float(seg["start"]) + float(seg["end"])) / 2.0
        dup = False
        for prev in out:
            pmid = (float(prev["start"]) + float(prev["end"])) / 2.0
            if abs(pmid - mid) < 0.5 and abs(float(prev["start"]) - float(seg["start"])) < 1.0:
                dup = True
                break
        if not dup:
            out.append(seg)
    return out


def remote_transcribe(audio_path: Path, offset: float, params: dict[str, Any], on_progress=None) -> list[dict]:
    """Transcribe a (possibly long) audio file via the remote worker.

    Long audio is sent in chunks to stay under Cloudflare's upload limit.
    """
    cfg = _config()
    if not cfg["url"] or not cfg["token"]:
        raise RuntimeError("Remote worker not configured.")

    # Precheck health so we fail fast instead of uploading into the void.
    try:
        with httpx.Client(timeout=_HEALTH_TIMEOUT) as client:
            hr = client.get(f"{cfg['url']}/health", headers=_auth_headers(cfg))
        if hr.status_code >= 400:
            raise RuntimeError(f"Worker health check failed {hr.status_code}: {_parse_error(hr)}")
    except RuntimeError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Could not reach worker: {exc}") from exc

    # Determine duration. Prefer explicit param; otherwise probe.
    duration = params.get("_duration")
    if not duration:
        try:
            from .media import probe_media
            duration = float(probe_media(audio_path).get("duration") or 0.0)
        except Exception:  # noqa: BLE001
            duration = 0.0

    if not duration or duration <= _CHUNK_SECONDS:
        # Single request path (also used for clip-scoped short audio).
        if on_progress is not None:
            try:
                on_progress(1, 1)
            except Exception:  # noqa: BLE001
                pass
        return _post_one(cfg, "/transcribe", audio_path, offset, params)

    # Chunked path.
    job_dir = audio_path.parent
    total_chunks = int((duration + _CHUNK_SECONDS - 1) // _CHUNK_SECONDS)
    all_segments: list[dict] = []
    for idx in range(total_chunks):
        start = idx * _CHUNK_SECONDS
        length = min(_CHUNK_SECONDS, duration - start)
        if length < 0.5:
            continue
        chunk_path = job_dir / f"_remote_chunk_{idx}.wav"
        try:
            extract_audio_segment(audio_path, chunk_path, start, length)
            print(f"[transcribe] remote chunk {idx + 1}/{total_chunks} ({start / 60:.1f}-{(start + length) / 60:.1f} min)", flush=True)
            if on_progress is not None:
                try:
                    on_progress(idx + 1, total_chunks)
                except Exception:  # noqa: BLE001
                    pass
            segs = _post_one(cfg, "/transcribe", chunk_path, offset + start, params)
            all_segments.extend(segs)
        finally:
            try:
                chunk_path.unlink(missing_ok=True)
            except Exception:
                pass
    return _dedupe(all_segments)