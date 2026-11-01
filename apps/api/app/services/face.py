from __future__ import annotations

import os
from pathlib import Path

from ..core.config import FACE_MAX_WIDTH, FACE_MODEL_PATH, FACE_SAMPLE_SECONDS


def _fallback(duration: float, reason: str) -> dict:
    duration = max(0.1, duration)
    return {
        "fallback": True,
        "reason": reason,
        "keyframes": [
            {"t": 0.0, "x": 0.5, "y": 0.5, "w": 1.0, "h": 1.0},
            {"t": round(duration, 3), "x": 0.5, "y": 0.5, "w": 1.0, "h": 1.0},
        ],
    }


def _model_candidates() -> list[Path]:
    candidates: list[Path] = []
    if FACE_MODEL_PATH:
        candidates.append(Path(FACE_MODEL_PATH))
    # Bundled location (optional, user can drop the ONNX here).
    here = Path(__file__).resolve().parents[2]  # apps/api
    candidates.append(here / "assets" / "models" / "face_detection_yunet_2023mar.onnx")
    return candidates


def _load_yunet(width: int, height: int):
    """Return a YuNet detector for the given (width, height), or None if unavailable."""
    try:
        import cv2  # type: ignore
    except Exception:
        return None
    for path in _model_candidates():
        if not path.exists():
            continue
        try:
            detector = cv2.FaceDetectorYN.create(
                str(path),
                "",
                (width, height),
                score_threshold=0.6,
                nms_threshold=0.3,
                top_k=5000,
            )
            detector.setInputSize((width, height))
            return detector, "yunet"
        except Exception:  # noqa: BLE001
            continue
    return None


def track_faces(source: Path, start: float, end: float) -> dict:
    duration = max(0.1, float(end) - float(start))
    try:
        import cv2  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return _fallback(duration, f"opencv unavailable: {exc}")

    try:
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            return _fallback(duration, "could not open video")

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if fps <= 1 or fps > 240:
            fps = 30.0
        sample_interval = max(0.1, float(FACE_SAMPLE_SECONDS))
        step = max(1, int(round(fps * sample_interval)))

        # Seek once to the clip start.
        capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(start)) * 1000.0)

        # Cascade fallback.
        cascade = None
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        if not _model_candidates() or not any(p.exists() for p in _model_candidates()):
            cascade = cv2.CascadeClassifier(cascade_path)
            if cascade.empty():
                cascade = None

        # Detector state.
        yunet = None
        yunet_size = None
        detector_kind = "haar"
        if any(p.exists() for p in _model_candidates()):
            detector_kind = "yunet-pending"

        keyframes: list[dict] = []
        smoothed_x = 0.5
        smoothed_y = 0.5
        found_any = False
        frame_index = 0
        t = 0.0

        while t <= duration + 1e-6:
            # Grab frames; only decode (retrieve) the sampled ones.
            if frame_index % step == 0:
                ok = capture.grab()
                if not ok:
                    break
                ok, frame = capture.retrieve()
                if not ok or frame is None:
                    break

                height, width = frame.shape[:2]
                # Downscale for speed.
                if width > FACE_MAX_WIDTH:
                    scale = FACE_MAX_WIDTH / float(width)
                    new_w = FACE_MAX_WIDTH
                    new_h = max(1, int(height * scale))
                    frame_small = cv2.resize(frame, (new_w, new_h))
                else:
                    new_w, new_h = width, height
                    frame_small = frame
                sh, sw = frame_small.shape[:2]

                # Lazy-init YuNet for this (downscaled) size.
                if detector_kind == "yunet-pending":
                    loaded = _load_yunet(sw, sh)
                    if loaded is not None:
                        yunet, _ = loaded
                        yunet_size = (sw, sh)
                        detector_kind = "yunet"
                    else:
                        cascade = cv2.CascadeClassifier(cascade_path)
                        if cascade.empty():
                            cascade = None
                        detector_kind = "haar"

                center = None
                if detector_kind == "yunet" and yunet is not None:
                    try:
                        if yunet_size != (sw, sh):
                            yunet.setInputSize((sw, sh))
                            yunet_size = (sw, sh)
                        _retval, faces = yunet.detect(frame_small)
                        if faces is not None and len(faces) > 0:
                            # largest area
                            areas = [f[2] * f[3] for f in faces]
                            idx = int(max(range(len(faces)), key=lambda i: areas[i]))
                            f = faces[idx]
                            center = ((f[0] + f[2] / 2) / max(1, sw),
                                      (f[1] + f[3] / 2) / max(1, sh))
                    except Exception:  # noqa: BLE001
                        center = None
                if center is None and cascade is not None:
                    gray = cv2.cvtColor(frame_small, cv2.COLOR_BGR2GRAY)
                    faces = cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=4, minSize=(24, 24))
                    if len(faces) > 0:
                        faces = sorted(faces, key=lambda item: item[2] * item[3], reverse=True)
                        x, y, w, h = faces[0]
                        center = ((x + w / 2) / max(1, sw), (y + h / 2) / max(1, sh))

                if center is not None:
                    cx, cy = center
                    smoothed_x = smoothed_x * 0.75 + cx * 0.25
                    smoothed_y = smoothed_y * 0.75 + cy * 0.25
                    found_any = True

                keyframes.append(
                    {
                        "t": round(float(t), 3),
                        "x": round(float(smoothed_x), 4),
                        "y": round(float(smoothed_y), 4),
                        "w": 1.0,
                        "h": 1.0,
                    }
                )
            else:
                ok = capture.grab()
                if not ok:
                    break

            frame_index += 1
            t = frame_index / fps
            if t > duration + 1e-6:
                break

        capture.release()

        if not found_any or not keyframes:
            return _fallback(duration, "no face detected")

        # Thin out very long tracks while keeping the motion shape.
        if len(keyframes) > 400:
            step_out = max(1, len(keyframes) // 400)
            keyframes = keyframes[::step_out] + [keyframes[-1]]

        return {
            "fallback": False,
            "reason": "",
            "detector": detector_kind,
            "keyframes": keyframes,
        }
    except Exception as exc:  # noqa: BLE001
        return _fallback(duration, f"face tracking failed: {exc}")