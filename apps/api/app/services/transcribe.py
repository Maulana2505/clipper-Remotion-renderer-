from __future__ import annotations

import os
from pathlib import Path

from ..core.config import WHISPER_MODEL

_MODEL = None
_BATCHED = None


def _load_models():
    global _MODEL, _BATCHED
    if _MODEL is not None:
        return _MODEL, _BATCHED
    from faster_whisper import WhisperModel  # type: ignore

    try:
        from faster_whisper import BatchedInferencePipeline  # type: ignore
    except Exception:  # noqa: BLE001
        BatchedInferencePipeline = None  # type: ignore

    cpu_threads = max(1, (os.cpu_count() or 2) - 1)
    model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8", cpu_threads=cpu_threads, num_workers=1)
    batched = None
    if BatchedInferencePipeline is not None:
        try:
            batched = BatchedInferencePipeline(model=model)
        except Exception:  # noqa: BLE001
            batched = None
    _MODEL = model
    _BATCHED = batched
    return model, batched


def _segment_words(start: float, end: float, text: str) -> list[dict]:
    words = text.split()
    if not words:
        return []
    step = (end - start) / len(words)
    return [
        {"word": word, "start": start + idx * step, "end": start + (idx + 1) * step}
        for idx, word in enumerate(words)
    ]


def _run_transcribe_path(model, batched, audio_path: Path, offset: float) -> list[dict]:
    """Transcribe one audio file and return segments with global timestamps."""
    kwargs = dict(
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
        beam_size=1,
        best_of=1,
        temperature=0.0,
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        compression_ratio_threshold=2.4,
        log_progress=False,
    )
    runner = batched if batched is not None else model
    if batched is not None:
        kwargs["batch_size"] = 8
    try:
        segments_iter, info = runner.transcribe(str(audio_path), **kwargs)
    except Exception:  # noqa: BLE001
        # Fall back to the plain (non-batched) path with a slightly larger beam.
        segments_iter, info = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
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
    return segments, getattr(info, "language", "unknown")


def transcribe_audio(audio_path: Path, duration: float) -> dict | None:
    """Transcribe a full audio file. Returns None when faster-whisper is absent."""
    try:
        model, batched = _load_models()
    except Exception:  # noqa: BLE001
        return None
    try:
        segments, language = _run_transcribe_path(model, batched, audio_path, 0.0)
    except Exception as exc:  # noqa: BLE001
        print(f"[transcribe] Whisper failed: {exc}")
        return None
    if not segments:
        return None
    return {
        "language": language,
        "duration": duration,
        "segments": segments,
        "source": "whisper",
        "scope": "full",
    }


def transcribe_clips(source: Path, clips: list[dict], duration: float) -> dict | None:
    """Transcribe only the clip windows. Much cheaper than a full pass."""
    try:
        model, batched = _load_models()
    except Exception:  # noqa: BLE001
        return None
    from .media import extract_audio_segment

    job_dir = source.parent
    all_segments: list[dict] = []
    language = "unknown"
    tmp_files: list[Path] = []
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
                segs, lang = _run_transcribe_path(model, batched, wav, start)
            except Exception as exc:  # noqa: BLE001
                print(f"[transcribe] clip {index} failed: {exc}")
                continue
            if lang and lang != "unknown":
                language = lang
            all_segments.extend(segs)
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
        "language": language,
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
    """Last-resort transcript. Keeps the pipeline usable without Whisper/subtitles."""
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