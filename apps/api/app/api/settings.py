from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..core.security import decrypt_secret, encrypt_secret, mask_secret
from ..db import get_conn, now_iso
from ..core.config import WHISPER_MODEL
from ..services.models import normalize_model
from ..core.security import decrypt_secret, encrypt_secret, mask_secret
from ..schemas import LlmSettingsUpdate, LlmTestRequest, WhisperSettingsUpdate
from ..services.llm import test_connection

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _serialize(row) -> dict:
    if row is None:
        return {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "base_url": None,
            "temperature": 0.3,
            "max_clips": 20,
            "whisper_model": WHISPER_MODEL,
            "whisper_backend": "local",
            "whisper_language": "auto",
            "whisper_mode": "balanced",
            "whisper_hotwords": None,
            "remote_whisper_url": None,
            "remote_token_masked": "",
            "api_key_masked": "",
            "configured": False,
        }
    data = dict(row)
    api_key = decrypt_secret(data.get("encrypted_api_key"))
    return {
        "provider": data.get("provider") or "openai",
        "model": data.get("model") or "gpt-4o-mini",
        "base_url": data.get("base_url"),
        "temperature": float(data.get("temperature") or 0.3),
        "max_clips": int(data.get("max_clips") or 20),
        "whisper_model": data.get("whisper_model") or WHISPER_MODEL,
        "whisper_backend": data.get("whisper_backend") or "local",
        "whisper_language": data.get("whisper_language") or "auto",
        "whisper_mode": data.get("whisper_mode") or "balanced",
        "whisper_hotwords": data.get("whisper_hotwords"),
        "remote_whisper_url": data.get("remote_whisper_url"),
        "remote_token_masked": mask_secret(decrypt_secret(data.get("encrypted_remote_token"))),
        "api_key_masked": mask_secret(api_key),
        "configured": bool(api_key),
        "updated_at": data.get("updated_at"),
    }


@router.get("/llm")
def get_llm_settings():
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    return _serialize(row)


@router.put("/llm")
def save_llm_settings(payload: LlmSettingsUpdate):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
        encrypted = row["encrypted_api_key"] if row else None
        if payload.api_key is not None:
            encrypted = encrypt_secret(payload.api_key.strip()) if payload.api_key.strip() else None
        conn.execute(
            """
            INSERT INTO app_settings (id, provider, model, encrypted_api_key, base_url, temperature, max_clips, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                model = excluded.model,
                encrypted_api_key = excluded.encrypted_api_key,
                base_url = excluded.base_url,
                temperature = excluded.temperature,
                max_clips = excluded.max_clips,
                updated_at = excluded.updated_at
            """,
            (
                payload.provider,
                payload.model,
                encrypted,
                payload.base_url or None,
                payload.temperature,
                payload.max_clips,
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    return _serialize(row)


@router.post("/llm/test")
def test_llm_settings(payload: LlmTestRequest):
    if not payload.api_key.strip():
        raise HTTPException(status_code=422, detail="API key is required.")
    ok, message = test_connection(
        payload.provider,
        payload.model,
        payload.api_key.strip(),
        payload.base_url,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "message": message}


@router.delete("/llm")
def clear_llm_settings():
    with get_conn() as conn:
        conn.execute(
            "UPDATE app_settings SET encrypted_api_key = NULL, updated_at = ? WHERE id = 1",
            (now_iso(),),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    return _serialize(row)
@router.get("/whisper")
def get_whisper_settings():
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    data = dict(row) if row else {}
    token = decrypt_secret(data.get("encrypted_remote_token"))
    return {
        "model": normalize_model(data.get("whisper_model") or WHISPER_MODEL),
        "backend": data.get("whisper_backend") or "local",
        "language": data.get("whisper_language") or "auto",
        "mode": data.get("whisper_mode") or "balanced",
        "hotwords": data.get("whisper_hotwords"),
        "remote_url": data.get("remote_whisper_url"),
        "remote_token_masked": mask_secret(token),
    }


@router.put("/whisper")
def save_whisper_settings(payload: WhisperSettingsUpdate):
    with get_conn() as conn:
        row = conn.execute("SELECT encrypted_remote_token FROM app_settings WHERE id = 1").fetchone()
        encrypted = row["encrypted_remote_token"] if row else None
        if payload.remote_token is not None:
            encrypted = encrypt_secret(payload.remote_token.strip()) if payload.remote_token.strip() else None
        conn.execute(
            """
            INSERT INTO app_settings (id, provider, model, temperature, max_clips, whisper_model, whisper_backend, whisper_language, whisper_mode, whisper_hotwords, remote_whisper_url, encrypted_remote_token, updated_at)
            VALUES (1, 'openai', 'gpt-4o-mini', 0.3, 20, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                whisper_model = excluded.whisper_model,
                whisper_backend = excluded.whisper_backend,
                whisper_language = excluded.whisper_language,
                whisper_mode = excluded.whisper_mode,
                whisper_hotwords = excluded.whisper_hotwords,
                remote_whisper_url = excluded.remote_whisper_url,
                encrypted_remote_token = excluded.encrypted_remote_token,
                updated_at = excluded.updated_at
            """,
            (
                payload.model,
                payload.backend,
                payload.language,
                payload.mode,
                payload.hotwords,
                payload.remote_url,
                encrypted,
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    data = dict(row) if row else {}
    token = decrypt_secret(data.get("encrypted_remote_token"))
    return {
        "model": normalize_model(data.get("whisper_model") or WHISPER_MODEL),
        "backend": data.get("whisper_backend") or "local",
        "language": data.get("whisper_language") or "auto",
        "mode": data.get("whisper_mode") or "balanced",
        "hotwords": data.get("whisper_hotwords"),
        "remote_url": data.get("remote_whisper_url"),
        "remote_token_masked": mask_secret(token),
    }


@router.post("/whisper/test")
def test_whisper_settings(payload: WhisperSettingsUpdate):
    if payload.backend != "remote":
        return {"ok": True, "message": "Local backend selected."}
    if not payload.remote_url:
        raise HTTPException(status_code=422, detail="Remote URL is required.")
    from ..services.remote_whisper import probe_remote
    ok, message = probe_remote(payload.remote_url, payload.remote_token)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "message": message}
