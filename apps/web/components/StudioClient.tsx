"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Captions,
  Check,
  Clock,
  Crop,
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
import { cropRoom, normalizeCrop, type CropSettings } from "@clipper/video";
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
  type OverlaySettings,
  type Render,
  type TemplateItem,
} from "@/lib/api";

type StyleTab = "video" | "canvas" | "crop" | "caption" | "font" | "brand";

const STAGES = [
  { id: "download", label: "Download" },
  { id: "audio", label: "Audio scan" },
  { id: "detect", label: "Find highlights" },
  { id: "clips", label: "Build clips" },
  { id: "ready", label: "Ready" },
];

export default function StudioClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [canvases, setCanvases] = useState<CanvasPreset[]>([]);
  const [videoTemplates, setVideoTemplates] = useState<TemplateItem[]>([]);
  const [showAllTemplates, setShowAllTemplates] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("clipper.showAllTemplates") === "1";
  });
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
  const [previewCrop, setPreviewCrop] = useState<CropSettings>({ x: 0.5, y: 0.5, zoom: 1 });
  const [overlayMode, setOverlayMode] = useState<"move" | "pan">("move");
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [redetectBusy, setRedetectBusy] = useState(false);
  const [redetectMode, setRedetectMode] = useState<"merge" | "replace">("merge");
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceReady, setFaceReady] = useState(false);
  const clipsLoaded = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const cropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Keep the crop editor in sync with the selected clip.
  useEffect(() => {
    setPreviewCrop(normalizeCrop(selectedClip?.crop));
    setFaceReady(Boolean(selectedClip?.face_track_path));
    setFaceBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClip?.id]);

  // Transcript exists? Checked once when the job opens.
  useEffect(() => {
    api(`/api/jobs/${jobId}/transcript`)
      .then(() => setHasTranscript(true))
      .catch(() => setHasTranscript(false));
  }, [jobId]);

  useEffect(() => {
    if (!transcriptBusy) return;
    const timer = setInterval(async () => {
      try {
        await api(`/api/jobs/${jobId}/transcript`);
        setHasTranscript(true);
        setTranscriptBusy(false);
        setAnalysisVersion((value) => value + 1);
        setNotice("Transcript ready — captions can be enabled now.");
        setTimeout(() => setNotice(null), 2500);
      } catch {
        // still running
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [transcriptBusy, jobId]);

  useEffect(() => {
    if (!faceBusy || !selectedClip) return;
    const clipId = selectedClip.id;
    const timer = setInterval(async () => {
      try {
        await api(`/api/clips/${clipId}/face-track`);
        setFaceReady(true);
        setFaceBusy(false);
        setAnalysisVersion((value) => value + 1);
        setNotice("Face track ready.");
        setTimeout(() => setNotice(null), 2200);
      } catch {
        // still running
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [faceBusy, selectedClip?.id]);

  useEffect(() => {
    if (!redetectBusy) return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > 150) {
        setRedetectBusy(false);
        setError("Re-detection timed out. Check the API log.");
        return;
      }
      try {
        const status = await api<{
          status: "idle" | "running" | "done" | "error";
          mode: "merge" | "replace";
          added: number;
          skipped: number;
          source?: string | null;
          error?: string;
        }>(`/api/jobs/${jobId}/redetect`);
        if (status.status === "running") return;
        setRedetectBusy(false);
        if (status.status === "idle") return;
        if (status.status === "error") {
          setError(status.error || "Re-detection failed.");
          return;
        }
        await refreshJob();
        const skipped = status.skipped ? `, ${status.skipped} skipped` : "";
        const suffix = status.source ? ` (${status.source})` : "";
        setNotice(
          `${status.added} clip${status.added === 1 ? "" : "s"} ${
            status.mode === "replace" ? "replaced" : "added"
          }${skipped}${suffix}.`,
        );
        setTimeout(() => setNotice(null), 3200);
      } catch {
        // still running
      }
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redetectBusy, jobId]);

  useEffect(() => {
    Promise.all([
      api<CanvasPreset[]>("/api/canvas-presets"),
      api<TemplateItem[]>("/api/caption-templates"),
      api<FontPreset[]>("/api/font-presets"),
    ])
      .then(([canvasData, captionData, fontData]) => {
        setCanvases(canvasData);
        setCaptionTemplates(captionData);
        setFonts(fontData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load templates."));
    api<NichePreset[]>("/api/niches").then(setNiches).catch(() => undefined);
    api<Channel[]>("/api/channels").then(setChannels).catch(() => undefined);
  }, []);

  useEffect(() => {
    const url = `/api/video-templates${showAllTemplates ? "?include_hidden=true" : ""}`;
    api<TemplateItem[]>(url)
      .then((data) => {
        setVideoTemplates(data);
      })
      .catch(() => undefined);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("clipper.showAllTemplates", showAllTemplates ? "1" : "0");
    }
  }, [showAllTemplates]);

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
        const current = selectedIdRef.current;
        if (clipData.length && (!current || !clipData.some((clip) => clip.id === current))) {
          setSelectedId(clipData[0].id);
        }
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

  function changeCrop(next: CropSettings) {
    const safe = normalizeCrop(next);
    setPreviewCrop(safe);
    if (!selectedClip) return;
    const clipId = selectedClip.id;
    setClips((current) => current.map((clip) => (clip.id === clipId ? { ...clip, crop: safe } : clip)));
    if (cropTimer.current) clearTimeout(cropTimer.current);
    cropTimer.current = setTimeout(() => {
      api<Clip>(`/api/clips/${clipId}`, {
        method: "PATCH",
        body: JSON.stringify({ crop: safe }),
      }).catch((err) => setError(err instanceof Error ? err.message : "Could not save crop."));
    }, 450);
  }

  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function changeOverlays(next: OverlaySettings[]) {
    if (!selectedClip) return;
    const clipId = selectedClip.id;
    setClips((current) => current.map((clip) => (clip.id === clipId ? { ...clip, overlays: next } : clip)));
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => {
      api<Clip>(`/api/clips/${clipId}`, {
        method: "PATCH",
        body: JSON.stringify({ overlays: next }),
      }).catch((err) => setError(err instanceof Error ? err.message : "Could not save overlays."));
    }, 300);
  }

  function handleOverlayChange(id: string, patch: Partial<OverlaySettings>) {
    if (!selectedClip) return;
    const current = selectedClip.overlays || [];
    const next = current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    changeOverlays(next);
  }

  async function generateTranscript() {
    if (!selectedClip || transcriptBusy) return;
    setTranscriptBusy(true);
    setError(null);
    try {
      await api(`/api/jobs/${jobId}/transcript`, { method: "POST" });
      setNotice("Transcribing in the background…");
    } catch (err) {
      setTranscriptBusy(false);
      setError(err instanceof Error ? err.message : "Could not start transcription.");
    }
  }

  async function generateFaceTrack() {
    if (!selectedClip || faceBusy) return;
    setFaceBusy(true);
    setError(null);
    try {
      await api(`/api/clips/${selectedClip.id}/face-track`, { method: "POST" });
    } catch (err) {
      setFaceBusy(false);
      setError(err instanceof Error ? err.message : "Could not start face tracking.");
    }
  }

  async function redetect(mode: "merge" | "replace") {
    if (!hasTranscript || redetectBusy) return;
    setRedetectMode(mode);
    setRedetectBusy(true);
    setError(null);
    setNotice(mode === "merge" ? "Adding clips from the transcript…" : "Rebuilding clips from the transcript…");
    try {
      await api(`/api/jobs/${jobId}/redetect`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
    } catch (err) {
      setRedetectBusy(false);
      setError(err instanceof Error ? err.message : "Could not re-detect clips.");
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
                    crop={previewCrop}
                    overlays={selectedClip.overlays}
                    overlayMode={overlayMode}
                    selectedOverlayId={selectedOverlayId}
                    onSelectOverlay={setSelectedOverlayId}
                    onOverlayChange={handleOverlayChange}
                    cropMode={tab === "crop"}
                    onCropChange={changeCrop}
                    analysisVersion={analysisVersion}
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
              crop={previewCrop}
              onCropChange={changeCrop}
              overlayMode={overlayMode}
              onOverlayModeChange={setOverlayMode}
              hasTranscript={hasTranscript}
              transcriptBusy={transcriptBusy}
              onGenerateTranscript={generateTranscript}
              faceBusy={faceBusy}
              faceReady={faceReady}
              onGenerateFaceTrack={generateFaceTrack}
              redetectBusy={redetectBusy}
              redetectMode={redetectMode}
              onRedetect={redetect}
              showAllTemplates={showAllTemplates}
              onToggleAllTemplates={setShowAllTemplates}
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
        Download and clip detection run locally. Transcription and face tracking stay off until you ask for them inside
        the Studio. Keep this tab open while the job is working.
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
  crop,
  onCropChange,
  overlayMode,
  onOverlayModeChange,
  hasTranscript,
  transcriptBusy,
  onGenerateTranscript,
  faceBusy,
  faceReady,
  onGenerateFaceTrack,
  redetectBusy,
  redetectMode,
  onRedetect,
  showAllTemplates,
  onToggleAllTemplates,
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
  crop: CropSettings;
  onCropChange: (crop: CropSettings) => void;
  overlayMode: "move" | "pan";
  onOverlayModeChange: (mode: "move" | "pan") => void;
  hasTranscript: boolean;
  transcriptBusy: boolean;
  onGenerateTranscript: () => void;
  faceBusy: boolean;
  faceReady: boolean;
  onGenerateFaceTrack: () => void;
  redetectBusy: boolean;
  redetectMode: "merge" | "replace";
  onRedetect: (mode: "merge" | "replace") => void;
  showAllTemplates: boolean;
  onToggleAllTemplates: (value: boolean) => void;
}) {
  const NICHE_ORDER = ["gaming", "football", "podcast", "education", "generic", "other"];
  const NICHE_LABEL: Record<string, string> = {
    gaming: "Gaming",
    football: "Football",
    podcast: "Podcast / Reaction",
    education: "Education",
    generic: "General",
    other: "Other",
  };
  const groupedVideoTemplates = useMemo(() => {
    const groups = new Map<string, TemplateItem[]>();
    for (const template of videoTemplates) {
      const key = (template.niche || "generic").toLowerCase();
      const bucket = NICHE_ORDER.includes(key) ? key : "other";
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket)!.push(template);
    }
    return NICHE_ORDER.filter((key) => groups.has(key)).map((key) => ({
      key,
      label: NICHE_LABEL[key],
      templates: groups.get(key)!,
    }));
  }, [videoTemplates]);

  const [confirmReplace, setConfirmReplace] = useState(false);
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

      <div className="mt-4 grid grid-cols-6 gap-1 rounded-xl bg-black/30 p-1">
        {[
          { id: "video" as const, label: "Video", icon: Film },
          { id: "canvas" as const, label: "Canvas", icon: Layers },
          { id: "crop" as const, label: "Crop", icon: Crop },
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
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-[10px] text-zinc-500">
              <input
                type="checkbox"
                checked={showAllTemplates}
                onChange={(event) => onToggleAllTemplates(event.target.checked)}
                className="accent-lime"
              />
              Tampilkan semua template
            </label>
            {groupedVideoTemplates.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between rounded-lg bg-panel/95 px-1 py-1 backdrop-blur">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    {group.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-zinc-600">{group.templates.length}</span>
                </div>
                <div className="space-y-1.5">
                  {group.templates.map((template) => (
                    <TemplateButton
                      key={template.id}
                      active={clip.video_template === template.id}
                      title={template.name}
                      description={template.description}
                      onClick={() => patchClip({ video_template: template.id })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
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

        {tab === "crop" ? (
          <>
            {clip.video_template === "custom_overlay" ? (
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => onOverlayModeChange?.("move")}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${
                    overlayMode === "move"
                      ? "border-lime/40 bg-lime/10 text-lime"
                      : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  Move overlay
                </button>
                <button
                  onClick={() => onOverlayModeChange?.("pan")}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${
                    overlayMode === "pan"
                      ? "border-lime/40 bg-lime/10 text-lime"
                      : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  Pan crop
                </button>
                <span className="text-[10px] text-zinc-500">
                  {overlayMode === "move" ? "Drag a box to move it" : "Drag inside a box to pan its crop"}
                </span>
              </div>
            ) : null}
            <CropPanel
              crop={crop}
              onChange={onCropChange}
              faceBusy={faceBusy}
              faceReady={faceReady}
              onGenerateFaceTrack={onGenerateFaceTrack}
            />
            {clip.video_template === "custom_overlay" ? (
              <div className="mt-3">
                <OverlaysEditor overlays={clip.overlays || []} onChange={(next) => patchClip({ overlays: next })} />
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "caption" ? (
          <>
            {!hasTranscript ? (
              <div className="mb-2 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
                <div className="text-xs font-medium text-amber-200">No transcript yet</div>
                <p className="mt-1 text-[10px] leading-relaxed text-amber-200/70">
                  Captions stay empty until a transcript exists. Transcription is opt-in and runs locally.
                </p>
                <button
                  onClick={onGenerateTranscript}
                  disabled={transcriptBusy}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] font-semibold text-amber-100 hover:bg-amber-300/15 disabled:opacity-50"
                >
                  {transcriptBusy ? <Loader2 size={12} className="animate-spin" /> : <Captions size={12} />}
                  {transcriptBusy ? "Transcribing…" : "Generate transcript"}
                </button>
              </div>
            ) : null}
            <div className="mb-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <Wand2 size={13} className="text-lime" />
                Re-detect from transcript
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                Uses the transcript above. <span className="text-zinc-300">Add</span> keeps existing clips and their
                crop/badge edits; <span className="text-zinc-300">Replace</span> rebuilds the whole list.
              </p>
              {!hasTranscript ? (
                <p className="mt-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 text-[10px] text-zinc-500">
                  Generate a transcript first.
                </p>
              ) : confirmReplace ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setConfirmReplace(false);
                      onRedetect("replace");
                    }}
                    disabled={redetectBusy}
                    className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-[11px] font-semibold text-red-200 hover:bg-red-400/15 disabled:opacity-50"
                  >
                    Yes, replace all
                  </button>
                  <button
                    onClick={() => setConfirmReplace(false)}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onRedetect("merge")}
                    disabled={redetectBusy || transcriptBusy}
                    className="flex items-center justify-center gap-2 rounded-lg border border-lime/25 bg-lime/10 px-3 py-2 text-[11px] font-semibold text-lime hover:bg-lime/15 disabled:opacity-50"
                  >
                    {redetectBusy && redetectMode === "merge" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Wand2 size={12} />
                    )}
                    {redetectBusy && redetectMode === "merge" ? "Re-detecting…" : "Add clips"}
                  </button>
                  <button
                    onClick={() => setConfirmReplace(true)}
                    disabled={redetectBusy || transcriptBusy}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    Replace all
                  </button>
                </div>
              )}
            </div>
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
 * Manual crop: pan/zoom the cover-fitted frame. Transcript and face tracking
 * are deliberately not part of the build; face tracking is offered here as an
 * optional extra for layouts that need a moving focus point.
 */
function CropPanel({
  crop,
  onChange,
  faceBusy,
  faceReady,
  onGenerateFaceTrack,
}: {
  crop: CropSettings;
  onChange: (crop: CropSettings) => void;
  faceBusy: boolean;
  faceReady: boolean;
  onGenerateFaceTrack: () => void;
}) {
  const room = cropRoom(crop.zoom);
  const min = 0.5 - room;
  const max = 0.5 + room;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-white">Zoom</span>
          <span className="tabular-nums text-zinc-400">{Math.round(crop.zoom * 100)}%</span>
        </div>
        <input
          type="range"
          min={100}
          max={300}
          step={5}
          value={Math.round(crop.zoom * 100)}
          onChange={(event) => {
            const zoom = Number(event.target.value) / 100;
            onChange(normalizeCrop({ ...crop, zoom }));
          }}
          className="mt-2 w-full accent-lime"
        />
        <p className="mt-1 text-[10px] text-zinc-600">100% is the plain center crop.</p>
      </div>

      {(
        [
          { key: "x" as const, label: "Horizontal" },
          { key: "y" as const, label: "Vertical" },
        ]
      ).map((axis) => (
        <div key={axis.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-white">{axis.label}</span>
            <span className="tabular-nums text-zinc-400">{Math.round(crop[axis.key] * 100)}%</span>
          </div>
          <input
            type="range"
            min={Math.round(min * 100)}
            max={Math.round(max * 100)}
            step={1}
            value={Math.round(crop[axis.key] * 100)}
            disabled={room <= 0.001}
            onChange={(event) => onChange(normalizeCrop({ ...crop, [axis.key]: Number(event.target.value) / 100 }))}
            className="mt-2 w-full accent-lime disabled:opacity-40"
          />
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onChange({ x: 0.5, y: 0.5, zoom: 1 })}
          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-white/5"
        >
          Reset crop
        </button>
        <button
          onClick={() => onChange({ ...crop, x: 0.5, y: 0.5 })}
          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-white/5"
        >
          Center
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-white">
          <ScanFace size={13} className="text-lime" /> Face tracking (optional)
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
          Not part of the build. Run it only when a layout&apos;s face bubble or PiP should follow a face; otherwise the
          crop point is used.
        </p>
        <button
          onClick={onGenerateFaceTrack}
          disabled={faceBusy}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-panel2 px-3 py-2 text-[11px] font-medium text-zinc-200 hover:bg-white/5 disabled:opacity-50"
        >
          {faceBusy ? <Loader2 size={12} className="animate-spin" /> : <ScanFace size={12} />}
          {faceBusy ? "Tracking…" : faceReady ? "Re-run face track" : "Auto-detect face"}
        </button>
      </div>

      <p className="text-center text-[10px] text-zinc-600">
        Drag inside the preview to pan while this tab is open.
      </p>
    </div>
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

function OverlaysEditor({
  overlays,
  onChange,
}: {
  overlays: OverlaySettings[];
  onChange: (next: OverlaySettings[]) => void;
}) {
  const list = overlays || [];

  function update(id: string, patch: Partial<OverlaySettings>) {
    onChange(list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function add() {
    onChange([
      ...list,
      {
        id: (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ov_${Date.now()}`),
        shape: "circle",
        x: 0.5,
        y: 0.5,
        size: 0.26,
        crop: { x: 0.5, y: 0.5, zoom: 1 },
      },
    ]);
  }

  function remove(id: string) {
    onChange(list.filter((item) => item.id !== id));
  }

  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white">Overlays (facecam boxes)</span>
        <button
          onClick={add}
          className="rounded-lg border border-lime/25 bg-lime/10 px-2.5 py-1 text-[10px] font-semibold text-lime hover:bg-lime/15"
        >
          + Add
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-[10px] text-zinc-500">No overlays yet. Click Add.</p>
      ) : null}
      {list.map((overlay, index) => (
        <div key={overlay.id || index} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Overlay {index + 1}</span>
            <button
              onClick={() => overlay.id && remove(overlay.id)}
              className="text-[10px] text-red-300 hover:text-red-200"
            >
              Remove
            </button>
          </div>
          <label className="block text-[10px] text-zinc-500">
            Shape
            <select
              value={overlay.shape}
              onChange={(event) =>
                overlay.id && update(overlay.id, { shape: event.target.value as OverlaySettings["shape"] })
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-panel2 px-2 py-1.5 text-xs text-white"
            >
              <option value="circle">Circle</option>
              <option value="rounded">Rounded</option>
              <option value="square">Square</option>
            </select>
          </label>
          <label className="block text-[10px] text-zinc-500">
            Source URL (optional, different video)
            <input
              type="text"
              value={overlay.source_url || ""}
              onChange={(event) =>
                overlay.id && update(overlay.id, { source_url: event.target.value || null })
              }
              placeholder="https://... or leave empty for main video"
              className="mt-1 w-full rounded-lg border border-white/10 bg-panel2 px-2 py-1.5 text-xs text-white"
            />
          </label>
          {(
            [
              { key: "size", label: "Size", min: 5, max: 80, step: 1, value: Math.round(overlay.size * 100) },
              { key: "x", label: "Position X", min: 0, max: 100, step: 1, value: Math.round(overlay.x * 100) },
              { key: "y", label: "Position Y", min: 0, max: 100, step: 1, value: Math.round(overlay.y * 100) },
            ] as const
          ).map((field) => (
            <label key={field.key} className="block text-[10px] text-zinc-500">
              {field.label}: {field.value}%
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={field.value}
                onChange={(event) => {
                  if (!overlay.id) return;
                  const next = Number(event.target.value) / 100;
                  update(overlay.id, { [field.key]: next } as Partial<OverlaySettings>);
                }}
                className="mt-1 w-full accent-lime"
              />
            </label>
          ))}
          <div className="rounded-lg border border-white/5 bg-black/30 p-2">
            <div className="mb-1 text-[10px] font-medium text-zinc-400">Crop</div>
            {(
              [
                { key: "x", label: "X", min: 0, max: 100, value: Math.round(overlay.crop.x * 100) },
                { key: "y", label: "Y", min: 0, max: 100, value: Math.round(overlay.crop.y * 100) },
                { key: "zoom", label: "Zoom", min: 100, max: 400, value: Math.round(overlay.crop.zoom * 100) },
              ] as const
            ).map((field) => (
              <label key={field.key} className="block text-[10px] text-zinc-500">
                {field.label}: {field.value}{field.key === "zoom" ? "%" : "%"}
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={1}
                  value={field.value}
                  onChange={(event) => {
                    if (!overlay.id) return;
                    const next =
                      field.key === "zoom"
                        ? Number(event.target.value) / 100
                        : Number(event.target.value) / 100;
                    update(overlay.id, {
                      crop: { ...overlay.crop, [field.key]: next },
                    });
                  }}
                  className="mt-1 w-full accent-lime"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
