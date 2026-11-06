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
# Cek berdasarkan versi (bukan inspect.signature, karena av.open builtin tidak punya text signature).
try:
    import av

    def _av_needs_patch() -> bool:
        try:
            return int(str(av.__version__).split(".")[0]) >= 19
        except Exception:  # noqa: BLE001
            try:
                return "metadata_errors" not in __import__("inspect").signature(av.open).parameters
            except (ValueError, TypeError):
                return False

    if _av_needs_patch():
        _orig_open = av.open

        def _open_compat(*args, **kwargs):
            for key in ("metadata_errors", "metadata_encoding", "stream_options"):
                kwargs.pop(key, None)
            return _orig_open(*args, **kwargs)

        av.open = _open_compat
        print("[worker] PyAV", av.__version__, "-> patched av.open (metadata_errors removed)", flush=True)
except Exception as exc:  # noqa: BLE001
    print("[worker] PyAV compat shim failed:", exc, flush=True)

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="Clipper Whisper Worker")

TOKEN = os.getenv("WORKER_TOKEN", "change-me")
MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE_PREF = os.getenv("WHISPER_DEVICE", "cuda").lower()
COMPUTE_PREF = os.getenv("WHISPER_COMPUTE", "float16")
ALLOW_CPU_FALLBACK = os.getenv("ALLOW_CPU_FALLBACK", "1") == "1"

_model = None
_model_name: str | None = None
_device = None
_load_error: str | None = None
_MODEL_LOCK = __import__("threading").Lock()
_ALLOWED_MODELS = {"base", "small", "large-v3-turbo"}


def _resolve_model(name: str | None) -> str:
    if name and name in _ALLOWED_MODELS:
        return name
    return MODEL_NAME if MODEL_NAME in _ALLOWED_MODELS else "small"


def _try_load(name: str, device: str, compute: str):
    from faster_whisper import WhisperModel
    return WhisperModel(name, device=device, compute_type=compute)


def get_model(name: str | None = None):
    global _model, _model_name, _device, _load_error
    resolved = _resolve_model(name)
    with _MODEL_LOCK:
        if _model is not None and _model_name == resolved:
            return _model, resolved
        # unload previous
        _model = None
        _model_name = None
        import gc
        gc.collect()
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass
        errors: list[str] = []
        candidates: list[tuple[str, str]] = []
        if DEVICE_PREF == "cuda":
            candidates.append(("cuda", COMPUTE_PREF))
        candidates.append(("cpu", "int8"))
        for device, compute in candidates:
            try:
                _model = _try_load(resolved, device, compute)
                _model_name = resolved
                _device = device
                _load_error = None
                print(f"[worker] model loaded: {resolved} on {device} ({compute})", flush=True)
                return _model, resolved
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{device}/{compute}: {exc}")
                print(f"[worker] failed to load {resolved} on {device}/{compute}: {exc}", flush=True)
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
    face_ready = False
    try:
        import cv2  # type: ignore
        face_ready = True
    except Exception:  # noqa: BLE001
        face_ready = False
    return {
        "status": "ok",
        "model": _model_name or MODEL_NAME,
        "models": sorted(_ALLOWED_MODELS),
        "device": _device if _device else DEVICE_PREF,
        "compute": COMPUTE_PREF,
        "model_loaded": _model is not None,
        "cuda_available": cuda_ok,
        "load_error": _load_error,
        "face_ready": face_ready,
        "face_model": os.getenv("FACE_MODEL_PATH", ""),
        "opencv": (cv2.__version__ if face_ready else None),
    }


@app.post("/warmup")
def warmup(authorization: str | None = Header(None), model: str = Form("")):
    _auth(authorization)
    try:
        model, used_model = get_model(model)
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
        return {"ok": True, "model": used_model, "device": _device}
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
    model: str = Form(""),
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

        model, used_model = get_model(model)
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
        return JSONResponse({"segments": segments, "language": getattr(info, "language", "unknown"), "relative": True, "model": used_model})
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

# --------------------------------------------------------------------------- #
# Face tracking (Colab). Receives a (preferably pre-sampled) video clip and
# returns smoothed face keyframes. Reuses the same Bearer token.
# --------------------------------------------------------------------------- #
import zipfile as _zipfile

_FACE_MODEL_PATH = os.getenv("FACE_MODEL_PATH", "")
_FACE_CASCADE_PATH = None
try:
    import cv2 as _cv2  # type: ignore
    _FACE_CASCADE_PATH = _cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
except Exception:  # noqa: BLE001
    _cv2 = None  # type: ignore


def _load_face_detector_cv(width: int, height: int):
    global _cv2
    if _cv2 is None:
        try:
            import cv2 as _cv2  # type: ignore
        except Exception:  # noqa: BLE001
            return None, "none"
    # YuNet
    if _FACE_MODEL_PATH and os.path.exists(_FACE_MODEL_PATH):
        try:
            det = _cv2.FaceDetectorYN.create(
                _FACE_MODEL_PATH, "", (width, height),
                score_threshold=0.6, nms_threshold=0.3, top_k=5000,
            )
            det.setInputSize((width, height))
            return det, "yunet"
        except Exception:  # noqa: BLE001
            pass
    # Haar cascade
    if _FACE_CASCADE_PATH:
        try:
            cascade = _cv2.CascadeClassifier(_FACE_CASCADE_PATH)
            if not cascade.empty():
                return cascade, "haar"
        except Exception:  # noqa: BLE001
            pass
    return None, "none"


