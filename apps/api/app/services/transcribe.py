from __future__ import annotations

import os
try:
    import av

    def _av_needs_patch() -> bool:
        try:
            return int(str(av.__version__).split(".")[0]) >= 19
        except Exception:  # noqa: BLE001
            try:
                import inspect
                return "metadata_errors" not in inspect.signature(av.open).parameters
            except (ValueError, TypeError):
                return False

    if _av_needs_patch():
        _orig = av.open
        def _open(*a, **kw):
            for _k in ("metadata_errors", "metadata_encoding", "stream_options"):
                kw.pop(_k, None)
            return _orig(*a, **kw)
        av.open = _open
except Exception:  # noqa: BLE001
    pass
from pathlib import Path
from typing import Any

from ..core.config import WHISPER_MODEL
from .models import normalize_model, WhisperModelNotSelected

_MODEL = None
_BATCHED = None
_MODEL_KEY = None


def get_whisper_config() -> dict[str, Any]:
    try:
        from ..db import get_conn, row_to_dict
        with get_conn() as conn:
            row = row_to_dict(conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone())
        data = row or {}
    except Exception:  # noqa: BLE001
        data = {}
    from ..core.security import decrypt_secret
    token = decrypt_secret(data.get("encrypted_remote_token"))
    return {
        "model": normalize_model(data.get("whisper_model") or WHISPER_MODEL),
        "backend": data.get("whisper_backend") or "local",
        "language": data.get("whisper_language") or "auto",
        "mode": data.get("whisper_mode") or "balanced",
        "hotwords": data.get("whisper_hotwords"),
        "remote_url": data.get("remote_whisper_url"),
        "remote_token": token,
    }


def _device_and_compute() -> tuple[str, str]:
    try:
        import ctranslate2  # type: ignore
        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda", "float16"
    except Exception:  # noqa: BLE001
        pass
    return "cpu", "int8"


def _load_models(model_name: str):
    global _MODEL, _BATCHED, _MODEL_KEY
    device, compute = _device_and_compute()
    key = (model_name, device, compute)
    if _MODEL is not None and _MODEL_KEY == key:
        return _MODEL, _BATCHED, device
    if _MODEL is not None and _MODEL_KEY != key:
        _MODEL = None
        _BATCHED = None
        import gc
        gc.collect()
    from faster_whisper import WhisperModel  # type: ignore

    try:
        from faster_whisper import BatchedInferencePipeline  # type: ignore
    except Exception:  # noqa: BLE001
        BatchedInferencePipeline = None  # type: ignore

    cpu_threads = max(1, (os.cpu_count() or 2) - 1)
    kwargs = {"device": device, "compute_type": compute}
    if device == "cpu":
        kwargs["cpu_threads"] = cpu_threads
        kwargs["num_workers"] = 1
    model = WhisperModel(model_name, **kwargs)
    batched = None
    if BatchedInferencePipeline is not None and device == "cpu":
        try:
            batched = BatchedInferencePipeline(model=model)
        except Exception:  # noqa: BLE001
            batched = None
    _MODEL = model
    _BATCHED = batched
    _MODEL_KEY = key
    return model, batched, device


def _segment_words(start: float, end: float, text: str) -> list[dict]:
    words = text.split()
    if not words:
        return []
    step = (end - start) / len(words)
    return [
        {"word": word, "start": start + idx * step, "end": start + (idx + 1) * step}
        for idx, word in enumerate(words)
    ]


def _mode_params(mode: str) -> dict[str, Any]:
    if mode == "fast":
        return {"beam_size": 1, "best_of": 1, "temperature": 0.0, "batched": True}
    if mode == "accurate":
        return {"beam_size": 5, "best_of": 5, "temperature": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0], "batched": False, "patience": 1.0}
    # balanced
    return {"beam_size": 5, "best_of": 5, "temperature": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0], "batched": False}


