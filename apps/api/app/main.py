from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import activity, channels, clips, jobs, renders, settings, storage, templates
from .core.config import CORS_ORIGINS
from .db import init_db

app = FastAPI(title="Clipper Local Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(jobs.router)
app.include_router(clips.router)
app.include_router(channels.router)
app.include_router(renders.router)
app.include_router(settings.router)
app.include_router(templates.router)
app.include_router(storage.router)
app.include_router(activity.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "clipper-api"}
