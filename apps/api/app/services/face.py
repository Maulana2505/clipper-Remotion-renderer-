from __future__ import annotations

from pathlib import Path


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


def track_faces(source: Path, start: float, end: float) -> dict:
    duration = max(0.1, float(end) - float(start))
    try:
        import cv2  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return _fallback(duration, f"opencv unavailable: {exc}")

    try:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(cascade_path)
        if cascade.empty():
            return _fallback(duration, "face cascade unavailable")

        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            return _fallback(duration, "could not open video")

        keyframes: list[dict] = []
        sample_interval = 0.2
        t = 0.0
        smoothed_x = 0.5
        smoothed_y = 0.5
        found_any = False

        while t <= duration + 1e-6:
            capture.set(cv2.CAP_PROP_POS_MSEC, (float(start) + t) * 1000.0)
            ok, frame = capture.read()
            if not ok:
                break
            height, width = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(40, 40))
            if len(faces) > 0:
                faces = sorted(faces, key=lambda item: item[2] * item[3], reverse=True)
                x, y, w, h = faces[0]
                center_x = (x + w / 2) / max(1, width)
                center_y = (y + h / 2) / max(1, height)
                # Exponential moving average reduces crop jitter.
                smoothed_x = smoothed_x * 0.7 + center_x * 0.3
                smoothed_y = smoothed_y * 0.7 + center_y * 0.3
                found_any = True
            keyframes.append(
                {
                    "t": round(t, 3),
                    "x": round(smoothed_x, 4),
                    "y": round(smoothed_y, 4),
                    "w": 1.0,
                    "h": 1.0,
                }
            )
            t += sample_interval
        capture.release()

        if not found_any or not keyframes:
            return _fallback(duration, "no face detected")

        # Thin out very long tracks while keeping the motion shape.
        if len(keyframes) > 400:
            step = max(1, len(keyframes) // 400)
            keyframes = keyframes[::step] + [keyframes[-1]]
        return {"fallback": False, "reason": "", "keyframes": keyframes}
    except Exception as exc:  # noqa: BLE001
        return _fallback(duration, f"face tracking failed: {exc}")
