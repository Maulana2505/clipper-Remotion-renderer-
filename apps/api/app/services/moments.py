"""Moment detection from the audio (+ optional visual) stream.

No scipy, no model: FFmpeg decodes to mono 16 kHz PCM which we read in
chunks, turn into per-frame features with numpy, and reduce to a robust
per-source activity curve. Peaks and sustained segments become candidate
windows; boundaries are snapped to pauses / scene cuts; final scoring is
rank-based so ``is_hot`` is honest (top 30 % of the job).

Public entry point: ``detect_moments(source, duration, niche, max_clips, visual)``.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

from ..core.config import FFMPEG
from ..templates import DETECT_PROFILES, NICHE_BY_ID

SR = 16000
HOP = 800          # 50 ms frames
FFT = 1024         # ~64 ms
VISUAL_FPS = 1
VISUAL_W = 160
VISUAL_H = 90


# --------------------------------------------------------------------------- #
# audio decode + features
# --------------------------------------------------------------------------- #
def _decode_audio_features(source: Path) -> dict[str, np.ndarray]:
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error",
        "-i", str(source),
        "-vn", "-ac", "1", "-ar", str(SR),
        "-f", "s16le", "pipe:1",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    pending = bytearray()
    rms_db: list[float] = []
    peak: list[float] = []
    zcr: list[float] = []
    low_r: list[float] = []
    speech_r: list[float] = []
    high_r: list[float] = []
    flux: list[float] = []
    prev_mag: np.ndarray | None = None
    window = np.hanning(FFT).astype(np.float32)
    freqs = np.fft.rfftfreq(FFT, 1.0 / SR)
    m_low = freqs < 300
    m_speech = (freqs >= 300) & (freqs < 3000)
    m_high = freqs >= 3000

    def process_block(data: np.ndarray) -> None:
        nonlocal prev_mag
        n = (len(data) // HOP) * HOP
        if n == 0:
            return
        frames = data[:n].reshape(-1, HOP).astype(np.float32)
        # rms / peak / zcr
        rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-12) / 32768.0
        rms_db.extend((20.0 * np.log10(rms + 1e-9)).tolist())
        peak.extend(np.max(np.abs(frames), axis=1).tolist())
        zcr.extend(np.mean((frames[:, 1:] * frames[:, :-1]) < 0, axis=1).tolist())
        # spectrum (pad to FFT)
        seg = np.zeros((frames.shape[0], FFT), dtype=np.float32)
        seg[:, :HOP] = frames
        spec = np.abs(np.fft.rfft(seg * window[None, :], axis=1)) ** 2
        low_e = spec[:, m_low].sum(axis=1)
        speech_e = spec[:, m_speech].sum(axis=1)
        high_e = spec[:, m_high].sum(axis=1)
        tot = low_e + speech_e + high_e + 1e-9
        low_r.extend((low_e / tot).tolist())
        speech_r.extend((speech_e / tot).tolist())
        high_r.extend((high_e / tot).tolist())
        mag = np.sqrt(spec + 1e-12)
        fl = np.zeros(frames.shape[0], dtype=np.float64)
        if frames.shape[0] > 1:
            diff = mag[1:] - mag[:-1]
            fl[1:] = np.sum(np.where(diff > 0, diff, 0.0), axis=1)
        if prev_mag is not None:
            d0 = mag[0] - prev_mag
            fl[0] = float(np.sum(np.where(d0 > 0, d0, 0.0)))
        flux.extend(fl.tolist())
        prev_mag = mag[-1].copy()

    try:
        while True:
            chunk = proc.stdout.read(1 << 20)
            if not chunk:
                break
            pending.extend(chunk)
            usable = (len(pending) // (HOP * 2)) * (HOP * 2)
            if usable:
                arr = np.frombuffer(bytes(pending[:usable]), dtype=np.int16).copy()
                del pending[:usable]
                process_block(arr)
        # tail
        if len(pending) >= HOP * 2:
            arr = np.frombuffer(bytes(pending), dtype=np.int16).copy()
            process_block(arr)
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass
        proc.wait()

    if not rms_db:
        return {}

    db = np.asarray(rms_db, dtype=np.float64)
    pk = np.asarray(peak, dtype=np.float64)
    zc = np.asarray(zcr, dtype=np.float64)
    lo = np.asarray(low_r, dtype=np.float64)
    sp = np.asarray(speech_r, dtype=np.float64)
    hi = np.asarray(high_r, dtype=np.float64)
    fl = np.asarray(flux, dtype=np.float64)

    # robust normalization
    p10 = float(np.percentile(db, 10))
    p50 = float(np.percentile(db, 50))
    p90 = float(np.percentile(db, 90))
    p98 = float(np.percentile(db, 98))
    dr = max(1e-3, p98 - p10)
    act_db = np.clip((db - p10) / dr, 0.0, 1.0)
    # flux normalization
    f95 = float(np.percentile(fl, 95)) if fl.size else 1.0
    act_flux = np.clip(fl / max(1e-9, f95), 0.0, 1.0)
    activity = 0.7 * act_db + 0.3 * act_flux

    # smoothing helpers (cumulative mean)
    def smooth(arr: np.ndarray, win: int) -> np.ndarray:
        win = max(1, int(win))
        if arr.size < win:
            return arr.copy()
        c = np.concatenate(([0.0], np.cumsum(arr)))
        out = (c[win:] - c[:-win]) / win
        # pad to original length
        left = win // 2
        right = arr.size - out.size - left
        return np.concatenate(([out[0]] * left, out, [out[-1]] * max(0, right)))

    act_s = smooth(activity, 20)  # ~1 s
    novelty = np.concatenate(([0.0], np.diff(act_s))) 
    novelty = np.where(novelty > 0, novelty, 0.0) + 0.4 * act_flux
    # re-smooth novelty lightly
    nov_s = smooth(novelty, 6)

    return {
        "db": db, "peak": pk, "zcr": zc, "low": lo, "speech": sp, "high": hi,
        "flux": fl, "activity": activity, "act_s": act_s, "novelty": nov_s,
        "p10": p10, "p50": p50, "p90": p90, "p98": p98,
        "frames_per_sec": SR / HOP,
    }


# --------------------------------------------------------------------------- #
# visual decode
# --------------------------------------------------------------------------- #
def _decode_visual(source: Path) -> tuple[np.ndarray, list[float]]:
    """Return (motion_per_frame, scene_cut_times). motion is per VISUAL_FPS frame."""
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error",
        "-skip_frame", "nokey",
        "-i", str(source),
        "-vf", f"fps={VISUAL_FPS},scale={VISUAL_W}:{VISUAL_H},format=gray",
        "-f", "rawvideo", "pipe:1",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    frame_bytes = VISUAL_W * VISUAL_H
    prev: np.ndarray | None = None
    motion: list[float] = []
    cuts: list[float] = []
    idx = 0
    pending = bytearray()
    try:
        while True:
            chunk = proc.stdout.read(1 << 20)
            if not chunk:
                break
            pending.extend(chunk)
            while len(pending) >= frame_bytes:
                frame = np.frombuffer(bytes(pending[:frame_bytes]), dtype=np.uint8).astype(np.float32).reshape(VISUAL_H, VISUAL_W)
                del pending[:frame_bytes]
                if prev is None:
                    motion.append(0.0)
                else:
                    diff = np.abs(frame - prev)
                    m = float(diff.mean() / 255.0)
                    motion.append(m)
                    if m > 0.12:
                        cuts.append(idx / VISUAL_FPS)
                prev = frame
                idx += 1
        if len(pending) >= frame_bytes:
            frame = np.frombuffer(bytes(pending[:frame_bytes]), dtype=np.uint8).astype(np.float32).reshape(VISUAL_H, VISUAL_W)
            if prev is not None:
                motion.append(float(np.abs(frame - prev).mean() / 255.0))
            idx += 1
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass
        proc.wait()
    return np.asarray(motion, dtype=np.float64), cuts


# --------------------------------------------------------------------------- #
# peak / sustained helpers
# --------------------------------------------------------------------------- #
def _peak_pick(x: np.ndarray, min_dist: int, threshold: float) -> list[int]:
    cand = [i for i in range(1, len(x) - 1) if x[i] > x[i - 1] and x[i] >= x[i + 1] and x[i] >= threshold]
    cand.sort(key=lambda i: x[i], reverse=True)
    chosen: list[int] = []
    for i in cand:
        if all(abs(i - c) >= min_dist for c in chosen):
            chosen.append(i)
    return sorted(chosen)


def _sustained_segments(act_s: np.ndarray, fps: float, hi: float = 0.55, lo: float = 0.35, min_sec: float = 2.0) -> list[tuple[int, int]]:
    segments: list[tuple[int, int]] = []
    start: int | None = None
    for i, v in enumerate(act_s):
        if start is None:
            if v >= hi:
                start = i
        else:
            if v < lo:
                if (i - start) / fps >= min_sec:
                    segments.append((start, i))
                start = None
    if start is not None and (len(act_s) - start) / fps >= min_sec:
        segments.append((start, len(act_s)))
    # merge close segments (<1s gap)
    merged: list[tuple[int, int]] = []
    for s, e in segments:
        if merged and (s - merged[-1][1]) / fps < 1.0:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    return merged


def _nearest_pause(act_s: np.ndarray, idx: int, fps: float, direction: int, max_sec: float = 6.0) -> int | None:
    """Find nearest index where activity is low, searching direction (+1/-1)."""
    limit = int(max_sec * fps)
    best = None
    best_val = 1e9
    step = 1 if direction > 0 else -1
    for k in range(0, limit + 1):
        j = idx + step * k
        if j < 0 or j >= len(act_s):
            break
        if act_s[j] < 0.25:
            # prefer deeper minima
            if act_s[j] < best_val:
                best_val = act_s[j]
                best = j
            # stop at first low region? keep searching a bit
    return best


def _snap_boundaries(start: float, end: float, duration: float,
                     profile: dict, act_s: np.ndarray, fps: float,
                     scene_cuts: list[float], visual: bool) -> tuple[float, float]:
    min_len = profile["min_len"]
    max_len = profile["max_len"]
    target = profile["target"]
    # ensure at least min_len
    if end - start < min_len:
        mid = (start + end) / 2
        start = max(0.0, mid - min_len / 2)
        end = min(duration, start + min_len)
        if end - start < min_len:
            start = max(0.0, end - min_len)

    # snap start backward to nearest pause/scene cut
    si = int(start * fps)
    ei = int(end * fps)
    # choose snap mode
    boundary = profile.get("boundary", "pause")
    use_scene = visual and boundary in ("scene", "scene_or_pause", "pause_or_scene")
    use_pause = boundary in ("pause", "scene_or_pause", "pause_or_scene")

    # start
    new_start = start
    if use_scene:
        cands = [c for c in scene_cuts if c <= start + 0.5 and c >= start - 4.0]
        if cands:
            new_start = max(0.0, max(cands))
    if use_pause and new_start == start:
        p = _nearest_pause(act_s, si, fps, -1, 5.0)
        if p is not None:
            new_start = p / fps
    # end
    new_end = end
    if use_scene:
        cands = [c for c in scene_cuts if c >= end - 0.5 and c <= end + 4.0]
        if cands:
            new_end = min(duration, min(cands))
    if use_pause and new_end == end:
        p = _nearest_pause(act_s, ei, fps, 1, 5.0)
        if p is not None:
            new_end = min(duration, p / fps)

    # clamp length
    if new_end - new_start < min_len:
        # extend
        if new_start - (min_len - (new_end - new_start)) / 2 >= 0 and new_end + (min_len - (new_end - new_start)) / 2 <= duration:
            pad = (min_len - (new_end - new_start)) / 2
            new_start -= pad
            new_end += pad
        else:
            # just set
            if new_end - new_start < min_len:
                if new_start + min_len <= duration:
                    new_end = new_start + min_len
                else:
                    new_start = max(0.0, duration - min_len)
                    new_end = duration
    if new_end - new_start > max_len:
        # center crop
        mid = (new_start + new_end) / 2
        new_start = max(0.0, mid - max_len / 2)
        new_end = min(duration, new_start + max_len)
    new_start = max(0.0, min(new_start, duration - 1.0))
    new_end = min(duration, max(new_end, new_start + 1.0))
    return float(new_start), float(new_end)


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def detect_moments(source: Path, duration: float, niche: str | None,
                   max_clips: int = 20, visual: bool = True) -> dict[str, Any]:
    niche = (niche or "generic").lower()
    if niche not in DETECT_PROFILES:
        niche = "generic"
    profile = DETECT_PROFILES[niche]
    max_clips = max(1, int(max_clips or 1))

    audio = _decode_audio_features(source)
    if not audio:
        return {"clips": [], "visual": False}

    act_s = audio["act_s"]
    novelty = audio["novelty"]
    fps = audio["frames_per_sec"]
    duration = float(duration or 0.0)
    if duration <= 0:
        duration = len(audio["activity"]) / fps

    # visual
    motion_arr = np.zeros(0)
    scene_cuts: list[float] = []
    visual_ok = False
    if visual and profile.get("visual", True):
        try:
            motion_arr, scene_cuts = _decode_visual(source)
            visual_ok = True
        except Exception:
            visual_ok = False

    # motion aligned to audio frames (nearest)
    if visual_ok and motion_arr.size:
        # build per-audio-frame motion by nearest visual frame
        vf = VISUAL_FPS
        motion_audio = np.zeros(len(audio["activity"]))
        for i in range(len(motion_audio)):
            t = i / fps
            vi = int(round(t * vf))
            vi = min(max(0, vi), motion_arr.size - 1)
            motion_audio[i] = motion_arr[vi]
    else:
        motion_audio = np.zeros(len(audio["activity"]))

    # candidate centers
    min_dist_frames = int(4.0 * fps)
    thr_nov = float(np.percentile(novelty, 70)) if novelty.size else 0.0
    peaks = _peak_pick(novelty, min_dist_frames, thr_nov)

    # sustained segments
    segs = _sustained_segments(act_s, fps, hi=0.55, lo=0.35, min_sec=2.0)
    sustained_centers = []
    for s, e in segs:
        # center of mass of activity in segment
        seg_act = audio["activity"][s:e]
        if seg_act.size == 0:
            continue
        ci = s + int(np.argmax(seg_act))
        sustained_centers.append(ci)
    # dedup sustained vs peaks
    for ci in sustained_centers:
        if all(abs(ci - p) >= min_dist_frames for p in peaks):
            peaks.append(ci)
    peaks = sorted(set(peaks))

    if not peaks:
        # fallback: top activity frames
        order = np.argsort(audio["activity"])[::-1]
        for i in order[:max_clips]:
            peaks.append(int(i))
        peaks = sorted(set(peaks))

    # build windows
    target = profile["target"]
    min_len = profile["min_len"]
    max_len = profile["max_len"]
    pw = profile.get("peak_weight", 0.7)
    sw = profile.get("sustained_weight", 0.7)
    vw = profile.get("visual_weight", 0.6)

    windows: list[dict[str, Any]] = []
    for center in peaks:
        ct = center / fps
        half = target / 2
        s = ct - half
        e = ct + half
        # snap
        ss, ee = _snap_boundaries(s, e, duration, profile, act_s, fps, scene_cuts, visual_ok)
        if ee - ss < 1.5:
            continue
        # score
        i0 = max(0, int(ss * fps))
        i1 = min(len(audio["activity"]), max(i0 + 1, int(ee * fps)))
        seg_act = audio["activity"][i0:i1]
        seg_nov = novelty[i0:i1]
        seg_mot = motion_audio[i0:i1]
        energy = float(seg_act.mean()) if seg_act.size else 0.0
        peakv = float(seg_nov.max()) if seg_nov.size else 0.0
        sustained_frac = float(np.mean(seg_act >= 0.5)) if seg_act.size else 0.0
        motion_mean = float(seg_mot.mean()) if seg_mot.size else 0.0
        dur = ee - ss
        dur_fit = 1.0 - min(1.0, abs(dur - target) / max(1.0, max_len - min_len))
        score = (
            0.35 * energy * (0.5 + 0.5 * pw) +
            0.25 * peakv * pw +
            0.15 * sustained_frac * sw +
            0.15 * motion_mean * (vw if visual_ok else 0.0) +
            0.10 * dur_fit
        )
        # reason text
        reason_parts = []
        if peakv >= 0.35:
            reason_parts.append("audio peak")
        if sustained_frac >= 0.4:
            reason_parts.append("sustained energy")
        if visual_ok and motion_mean >= 0.08:
            reason_parts.append("visual motion")
        if not reason_parts:
            reason_parts.append("energy")
        reason = ", ".join(reason_parts).capitalize()
        signals = {
            "peak_time": round(ct, 2),
            "energy": round(energy, 3),
            "peak_novelty": round(peakv, 3),
            "sustained": round(sustained_frac, 3),
            "motion": round(motion_mean, 3),
            "duration": round(dur, 2),
            "visual": bool(visual_ok),
            "scene_cuts_near": sum(1 for c in scene_cuts if ss - 2 <= c <= ee + 2),
        }
        windows.append({
            "start": round(ss, 3),
            "end": round(ee, 3),
            "score": round(score, 4),
            "signals": signals,
            "reason": reason,
        })

    if not windows:
        return {"clips": [], "visual": visual_ok}

    # NMS by overlap
    windows.sort(key=lambda w: w["score"], reverse=True)
    chosen: list[dict] = []
    for w in windows:
        if len(chosen) >= max_clips * 2:
            break
        if any(not (w["end"] <= c["start"] or w["start"] >= c["end"]) for c in chosen):
            # overlap check with 0.5s tolerance
            overlap = False
            for c in chosen:
                inter = min(w["end"], c["end"]) - max(w["start"], c["start"])
                if inter > 0.5:
                    overlap = True
                    break
            if overlap:
                continue
        chosen.append(w)
    # take top max_clips by score
    chosen.sort(key=lambda w: w["score"], reverse=True)
    chosen = chosen[:max_clips]
    chosen.sort(key=lambda w: w["start"])

    # normalize scores to 0..1 (min-max)
    scores = [w["score"] for w in chosen]
    lo_s = min(scores) if scores else 0.0
    hi_s = max(scores) if scores else 1.0
    rng = max(1e-6, hi_s - lo_s)
    for w in chosen:
        w["score"] = round(min(0.99, max(0.05, (w["score"] - lo_s) / rng * 0.85 + 0.15)), 3)

    # hot flags: top 30%
    n = len(chosen)
    if n >= 2:
        k = int(round(0.3 * n))
        if k == 0:
            k = 1
        k = min(k, n)
    else:
        k = 0
    if k > 0:
        order = sorted(range(n), key=lambda i: chosen[i]["score"], reverse=True)
        hot_set = set(order[:k])
        for i, w in enumerate(chosen):
            w["is_hot"] = i in hot_set
    else:
        for w in chosen:
            w["is_hot"] = False

    # finalize clip dicts
    badge = (NICHE_BY_ID.get(niche) or NICHE_BY_ID["generic"])["badges"][0]
    clips = []
    for index, w in enumerate(chosen, start=1):
        clips.append({
            "start": w["start"],
            "end": w["end"],
            "score": w["score"],
            "is_hot": bool(w["is_hot"]),
            "hook": "",
            "reason": w["reason"],
            "title": f"Clip {index}",
            "badge": badge,
            "hashtags": ["#shorts", "#clip"],
            "signals": w["signals"],
        })
    return {"clips": clips, "visual": visual_ok}