def _run_local(audio_path: Path, offset: float, cfg: dict[str, Any], on_progress=None, model: str | None = None, duration: float = 0.0) -> list[dict]:
    model, batched, device = _load_models(model or cfg["model"])
    params = _mode_params(cfg["mode"])
    language = None if cfg["language"] == "auto" else cfg["language"]
    hotwords = cfg.get("hotwords") or None

    use_batched = bool(params.get("batched")) and batched is not None and device == "cpu"

    base_kwargs: dict[str, Any] = {
        "word_timestamps": True,
        "vad_filter": True,
        "vad_parameters": {"min_silence_duration_ms": 500},
        "condition_on_previous_text": False,
        "no_speech_threshold": 0.6,
        "compression_ratio_threshold": 2.4,
        "log_progress": False,
    }
    if language is not None:
        base_kwargs["language"] = language
    if hotwords:
        base_kwargs["hotwords"] = hotwords

    try:
        if use_batched:
            runner = batched
            kwargs = dict(base_kwargs)
            kwargs["beam_size"] = params["beam_size"]
            kwargs["best_of"] = params["best_of"]
            kwargs["temperature"] = params["temperature"]
            kwargs["batch_size"] = 8
            segments_iter, info = runner.transcribe(str(audio_path), **kwargs)
        else:
            runner = model
            kwargs = dict(base_kwargs)
            kwargs["beam_size"] = params["beam_size"]
            kwargs["best_of"] = params["best_of"]
            kwargs["temperature"] = params["temperature"]
            if "patience" in params:
                kwargs["patience"] = params["patience"]
            segments_iter, info = runner.transcribe(str(audio_path), **kwargs)
    except Exception:  # noqa: BLE001
        # Fallback to a safe non-batched call.
        segments_iter, info = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            beam_size=2,
            temperature=0.0,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            compression_ratio_threshold=2.4,
        )

    segments: list[dict] = []
    for segment in segments_iter:
        text = (segment.text or "").strip()
        if not text:
            continue
        words = []
        if getattr(segment, "words", None):
            for word in segment.words:
                token = (word.word or "").strip()
                if token:
                    words.append(
                        {
                            "word": token,
                            "start": float(word.start) + offset,
                            "end": float(word.end) + offset,
                        }
                    )
        if not words:
            words = _segment_words(float(segment.start) + offset, float(segment.end) + offset, text)
        segments.append(
            {
                "start": float(segment.start) + offset,
                "end": float(segment.end) + offset,
                "text": text,
                "words": words,
            }
        )
    # Local progress: based on decoded segment coverage.
    if on_progress is not None and duration > 0 and segments:
        try:
            last_end = segments[-1]["end"] - offset if offset else segments[-1]["end"]
            on_progress(min(0.99, last_end / duration))
        except Exception:  # noqa: BLE001
            pass
    return segments


def _run_transcribe(audio_path: Path, offset: float, duration: float, on_progress=None, model: str | None = None) -> tuple[list[dict], str]:
    cfg = get_whisper_config()
    chosen = model or cfg["model"]
    if not chosen:
        raise WhisperModelNotSelected("Pilih model transkripsi dulu di Settings.")
    if cfg["backend"] == "remote":
        try:
            from .remote_whisper import remote_transcribe
            segments = remote_transcribe(
                audio_path,
                offset,
                {
                    "language": cfg["language"],
                    "mode": cfg["mode"],
                    "hotwords": cfg["hotwords"],
                    "_duration": duration,
                },
                on_progress=on_progress,
                model=chosen,
            )
            used = chosen
            return segments, f"whisper:remote:{used}"
        except Exception as exc:  # noqa: BLE001
            print(f"[transcribe] remote failed, falling back to local: {exc}")
    segments = _run_local(audio_path, offset, cfg, on_progress=on_progress, model=chosen, duration=duration)
    used = chosen
    return segments, f"whisper:local:{used}"


