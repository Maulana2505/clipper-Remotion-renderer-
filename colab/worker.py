"""Faster-Whisper worker for Google Colab (GPU).

Run with:
    uvicorn worker:app --host 0.0.0.0 --port 8010
Then expose via cloudflared:
    cloudflared tunnel --url http://127.0.0.1:8010
"""

import os
import sys
import tempfile
import traceback
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Header, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="Clipper Whisper Worker")

TOKEN = os.getenv("WORKER_TOKEN", "change-me")
MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
COMPUTE = os.getenv("WHISPER_COMPUTE", "float16")
ALLOW_CPU_FALLBACK = os.getenv("ALLOW_CPU_FALLBACK", "1") == "1"

_model = None
_load_error = None
_load_device = DEVICE
_load_compute = COMPUTE


def _cuda_available() -> bool:
    try:
        import ctranslate2  # type: ignore

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:  # noqa: BLE001
        return False


def _ctranslate2_version() -> str:
    try:
        import ctranslate2  # type: ignore

        return getattr(ctranslate2, "__version__", "?")
    except Exception:  # noqa: BLE001
        return "missing"


def get_model():
    global _model, _load_error, _load_device, _load_compute
    if _model is not None:
        return _model
    if _load_error is not None:
        raise RuntimeError(f"Model failed to load previously: {_load_error}")
    device = DEVICE
    compute = COMPUTE
    if device == "cuda" and not _cuda_available():
        if ALLOW_CPU_FALLBACK:
            device = "cpu"
            compute = "int8"
        else:
            raise RuntimeError("CUDA not available and ALLOW_CPU_FALLBACK=0")
    try:
        from faster_whisper import WhisperModel

        _model = WhisperModel(MODEL_NAME, device=device, compute_type=compute)
        _load_device = device
        _load_compute = compute
        print(f"[worker] model loaded: {MODEL_NAME} on {device} ({compute})", flush=True)
        return _model
    except Exception as exc:  # noqa: BLE001
        _load_error = str(exc)
        traceback.print_exc()
        raise


@app.get("/health")
def health(authorization: str | None = Header(None)):
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": _load_device,
        "compute": _load_compute,
        "model_loaded": _model is not None,
        "load_error": _load_error,
        "cuda_available": _cuda_available(),
        "ctranslate2": _ctranslate2_version(),
    }


def _auth(auth_header: str | None):
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    if auth_header.split(" ", 1)[1].strip() != TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token.")


@app.post("/warmup")
def warmup(authorization: str | None = Header(None)):
    _auth(authorization)
    try:
        model = get_model()
        import wave

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp_path = Path(tmp.name)
        try:
            with wave.open(str(tmp_path), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(16000)
                w.writeframes(b"\x00\x00" * 16000 * 2)
            segs, info = model.transcribe(str(tmp_path), vad_filter=True, word_timestamps=False)
            _ = list(segs)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass
        return {"ok": True, "model": MODEL_NAME, "device": _load_device, "compute": _load_compute}
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
    language: str = Form("auto"),
    mode: str = Form("balanced"),
    hotwords: str = Form(""),
    offset: str = Form("0"),
):
    _auth(authorization)
    try:
        try:
            off = float(offset)
        except ValueError:
            off = 0.0

        if not file.filename:
            file.filename = "audio.wav"
        suffix = Path(file.filename).suffix or ".wav"
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty upload.")
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)

        try:
            model = get_model()
            lang = None if language == "auto" else language

            if mode == "fast":
                try:
                    from faster_whisper import BatchedInferencePipeline  # type: ignore

                    runner = BatchedInferencePipeline(model=model)
                    params = dict(beam_size=1, best_of=1, temperature=0.0, batch_size=8)
                except Exception:  # noqa: BLE001
                    runner = model
                    params = dict(beam_size=1, best_of=1, temperature=0.0)
            elif mode == "accurate":
                runner = model
                params = dict(beam_size=5, best_of=5, temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0], patience=1.0)
            else:
                runner = model
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

            segments_iter, info = runner.transcribe(str(tmp_path), **kwargs)
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
                    words = [
                        {"word": wd, "start": float(seg.start) + i * step, "end": float(seg.start) + (i + 1) * step}
                        for i, wd in enumerate(ws)
                    ]
                segments.append(
                    {
                        "start": float(seg.start),
                        "end": float(seg.end),
                        "text": text,
                        "words": words,
                    }
                )
            return JSONResponse(
                {
                    "segments": segments,
                    "language": getattr(info, "language", "unknown"),
                    "relative": True,
                }
            )
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")