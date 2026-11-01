from __future__ import annotations

import os
from pathlib import Path

# apps/api/app/core/config.py -> apps/api
API_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("CLIPPER_DATA_DIR", API_ROOT / "data")).resolve()
JOBS_DIR = DATA_DIR / "jobs"
# Bundled open-source fonts ship with the repo so renders do not depend on
# whatever fonts happen to be installed on the machine.
FONTS_DIR = API_ROOT / "assets" / "fonts"
TMP_DIR = DATA_DIR / "tmp"

for folder in (DATA_DIR, JOBS_DIR, FONTS_DIR, TMP_DIR):
    folder.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "clipper.db"

FFMPEG = os.getenv("FFMPEG_BIN", "ffmpeg")
FFPROBE = os.getenv("FFPROBE_BIN", "ffprobe")
YTDLP = os.getenv("YTDLP_BIN", "yt-dlp")

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
RENDER_ENGINE = os.getenv("RENDER_ENGINE", "ffmpeg").strip().lower()
RENDER_SERVICE_URL = os.getenv("RENDER_SERVICE_URL", "").strip()

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

# Soft guard rails. The product is personal-use and intentionally permissive,
# but we still refuse to fill the disk completely.
MIN_FREE_DISK_BYTES = int(os.getenv("MIN_FREE_DISK_BYTES", str(5 * 1024**3)))
JOB_TIMEOUT_SECONDS = int(os.getenv("JOB_TIMEOUT_SECONDS", "0"))  # 0 = derive from duration
RENDER_TIMEOUT_SECONDS = int(os.getenv("RENDER_TIMEOUT_SECONDS", str(15 * 60)))
MAX_CLIPS = int(os.getenv("MAX_CLIPS", "20"))

FACE_SAMPLE_SECONDS = float(os.getenv("FACE_SAMPLE_SECONDS", "0.4"))
FACE_MAX_WIDTH = int(os.getenv("FACE_MAX_WIDTH", "480"))
FACE_MODEL_PATH = os.getenv("FACE_MODEL_PATH", "").strip()

ALLOWED_URL_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "tiktok.com",
    "www.tiktok.com",
    "vt.tiktok.com",
    "vm.tiktok.com",
    "twitch.tv",
    "www.twitch.tv",
    "clips.twitch.tv",
    "instagram.com",
    "www.instagram.com",
    "facebook.com",
    "www.facebook.com",
    "fb.watch",
    "twitter.com",
    "www.twitter.com",
    "x.com",
    "www.x.com",
}
