"""Faster-Whisper worker for Google Colab (GPU).

Run with:
    uvicorn worker:app --host 0.0.0.0 --port 8010
Then expose via cloudflared:
    cloudflared tunnel --url http://127.0.0.1:8010
"""

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="Clipper Whisper Worker")

TOKEN = os.getenv("WORKER_TOKEN", "change-me")
MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE = "cuda"
COMPUTE = os.getenv("WHISPER_COMPUTE", "float16")

_model = None


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE)
    return _model


@app.get("/health")
def health(authorization: str = ""):
    # Simple bearer check (optional on health)
    return {"status": "ok", "model": MODEL_NAME, "device": DEVICE, "mode_default": "balanced"}


def _auth(auth_header: str):
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    if auth_header.split(" ", 1)[1].strip() != TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token.")


from fastapi import Header


@app.post("/transcribe")
async def transcribe2(
    file: UploadFile = File(...),
    authorization: str = Header(None),
    language: str = Form("auto"),
    mode: str = Form("balanced"),
    hotwords: str = Form(""),
    offset: str = Form("0"),
):
    _auth(authorization or "")
    try:
        off = float(offset)
    except ValueError:
        off = 0.0

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        data = await file.read()
        tmp.write(data)
        tmp_path = Path(tmp.name)

    try:
        model = get_model()
        lang = None if language == "auto" else language
        if mode == "fast":
            params = dict(beam_size=1, best_of=1, temperature=0.0, batch_size=8)
        elif mode == "accurate":
            params = dict(beam_size=5, best_of=5, temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0], patience=1.0)
        else:
            params = dict(beam_size=5, best_of=5, temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0])

        kwargs = {
            "word_timestamps": True,
            "vad_filter": True,
            "vad_parameters": {"min_silence_duration_ms": 500},
            "condition_on_previous_text": False,
            "no_speech_threshold": 0.6,
            "compression_ratio_threshold": 2.4,
        }
        if lang is not None:
            kwargs["language"] = lang
        if hotwords:
            kwargs["hotwords"] = hotwords
        kwargs.update(params)

        segments_iter, info = model.transcribe(str(tmp_path), **kwargs)
        segments = []
        for seg in segments_iter:
            text = (seg.text or "").strip()
            if not text:
                continue
            words = []
            if getattr(seg, "words", None):
                for w in seg.words:
                    token = (w.word or "").strip()
                    if token:
                        words.append({"word": token, "start": float(w.start), "end": float(w.end)})
            if not words:
                ws = text.split()
                step = (float(seg.end) - float(seg.start)) / max(1, len(ws))
                words = [{"word": wd, "start": float(seg.start) + i * step, "end": float(seg.start) + (i + 1) * step} for i, wd in enumerate(ws)]
            segments.append({
                "start": float(seg.start),
                "end": float(seg.end),
                "text": text,
                "words": words,
            })
        return JSONResponse({"segments": segments, "language": getattr(info, "language", "unknown"), "relative": True})
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass