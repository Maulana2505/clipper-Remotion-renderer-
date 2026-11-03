from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx


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
        "timeout": os.getenv("REMOTE_WHISPER_TIMEOUT", "300"),
    }


def is_configured() -> bool:
    cfg = _config()
    return bool(cfg["url"] and cfg["token"])


def probe_remote(url: str, token: str | None) -> tuple[bool, str]:
    url = url.rstrip("/")
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with httpx.Client(timeout=15) as client:
            response = client.get(f"{url}/health", headers=headers)
        if response.status_code == 401:
            return False, "Unauthorized: check the token."
        response.raise_for_status()
        data = response.json()
        return True, f"OK: {data.get('model', '?')} on {data.get('device', '?')}"
    except Exception as exc:  # noqa: BLE001
        return False, f"Could not reach worker: {exc}"


def remote_transcribe(audio_path: Path, offset: float, params: dict[str, Any]) -> list[dict]:
    cfg = _config()
    if not cfg["url"] or not cfg["token"]:
        raise RuntimeError("Remote worker not configured.")
    url = cfg["url"]
    headers = {"Authorization": f"Bearer {cfg['token']}"}
    timeout = float(cfg["timeout"])
    with audio_path.open("rb") as handle:
        files = {"file": (audio_path.name, handle, "audio/wav")}
        data = {
            "offset": str(offset),
            "language": params.get("language", "auto"),
            "mode": params.get("mode", "balanced"),
            "hotwords": params.get("hotwords") or "",
        }
        with httpx.Client(timeout=timeout) as client:
            response = client.post(f"{url}/transcribe", headers=headers, files=files, data=data)
    response.raise_for_status()
    payload = response.json()
    segments = payload.get("segments") or []
    # Apply offset if the worker returned relative times.
    if payload.get("relative"):
        for seg in segments:
            seg["start"] = float(seg["start"]) + offset
            seg["end"] = float(seg["end"]) + offset
            for w in seg.get("words") or []:
                w["start"] = float(w["start"]) + offset
                w["end"] = float(w["end"]) + offset
    return segments