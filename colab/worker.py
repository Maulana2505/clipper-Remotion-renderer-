"""Faster-Whisper worker for Google Colab (GPU).

Run with:
    uvicorn worker:app --host 0.0.0.0 --port 8010
Then expose via cloudflared:
    cloudflared tunnel --url http://127.0.0.1:8010
"""
from __future__ import annotations

import os
import inspect
import shutil
import tempfile
import traceback
from pathlib import Path

# Kompatibilitas PyAV: faster-whisper 1.1.1 memanggil av.open(..., metadata_errors="ignore"),
# tetapi PyAV 19+ menghapus parameter tersebut. Buang kwarg yang tidak dikenal.
try:
    import av

    if "metadata_errors" not in inspect.signature(av.open).parameters:
        _orig_open = av.open

        def _open_compat(*args, **kwargs):
            for key in ("metadata_errors", "metadata_encoding", "stream_options"):
                kwargs.pop(key, None)
            return _orig_open(*args, **kwargs)

        av.open = _open_compat
except Exception:  # noqa: BLE001
    pass

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="Clipper Whisper Worker")

TOKEN = os.getenv("WORKER_TOKEN", "change-me")
MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE_PREF = os.getenv("WHISPER_DEVICE", "cuda").lower()
COMPUTE_PREF = os.getenv("WHISPER_COMPUTE", "float16")
ALLOW_CPU_FALLBACK = os.getenv("ALLOW_CPU_FALLBACK", "1") == "1"

_model = None
_device = None
_load_error: str | None = None


def _try_load(device: str, compute: str):
    from faster_whisper import WhisperModel
    return WhisperModel(MODEL_NAME, device=device, compute_type=compute)


def get_model():
    global _model, _device, _load_error
    if _model is not None:
        return _model
    if _load_error is not None:
        raise RuntimeError(_load_error)
    errors: list[str] = []
    candidates: list[tuple[str, str]] = []
    if DEVICE_PREF == "cuda":
        candidates.append(("cuda", COMPUTE_PREF))
    candidates.append(("cpu", "int8"))
    for device, compute in candidates:
        try:
            _model = _try_load(device, compute)
            _device = device
            _load_error = None
            print(f"[worker] model loaded: {MODEL_NAME} on {device} ({compute})", flush=True)
            return _model
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{device}/{compute}: {exc}")
            print(f"[worker] failed to load on {device}/{compute}: {exc}", flush=True)
            if device == "cuda" and not ALLOW_CPU_FALLBACK:
                break
    _load_error = "; ".join(errors)
    raise RuntimeError(_load_error)


def _auth(auth_header: str | None):
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    if auth_header.split(" ", 1)[1].strip() != TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token.")


@app.get("/health")
def health(authorization: str | None = Header(None)):
    # Health is open by default; auth optional.
    cuda_ok = False
    try:
        import ctranslate2
        cuda_ok = ctranslate2.get_cuda_device_count() > 0
    except Exception:  # noqa: BLE001
        cuda_ok = False
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": _device if _device else DEVICE_PREF,
        "compute": COMPUTE_PREF,
        "model_loaded": _model is not None,
        "cuda_available": cuda_ok,
        "load_error": _load_error,
    }


@app.post("/warmup")
def warmup(authorization: str | None = Header(None)):
    _auth(authorization)
    try:
        model = get_model()
        # Transcribe a tiny silent clip to force VAD + model init.
        import tempfile
        from pathlib import Path
        import wave
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            w = wave.open(tmp.name, "wb")
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(b"\x00\x00" * 16000)
            w.close()
            tmp_path = Path(tmp.name)
        try:
            segments_iter, info = model.transcribe(str(tmp_path), language="en")
            _ = list(segments_iter)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass
        return {"ok": True, "model": MODEL_NAME, "device": _device}
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(tb, flush=True)
        raise HTTPException(status_code=500, detail={"error": type(exc).__name__, "detail": str(exc), "traceback": tb[-2000:]})


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
        off = float(offset)
    except ValueError:
        off = 0.0

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = Path(tmp.name)
    tmp.close()
    try:
        with tmp_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        if tmp_path.stat().st_size < 1024:
            raise HTTPException(status_code=422, detail="Uploaded audio is empty/too small.")

        model = get_model()
        lang = None if language == "auto" else language

        if mode == "fast":
            params = {"beam_size": 1, "best_of": 1, "temperature": 0.0}
            use_batched = True
        elif mode == "accurate":
            params = {"beam_size": 5, "best_of": 5, "temperature": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0], "patience": 1.0}
            use_batched = False
        else:
            params = {"beam_size": 5, "best_of": 5, "temperature": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]}
            use_batched = False

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

        # Batched pipeline only if available and on CPU; on GPU use plain model.
        if use_batched:
            try:
                from faster_whisper import BatchedInferencePipeline
                runner = BatchedInferencePipeline(model=model)
                kwargs["batch_size"] = 8
                segments_iter, info = runner.transcribe(str(tmp_path), **kwargs)
            except Exception:  # noqa: BLE001
                kwargs.pop("batch_size", None)
                segments_iter, info = model.transcribe(str(tmp_path), **kwargs)
        else:
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
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(tb, flush=True)
        raise HTTPException(status_code=500, detail={"error": type(exc).__name__, "detail": str(exc), "traceback": tb[-2000:]})
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass