from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..core.security import decrypt_secret, encrypt_secret, mask_secret
from ..db import get_conn, now_iso
from ..schemas import LlmSettingsUpdate, LlmTestRequest
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
