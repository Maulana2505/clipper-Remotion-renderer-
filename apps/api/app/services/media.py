from __future__ import annotations

import ipaddress
import re
import shutil
import socket
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from ..core.config import (
    ALLOWED_URL_HOSTS,
    FFMPEG,
    FFPROBE,
    MIN_FREE_DISK_BYTES,
    YTDLP,
)


class MediaError(RuntimeError):
    pass


def human_size(num_bytes: int | float) -> str:
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


def ensure_disk_space(required_bytes: int = 0) -> None:
    free = shutil.disk_usage(Path.home()).free
    if free < MIN_FREE_DISK_BYTES or free < required_bytes:
        raise MediaError(
            f"Disk space is too low ({human_size(free)} free). "
            "Clean up old files from the Storage page before starting a new job."
        )


def is_safe_url(url: str) -> tuple[bool, str]:
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False, "Invalid URL."
    if parsed.scheme not in {"http", "https"}:
        return False, "Only http and https URLs are supported."
    host = (parsed.hostname or "").lower().strip(".")
    if not host:
        return False, "URL has no host."
    if host not in ALLOWED_URL_HOSTS:
        return False, f"Unsupported host: {host}."
    try:
        addresses = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False, "Could not resolve the URL host."
    for addr in addresses:
        ip = ipaddress.ip_address(addr[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False, "Private or local hosts are not allowed."
    return True, ""


def run(cmd: list[str], *, timeout: int | None = None, cwd: Path | None = None) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise MediaError(f"Required binary not found: {cmd[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError(f"Command timed out: {' '.join(cmd[:3])}") from exc


def download_video(
    url: str,
    destination: Path,
    timeout: int | None = None,
    section: tuple[float, float] | None = None,
) -> Path:
    """Download a video, optionally only a ``(start, end)`` window.

    With a section the produced file starts at the section start, so all later
    timings (transcript, clips) are relative to the file itself.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        YTDLP,
        "--no-playlist",
        "--no-warnings",
        "--force-overwrites",
        "--no-part",
        "-f",
        "bv*[height<=1080]+ba/b[height<=1080]/b",
        "--merge-output-format",
        "mp4",
    ]
    if section is not None:
        start, end = section
        cmd += [
            "--download-sections",
            f"*{max(0.0, start):.3f}-{max(start + 0.1, end):.3f}",
            "--force-keyframes-at-cuts",
        ]
    cmd += ["-o", str(destination), url]
    result = run(cmd, timeout=timeout, cwd=destination.parent)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "").strip().splitlines()
        raise MediaError(message[-1] if message else "yt-dlp failed.")
    if destination.exists():
        return destination
    candidates = sorted(destination.parent.glob("source.*"))
    for candidate in candidates:
        if candidate.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov", ".m4v"}:
            return candidate
    raise MediaError("Download finished but no video file was produced.")


def fetch_video_title(url: str, timeout: int = 30) -> str:
    """Best-effort title lookup so URL jobs show the real video name."""
    cmd = [YTDLP, "--no-playlist", "--no-warnings", "--get-title", url]
    try:
        result = run(cmd, timeout=timeout)
    except MediaError:
        return ""
    if result.returncode != 0:
        return ""
    title = (result.stdout or "").strip().splitlines()
    return title[0].strip()[:200] if title else ""


def probe_url_duration(url: str, timeout: int = 45) -> float:
    """Best-effort URL duration lookup so long VODs can offer a range import."""
    cmd = [YTDLP, "--no-playlist", "--no-warnings", "--skip-download", "--print", "%(duration)s", url]
    try:
        result = run(cmd, timeout=timeout)
    except MediaError:
        return 0.0
    if result.returncode != 0:
        return 0.0
    for line in reversed((result.stdout or "").strip().splitlines()):
        try:
            return max(0.0, float(line.strip()))
        except ValueError:
            continue
    return 0.0


def try_download_subtitles(url: str, job_dir: Path, timeout: int | None = None) -> Path | None:
    """Best-effort subtitle download. Used when Whisper is not installed."""
    prefix = job_dir / "subs"
    cmd = [
        YTDLP,
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "--write-auto-subs",
        "--write-subs",
        "--sub-format",
        "vtt",
        "--sub-langs",
        "en.*,id.*",
        "-o",
        str(prefix),
        url,
    ]
    result = run(cmd, timeout=timeout, cwd=job_dir)
    if result.returncode != 0:
        return None
    vtts = sorted(job_dir.glob("subs*.vtt"))
    return vtts[0] if vtts else None


def probe_media(path: Path) -> dict:
    cmd = [
        FFPROBE,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = run(cmd, timeout=60)
    if result.returncode != 0:
        raise MediaError("ffprobe could not read the video.")
    import json

    data = json.loads(result.stdout or "{}")
    duration = float(data.get("format", {}).get("duration") or 0)
    width = 0
    height = 0
    has_audio = False
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video" and not width:
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
            if duration <= 0:
                duration = float(stream.get("duration") or 0)
        if stream.get("codec_type") == "audio":
            has_audio = True
    return {
        "duration": duration,
        "width": width,
        "height": height,
        "has_audio": has_audio,
    }


def extract_audio(source: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        FFMPEG,
        "-y",
        "-i",
        str(source),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(destination),
    ]
    result = run(cmd, timeout=60 * 30)
    if result.returncode != 0:
        message = (result.stderr or "").strip().splitlines()
        raise MediaError(message[-1] if message else "ffmpeg could not extract audio.")
    return destination


def parse_vtt(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n"))
    segments: list[dict] = []
    time_re = re.compile(
        r"(?P<sh>\d{2}):(?P<sm>\d{2}):(?P<ss>\d{2})[.,](?P<sms>\d{3})\s*-->\s*"
        r"(?P<eh>\d{2}):(?P<em>\d{2}):(?P<es>\d{2})[.,](?P<ems>\d{3})"
    )

    def to_seconds(parts: dict[str, str], prefix: str) -> float:
        return (
            int(parts[prefix + "h"]) * 3600
            + int(parts[prefix + "m"]) * 60
            + int(parts[prefix + "s"])
            + int(parts[prefix + "ms"]) / 1000
        )

    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        match = None
        match_index = -1
        for index, line in enumerate(lines):
            candidate = time_re.search(line)
            if candidate:
                match = candidate
                match_index = index
                break
        if not match:
            continue
        start = to_seconds(match.groupdict(), "s")
        end = to_seconds(match.groupdict(), "e")
        raw_text = " ".join(lines[match_index + 1 :])
        raw_text = re.sub(r"<[^>]+>", "", raw_text)
        raw_text = re.sub(r"\s+", " ", raw_text).strip()
        if not raw_text or end <= start:
            continue
        words_text = raw_text.split()
        step = (end - start) / max(1, len(words_text))
        words = [
            {"word": word, "start": start + idx * step, "end": start + (idx + 1) * step}
            for idx, word in enumerate(words_text)
        ]
        segments.append({"start": start, "end": end, "text": raw_text, "words": words})
    return segments
