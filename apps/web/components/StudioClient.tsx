"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Captions,
  Check,
  Clock,
  Download,
  Film,
  Flame,
  Grid3X3,
  Layers,
  Loader2,
  PackageOpen,
  Play,
  RefreshCw,
  ScanFace,
  Sparkles,
  Type,
  Wand2,
  Zap,
} from "lucide-react";
import ClipPreview from "@/components/ClipPreview";
import {
  api,
  apiUrl,
  formatDuration,
  type CanvasPreset,
  type Channel,
  type Clip,
  type ClipMeta,
  type FontPreset,
  type Job,
  type NichePreset,
  type Render,
  type TemplateItem,
} from "@/lib/api";

type StyleTab = "video" | "canvas" | "caption" | "font" | "brand";

const STAGES = [
  { id: "download", label: "Download" },
  { id: "audio", label: "Audio" },
  { id: "transcribe", label: "Transcribe" },
  { id: "detect", label: "Detect hooks" },
  { id: "face_track", label: "Face track" },
  { id: "ready", label: "Ready" },
];

export default function StudioClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [canvases, setCanvases] = useState<CanvasPreset[]>([]);
  const [videoTemplates, setVideoTemplates] = useState<TemplateItem[]>([]);
  const [captionTemplates, setCaptionTemplates] = useState<TemplateItem[]>([]);
  const [fonts, setFonts] = useState<FontPreset[]>([]);
  const [niches, setNiches] = useState<NichePreset[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renders, setRenders] = useState<Render[]>([]);
  const [tab, setTab] = useState<StyleTab>("video");
  const [rendering, setRendering] = useState(false);
  const [renderingAll, setRenderingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const clipsLoaded = useRef(false);
  const selectedIdRef = useRef<string | null>(null);

  const selectedClip = useMemo(() => clips.find((clip) => clip.id === selectedId) || null, [clips, selectedId]);
  const selectedCanvas = useMemo(
    () => canvases.find((canvas) => canvas.id === selectedClip?.canvas) || canvases[0],
    [canvases, selectedClip?.canvas],
  );

  const niche = useMemo(
    () => job?.niche || channels.find((channel) => channel.id === job?.channel_id)?.niche || "generic",
    [job?.niche, job?.channel_id, channels],
  );
  // A clip can use a niche layout without the job having a niche (older jobs or
  // a manual layout switch), so the layout also decides which metadata panel
  // and badge suggestions are relevant.
  const effectiveNiche = useMemo(() => {
    if (niche !== "generic") return niche;
    switch (selectedClip?.video_template) {
      case "gaming_hud":
        return "gaming";
      case "football_scoreboard":
        return "football";
      case "duo_split":
        return "podcast";
      case "lower_third":
        return "education";
      default:
        return "generic";
    }
  }, [niche, selectedClip?.video_template]);
  const nichePreset = useMemo(
    () => niches.find((item) => item.id === effectiveNiche) || null,
    [niches, effectiveNiche],
  );
  const accent = selectedClip?.accent || nichePreset?.accent || "#CCFF00";
  const clipMeta = useMemo<ClipMeta>(
    () => ({ ...(job?.meta || {}), ...(selectedClip?.meta || {}) }),
    [job?.meta, selectedClip?.meta],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    Promise.all([
      api<CanvasPreset[]>("/api/canvas-presets"),
      api<TemplateItem[]>("/api/video-templates"),
      api<TemplateItem[]>("/api/caption-templates"),
      api<FontPreset[]>("/api/font-presets"),
    ])
      .then(([canvasData, videoData, captionData, fontData]) => {
        setCanvases(canvasData);
        setVideoTemplates(videoData);
        setCaptionTemplates(captionData);
        setFonts(fontData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load templates."));
    api<NichePreset[]>("/api/niches").then(setNiches).catch(() => undefined);
    api<Channel[]>("/api/channels").then(setChannels).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const jobData = await api<Job>(`/api/jobs/${jobId}`);
        if (!active) return;
        setJob(jobData);
        if (jobData.status === "completed" && !clipsLoaded.current) {
          const clipData = await api<Clip[]>(`/api/jobs/${jobId}/clips`);
          if (!active) return;
          setClips(clipData);
          clipsLoaded.current = true;
          if (clipData.length && !selectedIdRef.current) {
            setSelectedId(clipData[0].id);
          }
        }
        if (jobData.status === "failed") {
          setError(jobData.error || "This job failed.");
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load job.");
      }
    }
    load();
    const timer = setInterval(load, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId]);

  useEffect(() => {
    if (!selectedClip) {
      setRenders([]);
      return;
    }
    let active = true;
    async function loadRenders() {
      try {
        const data = await api<Render[]>(`/api/clips/${selectedClip!.id}/renders`);
        if (active) setRenders(data);
      } catch {
        // ignore
      }
    }
    loadRenders();
    const timer = setInterval(loadRenders, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedClip?.id]);

  async function refreshJob() {
    try {
      const jobData = await api<Job>(`/api/jobs/${jobId}`);
      setJob(jobData);
      if (jobData.status === "completed") {
        const clipData = await api<Clip[]>(`/api/jobs/${jobId}/clips`);
        setClips(clipData);
        clipsLoaded.current = true;
        if (clipData.length && !selectedId) setSelectedId(clipData[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    }
  }

  async function patchClip(patch: Partial<Clip>, applyAll = false) {
    if (!selectedClip) return;
    const targets = applyAll ? clips : [selectedClip];
    setClips((current) =>
      current.map((clip) => (targets.some((target) => target.id === clip.id) ? { ...clip, ...patch } : clip)),
    );
    setError(null);
    try {
      await Promise.all(
        targets.map((clip) =>
          api<Clip>(`/api/clips/${clip.id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
        ),
      );
      setNotice(applyAll ? "Style applied to all clips." : "Saved.");
      setTimeout(() => setNotice(null), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save clip.");
      await refreshJob();
    }
  }

  async function renderSelected() {
    if (!selectedClip) return;
    setRendering(true);
    setError(null);
    try {
      await api(`/api/clips/${selectedClip.id}/render`, {
        method: "POST",
        body: JSON.stringify({ canvas: selectedClip.canvas }),
      });
      setNotice("Render queued.");
      setTimeout(() => setNotice(null), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start render.");
    } finally {
      setRendering(false);
    }
  }

  async function renderAll() {
    if (!selectedClip) return;
    setRenderingAll(true);
    setError(null);
    try {
      await api(`/api/clips/${selectedClip.id}/render-all`, { method: "POST" });
      setNotice("All 8 canvases queued one by one.");
      setTimeout(() => setNotice(null), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start export.");
    } finally {
      setRenderingAll(false);
    }
  }

  if (!job) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-lime" />
      </div>
    );
  }

  const working = job.status === "queued" || job.status === "processing";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-panel text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="max-w-[60vw] truncate text-lg font-bold tracking-tight text-white sm:max-w-none">
              {job.title || "Untitled job"}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className={`inline-flex items-center gap-1.5 ${job.status === "failed" ? "text-red-300" : "text-lime"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${job.status === "failed" ? "bg-red-400" : "bg-lime"}`} />
                {job.status}
              </span>
              <span>·</span>
              <span>{job.stage}</span>
              {job.duration ? (
                <>
                  <span>·</span>
                  <span>{formatDuration(job.duration)} source</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {notice ? (
            <span className="rounded-lg border border-lime/25 bg-lime/10 px-2.5 py-1.5 text-[11px] text-lime">{notice}</span>
          ) : null}
          <button
            onClick={refreshJob}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-panel px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-300/60 hover:text-red-200">
            ×
          </button>
        </div>
      ) : null}

      {working ? (
        <ProcessingPanel job={job} />
      ) : job.status === "failed" ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <AlertCircle size={28} className="mx-auto text-red-300" />
          <h2 className="mt-3 text-lg font-semibold text-white">This job could not be processed</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">{job.error || "Unknown error."}</p>
          <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2 text-sm font-semibold text-black">
            <ArrowLeft size={15} /> Back to import
          </Link>
        </div>
      ) : clips.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-panel p-10 text-center">
          <Film size={24} className="mx-auto text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-400">No clips were detected. Try a longer video with speech.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
                  <span className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
                    {selectedCanvas?.name || "9:16"}
                  </span>
                  {selectedClip?.is_hot ? (
                    <span className="flex items-center gap-1 rounded-md bg-orange-500/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      <Flame size={10} /> Hot
                    </span>
                  ) : null}
                </div>
                {selectedClip && selectedCanvas ? (
                  <ClipPreview
                    job={job}
                    clip={selectedClip}
                    canvas={selectedCanvas}
                    videoTemplate={selectedClip.video_template}
                    captionTemplate={selectedClip.caption_template}
                    captionEnabled={selectedClip.caption_enabled}
                    fontPreset={selectedClip.font_preset}
                    accent={accent}
                    badge={selectedClip.badge}
                    meta={clipMeta}
                  />
                ) : null}
              </div>
              {selectedClip ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-panel px-4 py-3">
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} /> {formatDuration(selectedClip.end_time - selectedClip.start_time)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Zap size={13} className="text-lime" /> {Math.round(selectedClip.score * 100)} score
                    </span>
                    <span className="hidden items-center gap-1.5 sm:flex">
                      <ScanFace size={13} /> {selectedClip.video_template.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={renderSelected}
                      disabled={rendering}
                      className="flex items-center gap-2 rounded-xl bg-lime px-4 py-2 text-sm font-bold text-black hover:bg-lime/90 disabled:opacity-50"
                    >
                      {rendering ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      Render clip
                    </button>
                    <button
                      onClick={renderAll}
                      disabled={renderingAll}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-panel2 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5 disabled:opacity-50"
                    >
                      {renderingAll ? <Loader2 size={15} className="animate-spin" /> : <PackageOpen size={15} />}
                      Export all
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <StylePanel
              tab={tab}
              setTab={setTab}
              clip={selectedClip}
              canvases={canvases}
              videoTemplates={videoTemplates}
              captionTemplates={captionTemplates}
              fonts={fonts}
              accent={accent}
              badgeSuggestions={nichePreset?.badges || []}
              patchClip={patchClip}
            />
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-base font-bold tracking-tight text-white">Detected clips</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {clips.length} found · {clips.filter((clip) => clip.is_hot).length} hot ·{" "}
                  {renders.filter((render) => render.status === "completed").length} rendered here
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <Grid3X3 size={13} /> Click a card to edit
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {clips.map((clip, index) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  index={index}
                  selected={clip.id === selectedId}
                  canvas={canvases.find((item) => item.id === clip.canvas)}
                  onSelect={() => setSelectedId(clip.id)}
                />
              ))}
            </div>
          </section>

          {selectedClip ? (
            <MetadataPanel clip={selectedClip} patchClip={patchClip} niche={effectiveNiche} />
          ) : null}

          <RenderPanel clip={selectedClip} renders={renders} />
        </>
      )}
    </div>
  );
}

function ProcessingPanel({ job }: { job: Job }) {
  const activeIndex = Math.max(0, STAGES.findIndex((stage) => stage.id === job.stage));
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-panel p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/10 text-lime">
          <Wand2 size={19} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-white">Building your clip set</h2>
          <p className="text-xs text-zinc-500">
            {job.stage} · {job.progress}% · long videos can take a while
          </p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${Math.max(3, job.progress)}%` }} />
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        {STAGES.map((stage, index) => {
          const done = index < activeIndex || job.status === "completed";
          const active = index === activeIndex && job.status !== "completed";
          return (
            <div
              key={stage.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                done
                  ? "border-lime/20 bg-lime/5 text-lime"
                  : active
                    ? "border-white/15 bg-white/5 text-white"
                    : "border-white/5 bg-black/10 text-zinc-600"
              }`}
            >
              {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />}
              {stage.label}
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-center text-[11px] leading-relaxed text-zinc-600">
        Download, transcription, hook detection, and face tracking run locally. Keep this tab open while the job is working.
      </p>
    </div>
  );
}

function StylePanel({
  tab,
  setTab,
  clip,
  canvases,
  videoTemplates,
  captionTemplates,
  fonts,
  accent,
  badgeSuggestions,
  patchClip,
}: {
  tab: StyleTab;
  setTab: (tab: StyleTab) => void;
  clip: Clip | null;
  canvases: CanvasPreset[];
  videoTemplates: TemplateItem[];
  captionTemplates: TemplateItem[];
  fonts: FontPreset[];
  accent: string;
  badgeSuggestions: string[];
  patchClip: (patch: Partial<Clip>, applyAll?: boolean) => Promise<void>;
}) {
  if (!clip) return null;
  return (
    <aside className="h-fit rounded-2xl border border-white/10 bg-panel p-4 xl:sticky xl:top-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">Style</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">Changes update the preview instantly.</p>
        </div>
        <button
          onClick={() =>
            patchClip(
              {
                canvas: clip.canvas,
                video_template: clip.video_template,
                caption_template: clip.caption_template,
                caption_enabled: clip.caption_enabled,
                font_preset: clip.font_preset,
                accent: clip.accent || accent,
                badge: clip.badge ?? null,
              },
              true,
            )
          }
          className="rounded-lg border border-lime/20 bg-lime/10 px-2.5 py-1.5 text-[10px] font-medium text-lime hover:bg-lime/15"
        >
          Apply to all
        </button>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1 rounded-xl bg-black/30 p-1">
        {[
          { id: "video" as const, label: "Video", icon: Film },
          { id: "canvas" as const, label: "Canvas", icon: Layers },
          { id: "caption" as const, label: "Caption", icon: Captions },
          { id: "font" as const, label: "Font", icon: Type },
          { id: "brand" as const, label: "Badge", icon: Sparkles },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition ${
              tab === item.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <item.icon size={12} />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {tab === "video" ? (
          videoTemplates.map((template) => (
            <TemplateButton
              key={template.id}
              active={clip.video_template === template.id}
              title={template.name}
              description={template.description}
              onClick={() => patchClip({ video_template: template.id })}
            />
          ))
        ) : null}

        {tab === "canvas" ? (
          <div className="grid grid-cols-2 gap-2">
            {canvases.map((canvas) => (
              <button
                key={canvas.id}
                onClick={() => patchClip({ canvas: canvas.id })}
                className={`rounded-xl border p-3 text-left transition ${
                  clip.canvas === canvas.id
                    ? "border-lime/40 bg-lime/10"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
              >
                <div
                  className="mb-2 rounded-md border border-white/10 bg-white/5"
                  style={{
                    aspectRatio: `${canvas.width} / ${canvas.height}`,
                    maxHeight: 54,
                    margin: "0 auto",
                    width: canvas.width >= canvas.height ? "100%" : "auto",
                    height: canvas.width >= canvas.height ? "auto" : 54,
                  }}
                />
                <div className="text-[11px] font-semibold text-white">{canvas.name}</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  {canvas.width}×{canvas.height}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "caption" ? (
          <>
            <div className="mb-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <div>
                <div className="text-xs font-medium text-white">Captions</div>
                <div className="text-[10px] text-zinc-500">Turn off for a clean export.</div>
              </div>
              <button
                onClick={() => patchClip({ caption_enabled: !clip.caption_enabled })}
                className={`relative h-6 w-11 rounded-full transition ${clip.caption_enabled ? "bg-lime" : "bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                    clip.caption_enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            {captionTemplates.map((template) => (
              <TemplateButton
                key={template.id}
                active={clip.caption_template === template.id}
                title={template.name}
                description={template.description}
                disabled={!clip.caption_enabled && template.id !== "none"}
                onClick={() => patchClip({ caption_template: template.id })}
              />
            ))}
          </>
        ) : null}

        {tab === "font" ? (
          fonts.map((font) => (
            <button
              key={font.id}
              onClick={() => patchClip({ font_preset: font.id })}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                clip.font_preset === font.id
                  ? "border-lime/40 bg-lime/10"
                  : "border-white/10 bg-black/20 hover:border-white/20"
              }`}
            >
              <span className="text-sm text-white" style={{ fontFamily: font.family }}>
                {font.name}
              </span>
              {clip.font_preset === font.id ? <Check size={14} className="text-lime" /> : null}
            </button>
          ))
        ) : null}

        {tab === "brand" ? (
          <BrandPanel clip={clip} accent={accent} badgeSuggestions={badgeSuggestions} patchClip={patchClip} />
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Badge and accent are per clip: the LLM proposes a badge, the user can rename
 * it or pick a niche-specific one before rendering.
 */
function BrandPanel({
  clip,
  accent,
  badgeSuggestions,
  patchClip,
}: {
  clip: Clip;
  accent: string;
  badgeSuggestions: string[];
  patchClip: (patch: Partial<Clip>) => Promise<void>;
}) {
  const [badge, setBadge] = useState(clip.badge || "");
  const [colour, setColour] = useState(clip.accent || accent);

  useEffect(() => {
    setBadge(clip.badge || "");
    setColour(clip.accent || accent);
  }, [clip.id, clip.badge, clip.accent, accent]);

  const savedBadge = (clip.badge || "").trim();
  const savedColour = (clip.accent || accent).toLowerCase();
  const dirty = badge.trim() !== savedBadge || colour.trim().toLowerCase() !== savedColour;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Moment badge</span>
        <input
          value={badge}
          onChange={(event) => setBadge(event.target.value.toUpperCase())}
          placeholder="CLUTCH"
          className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm uppercase tracking-wide text-white placeholder:text-zinc-600 focus:border-lime/40"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {badgeSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => setBadge(suggestion)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
              badge === suggestion
                ? "border-lime/50 bg-lime/15 text-lime"
                : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-white"
            }`}
          >
            {suggestion}
          </button>
        ))}
        <button
          onClick={() => setBadge("")}
          className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-white"
        >
          None
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Accent colour</span>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3">
          <input
            type="color"
            value={colour}
            onChange={(event) => setColour(event.target.value)}
            className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <input
            value={colour}
            onChange={(event) => setColour(event.target.value)}
            className="h-10 w-full bg-transparent font-mono text-xs uppercase text-white focus:outline-none"
          />
        </div>
      </label>
      <button
        onClick={() => patchClip({ badge: badge.trim() || null, accent: colour })}
        disabled={!dirty}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-3 py-2 text-xs font-bold text-black hover:bg-lime/90 disabled:opacity-40"
      >
        <Check size={13} /> Save badge
      </button>
    </div>
  );
}

function TemplateButton({
  active,
  title,
  description,
  onClick,
  disabled,
}: {
  active: boolean;
  title: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-40 ${
        active ? "border-lime/40 bg-lime/10" : "border-white/10 bg-black/20 hover:border-white/20"
      }`}
    >
      <div>
        <div className="text-xs font-medium text-white">{title}</div>
        {description ? <div className="mt-0.5 text-[10px] text-zinc-500">{description}</div> : null}
      </div>
      {active ? <Check size={14} className="shrink-0 text-lime" /> : null}
    </button>
  );
}

function ClipCard({
  clip,
  index,
  selected,
  canvas,
  onSelect,
}: {
  clip: Clip;
  index: number;
  selected: boolean;
  canvas?: CanvasPreset;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`group overflow-hidden rounded-2xl border text-left transition ${
        selected ? "border-lime/50 bg-lime/5 shadow-lime" : "border-white/10 bg-panel hover:border-white/20"
      }`}
    >
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_30%_20%,rgba(204,255,0,0.25),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(0,229,255,0.18),transparent_45%)]" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur transition group-hover:scale-105">
            <Play size={15} className="ml-0.5" />
          </span>
        </div>
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
            #{String(index + 1).padStart(2, "0")}
          </span>
          {clip.is_hot ? (
            <span className="flex items-center gap-0.5 rounded-md bg-orange-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
              <Flame size={9} /> Hot
            </span>
          ) : null}
        </div>
        <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
          {formatDuration(clip.end_time - clip.start_time)}
        </div>
      </div>
      <div className="p-3">
        <div className="truncate text-xs font-semibold text-white">{clip.title || "Untitled clip"}</div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
          <span>{canvas?.name || "9:16"}</span>
          <span>{Math.round(clip.score * 100)} score</span>
        </div>
      </div>
    </button>
  );
}

function MetadataPanel({
  clip,
  patchClip,
  niche,
}: {
  clip: Clip;
  patchClip: (patch: Partial<Clip>) => Promise<void>;
  niche: string;
}) {
  const [title, setTitle] = useState(clip.title || "");
  const [hashtags, setHashtags] = useState((clip.hashtags || []).join(" "));
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState({ home: "", away: "" });
  const [score, setScore] = useState({ home: "", away: "" });
  const [minute, setMinute] = useState("");
  const [competition, setCompetition] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [topic, setTopic] = useState("");

  useEffect(() => {
    setTitle(clip.title || "");
    setHashtags((clip.hashtags || []).join(" "));
    const meta = clip.meta || {};
    setTeams({ home: meta.teams?.home || "", away: meta.teams?.away || "" });
    setScore({
      home: meta.score?.home != null ? String(meta.score.home) : "",
      away: meta.score?.away != null ? String(meta.score.away) : "",
    });
    setMinute(meta.minute || "");
    setCompetition(meta.competition || "");
    setSpeaker(meta.speaker || "");
    setTopic(meta.topic || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.title, clip.hashtags, clip.meta]);

  async function save() {
    setSaving(true);
    const meta: ClipMeta = { ...(clip.meta || {}) };
    if (niche === "football") {
      if (teams.home.trim() || teams.away.trim()) {
        meta.teams = { home: teams.home.trim() || "HOME", away: teams.away.trim() || "AWAY" };
      }
      if (score.home.trim() || score.away.trim()) {
        meta.score = { home: Number(score.home) || 0, away: Number(score.away) || 0 };
      }
      meta.minute = minute.trim() || undefined;
      meta.competition = competition.trim() || undefined;
    } else {
      meta.speaker = speaker.trim() || undefined;
      meta.topic = topic.trim() || undefined;
    }
    await patchClip({
      title: title.trim() || "Untitled clip",
      hashtags: hashtags
        .split(/[\s,]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
      meta,
    });
    setSaving(false);
  }

  const inputClass =
    "h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40";

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">Metadata</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Edit the title, hashtags and on-screen details before exporting.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-panel2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Save metadata
        </button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
            placeholder="Clip title"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">Hashtags</span>
          <input
            value={hashtags}
            onChange={(event) => setHashtags(event.target.value)}
            className={inputClass}
            placeholder="#shorts #viral"
          />
        </label>
      </div>

      {niche === "football" ? (
        <div className="mt-4 rounded-xl border border-orange-400/20 bg-orange-400/5 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-orange-300">Scoreboard</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={teams.home}
              onChange={(event) => setTeams({ ...teams, home: event.target.value })}
              className={inputClass}
              placeholder="Home team"
            />
            <input
              value={teams.away}
              onChange={(event) => setTeams({ ...teams, away: event.target.value })}
              className={inputClass}
              placeholder="Away team"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              value={score.home}
              onChange={(event) => setScore({ ...score, home: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              className={inputClass}
              placeholder="0"
            />
            <input
              value={score.away}
              onChange={(event) => setScore({ ...score, away: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              className={inputClass}
              placeholder="0"
            />
            <input
              value={minute}
              onChange={(event) => setMinute(event.target.value)}
              className={inputClass}
              placeholder="78'"
            />
            <input
              value={competition}
              onChange={(event) => setCompetition(event.target.value)}
              className={inputClass}
              placeholder="Liga 1"
            />
          </div>
        </div>
      ) : niche === "podcast" || niche === "education" ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/15 p-3 sm:grid-cols-2">
          <input
            value={speaker}
            onChange={(event) => setSpeaker(event.target.value)}
            className={inputClass}
            placeholder="Speaker name"
          />
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className={inputClass}
            placeholder="Topic"
          />
        </div>
      ) : null}

      {clip.hook ? (
        <div className="mt-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-xs text-zinc-400">
          <span className="mr-2 text-[10px] uppercase tracking-wider text-zinc-600">Hook</span>
          {clip.hook}
        </div>
      ) : null}
    </section>
  );
}

function RenderPanel({ clip, renders }: { clip: Clip | null; renders: Render[] }) {
  if (!clip) return null;
  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">Renders</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">One clip can be exported to all 8 canvases, one by one.</p>
        </div>
        {renders.some((render) => render.status === "completed") ? (
          <a
            href={apiUrl(`/api/clips/${clip.id}/download-all`)}
            className="flex items-center gap-1.5 rounded-lg bg-lime px-3 py-1.5 text-xs font-bold text-black hover:bg-lime/90"
          >
            <PackageOpen size={13} /> Download ZIP
          </a>
        ) : null}
      </div>
      {renders.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-xs text-zinc-500">
          No renders yet. Use “Render clip” for one canvas or “Export all” for every format.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {renders.map((render) => (
            <div key={render.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-black/15 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-white">{render.canvas}</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  {render.status}
                  {render.engine ? ` · ${render.engine}` : ""}
                  {render.duration_ms ? ` · ${(render.duration_ms / 1000).toFixed(1)}s` : ""}
                  {render.error ? ` · ${render.error}` : ""}
                </div>
              </div>
              <div className="w-24">
                <div className="h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${
                      render.status === "failed" ? "bg-red-400" : render.status === "completed" ? "bg-lime" : "bg-cyan"
                    }`}
                    style={{ width: `${Math.max(4, render.progress)}%` }}
                  />
                </div>
              </div>
              {render.status === "completed" ? (
                <a
                  href={apiUrl(`/api/renders/${render.id}/download`)}
                  className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/5"
                >
                  <Download size={12} /> MP4
                </a>
              ) : render.status === "failed" ? (
                <span className="flex items-center gap-1 text-[11px] text-red-300">
                  <AlertCircle size={12} /> Failed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Loader2 size={12} className="animate-spin" /> Working
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