@app.post("/face-track")
async def face_track(
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
    offset: str = Form("0"),
    sample_seconds: str = Form("0.4"),
):
    _auth(authorization)
    try:
        off = float(offset)
    except ValueError:
        off = 0.0
    try:
        ss = float(sample_seconds)
    except ValueError:
        ss = 0.4
    if ss <= 0:
        ss = 0.4

    suffix = Path(file.filename or "clip.mp4").suffix or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = Path(tmp.name)
    tmp.close()
    try:
        with tmp_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        if tmp_path.stat().st_size < 1024:
            raise HTTPException(status_code=422, detail="Uploaded video is empty/too small.")

        try:
            import cv2  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"opencv unavailable: {exc}")

        capture = cv2.VideoCapture(str(tmp_path))
        if not capture.isOpened():
            raise HTTPException(status_code=422, detail="Could not open video.")

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if fps <= 1 or fps > 240:
            fps = 1.0 / ss
        step = max(1, int(round(fps * ss)))

        detector = None
        detector_kind = "none"
        detector_size = None

        keyframes: list[dict] = []
        smoothed_x = 0.5
        smoothed_y = 0.5
        found_any = False
        frame_index = 0
        t = 0.0
        duration = 0.0

        while True:
            ok = capture.grab()
            if not ok:
                break
            if frame_index % step != 0:
                frame_index += 1
                t = frame_index / fps
                continue
            ok, frame = capture.retrieve()
            if not ok or frame is None:
                break
            height, width = frame.shape[:2]
            # downscale
            if width > 480:
                scale = 480.0 / float(width)
                new_w = 480
                new_h = max(1, int(height * scale))
                frame_small = cv2.resize(frame, (new_w, new_h))
            else:
                new_w, new_h = width, height
                frame_small = frame
            sh, sw = frame_small.shape[:2]

            if detector is None:
                loaded = _load_face_detector_cv(sw, sh)
                if isinstance(loaded, tuple):
                    detector, detector_kind = loaded
                    detector_size = (sw, sh)
                else:
                    detector = loaded
                    detector_kind = "none"

            center = None
            if detector_kind == "yunet" and detector is not None:
                try:
                    if detector_size != (sw, sh):
                        detector.setInputSize((sw, sh))
                        detector_size = (sw, sh)
                    _retval, faces = detector.detect(frame_small)
                    if faces is not None and len(faces) > 0:
                        areas = [f[2] * f[3] for f in faces]
                        idx = int(max(range(len(faces)), key=lambda i: areas[i]))
                        f = faces[idx]
                        center = ((f[0] + f[2] / 2) / max(1, sw),
                                  (f[1] + f[3] / 2) / max(1, sh))
                except Exception:  # noqa: BLE001
                    center = None
            if center is None and detector_kind == "haar" and detector is not None:
                try:
                    gray = cv2.cvtColor(frame_small, cv2.COLOR_BGR2GRAY)
                    faces = detector.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=4, minSize=(24, 24))
                    if len(faces) > 0:
                        faces = sorted(faces, key=lambda item: item[2] * item[3], reverse=True)
                        x, y, w, h = faces[0]
                        center = ((x + w / 2) / max(1, sw), (y + h / 2) / max(1, sh))
                except Exception:  # noqa: BLE001
                    center = None

            if center is not None:
                cx, cy = center
                smoothed_x = smoothed_x * 0.75 + cx * 0.25
                smoothed_y = smoothed_y * 0.75 + cy * 0.25
                found_any = True

            keyframes.append({
                "t": round(float(t + off), 3),
                "x": round(float(smoothed_x), 4),
                "y": round(float(smoothed_y), 4),
                "w": 1.0,
                "h": 1.0,
            })
            duration = t
            frame_index += 1
            t = frame_index / fps
            if frame_index > 100000:
                break

        capture.release()

        if not found_any or not keyframes:
            # fallback center
            dur = max(0.1, duration if duration > 0 else (len(keyframes) / fps if fps > 0 else 1.0))
            return JSONResponse({
                "fallback": True,
                "reason": "no face detected",
                "detector": detector_kind,
                "keyframes": [{"t": round(off, 3), "x": 0.5, "y": 0.5, "w": 1.0, "h": 1.0},
                              {"t": round(off + dur, 3), "x": 0.5, "y": 0.5, "w": 1.0, "h": 1.0}],
            })

        # thin out
        if len(keyframes) > 400:
            step_out = max(1, len(keyframes) // 400)
            keyframes = keyframes[::step_out] + [keyframes[-1]]

        return JSONResponse({
            "fallback": False,
            "reason": "",
            "detector": detector_kind,
            "keyframes": keyframes,
        })
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(tb, flush=True)
        raise HTTPException(status_code=500, detail={"error": type(exc).__name__, "detail": str(exc), "traceback": tb[-2000:]})
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
