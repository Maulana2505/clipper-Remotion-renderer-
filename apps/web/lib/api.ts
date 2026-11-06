export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

/** Niche metadata captured per job and reused by niche layouts. */
export interface ClipMeta {
  title?: string | null;
  hook?: string | null;
  badge?: string | null;
  teams?: { home: string; away: string };
  score?: { home: number; away: number };
  minute?: string;
  competition?: string;
  speaker?: string;
  topic?: string;
  language?: string;
}

export interface Job {
  id: string;
  source_type: string;
  source_url?: string | null;
  title?: string | null;
  status: JobStatus;
  stage: string;
  progress: number;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  niche?: string | null;
  channel_id?: string | null;
  source_start?: number | null;
  source_end?: number | null;
  meta?: ClipMeta | null;
  error?: string | null;
  created_at: string;
  updated_at?: string;
  clip_count?: number;
}

export interface CropSettings {
  x: number;
  y: number;
  zoom: number;
}

export interface OverlaySettings {
  id?: string;
  shape: "circle" | "rounded" | "square";
  source_url?: string | null;
  framePrefix?: string;
  x: number;
  y: number;
  size: number;
  crop: CropSettings;
}

export interface Clip {
  id: string;
  job_id: string;
  start_time: number;
  end_time: number;
  score: number;
  is_hot: boolean;
  hook?: string | null;
  title?: string | null;
  reason?: string | null;
  signals?: Record<string, unknown> | null;
  hashtags: string[];
  canvas: string;
  video_template: string;
  caption_template: string;
  caption_enabled: boolean;
  font_preset: string;
  badge?: string | null;
  accent?: string | null;
  meta?: ClipMeta | null;
  crop?: CropSettings | null;
  overlays?: OverlaySettings[] | null;
  caption_layout?: {
    lines_on_screen?: number;
    words_per_line?: number;
    y?: number;
    align?: "left" | "center" | "right";
    width?: number;
    font_scale?: number;
    line_gap?: number;
  } | null;
  face_track_path?: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  niche: string;
  canvas: string;
  video_template: string;
  caption_template: string;
  font_preset: string;
  accent: string;
  caption_enabled: boolean;
  language?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface NichePreset {
  id: string;
  name: string;
  canvas: string;
  video_template: string;
  caption_template: string;
  font_preset: string;
  accent: string;
  badges: string[];
  clip_focus: string;
}

export interface Render {
  id: string;
  clip_id: string;
  canvas: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  output_path?: string | null;
  batch_id?: string | null;
  error?: string | null;
  engine?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface CanvasPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  platform: string;
  safe_area: { top: number; bottom: number; left: number; right: number };
}

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  animation?: string;
  requires_face_track?: boolean;
  niche?: string;
}

export interface FontPreset {
  id: string;
  name: string;
  family: string;
}

export type WhisperModel = "base" | "small" | "large-v3-turbo";

export const WHISPER_MODELS: { id: WhisperModel; label: string; hint: string }[] = [
  { id: "base", label: "Base", hint: "Tercepat, kualitas dasar" },
  { id: "small", label: "Small", hint: "Seimbang (default lokal)" },
  { id: "large-v3-turbo", label: "Turbo", hint: "Paling akurat, butuh GPU" },
];

export interface WhisperSettings {
  model: WhisperModel | null;
  backend: "local" | "remote";
  language: string;
  mode: string;
  hotwords?: string | null;
  remote_url?: string | null;
  remote_token_masked?: string;
  face_backend?: "local" | "remote";
  auto_full_analysis?: boolean;
}

export interface LlmSettings {
  provider: string;
  model: string;
  base_url?: string | null;
  temperature: number;
  max_clips: number;
  api_key_masked: string;
  configured: boolean;
  updated_at?: string;
}

export interface StorageOverview {
  disk_total: number;
  disk_total_label: string;
  disk_free: number;
  disk_free_label: string;
  data_size: number;
  data_size_label: string;
  warning: boolean;
  reminder: boolean;
  oldest_days: number;
  jobs: Array<{
    id: string;
    title?: string | null;
    status: string;
    created_at: string;
    size: number;
    size_label: string;
  }>;
  renders: Array<{
    id: string;
    clip_id: string;
    canvas: string;
    size: number;
    size_label: string;
    created_at: string;
  }>;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") message = body.detail;
      else if (Array.isArray(body?.detail)) message = body.detail.map((item: any) => item.msg).join(", ");
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/** Seconds to a `1:23:45` / `12:34` label, or `""` for invalid input. */
export function parseTimecode(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parts = text.split(":").map((part) => part.trim());
  if (parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part < 0)) return null;
  return numbers.reduce((total, part) => total * 60 + part, 0);
}

export function formatTimecode(seconds?: number | null): string {
  if (seconds == null || seconds < 0) return "";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