def transcribe_audio(audio_path: Path, duration: float, on_progress=None, model: str | None = None) -> dict | None:
    try:
        segments, _source = _run_transcribe(audio_path, 0.0, duration, on_progress=on_progress, model=model)
    except Exception as exc:  # noqa: BLE001
        print(f"[transcribe] Whisper failed: {exc}")
        return None
    if not segments:
        return None
    cfg = get_whisper_config()
    return {
        "language": cfg["language"] if cfg["language"] != "auto" else "unknown",
        "duration": duration,
        "segments": segments,
        "source": "whisper",
        "scope": "full",
    }


def transcribe_clips(source: Path, clips: list[dict], duration: float, on_progress=None, model: str | None = None) -> dict | None:
    from .media import extract_audio_segment

    job_dir = source.parent
    all_segments: list[dict] = []
    tmp_files: list[Path] = []
    cfg = get_whisper_config()
    try:
        for index, clip in enumerate(clips):
            start = float(clip["start"])
            end = float(clip["end"])
            if end - start < 0.5:
                continue
            wav = job_dir / f"_clip_{index}.wav"
            tmp_files.append(wav)
            try:
                extract_audio_segment(source, wav, start, end - start)
            except Exception as exc:  # noqa: BLE001
                print(f"[transcribe] segment extract failed: {exc}")
                continue
            try:
                segs, _src = _run_transcribe(wav, start, duration, model=model)
            except Exception as exc:  # noqa: BLE001
                print(f"[transcribe] clip {index} failed: {exc}")
                continue
            all_segments.extend(segs)
            if on_progress is not None:
                try:
                    on_progress(index + 1, len(clips))
                except Exception:  # noqa: BLE001
                    pass
    finally:
        for wav in tmp_files:
            try:
                wav.unlink(missing_ok=True)
            except Exception:
                pass

    all_segments.sort(key=lambda s: s["start"])
    if not all_segments:
        return None
    return {
        "language": cfg["language"] if cfg["language"] != "auto" else "unknown",
        "duration": duration,
        "segments": all_segments,
        "source": "whisper",
        "scope": "clips",
    }


def transcribe_from_vtt(vtt_path: Path, duration: float) -> dict | None:
    from .media import parse_vtt

    try:
        segments = parse_vtt(vtt_path)
    except Exception as exc:  # noqa: BLE001
        print(f"[transcribe] VTT parse failed: {exc}")
        return None
    if not segments:
        return None
    return {
        "language": "unknown",
        "duration": duration,
        "segments": segments,
        "source": "subtitles",
        "scope": "full",
    }


def transcribe_from_vtt_clips(vtt_path: Path, clips: list[dict], duration: float) -> dict | None:
    from .media import parse_vtt

    try:
        segments = parse_vtt(vtt_path)
    except Exception as exc:  # noqa: BLE001
        print(f"[transcribe] VTT parse failed: {exc}")
        return None
    if not segments:
        return None
    filtered = [
        s for s in segments
        if any(min(float(s["end"]), float(c["end"])) - max(float(s["start"]), float(c["start"])) > 0 for c in clips)
    ]
    if not filtered:
        filtered = segments
    return {
        "language": "unknown",
        "duration": duration,
        "segments": filtered,
        "source": "subtitles",
        "scope": "clips",
    }


def fallback_transcript(duration: float) -> dict:
    duration = max(1.0, float(duration or 1.0))
    windows: list[dict] = []
    cursor = 0.0
    index = 1
    while cursor < duration:
        end = min(duration, cursor + 30.0)
        text = f"Audio segment {index}"
        windows.append(
            {
                "start": cursor,
                "end": end,
                "text": text,
                "words": _segment_words(cursor, end, text),
            }
        )
        cursor = end
        index += 1
    return {
        "language": "unknown",
        "duration": duration,
        "segments": windows,
        "source": "fallback",
        "scope": "full",
    }