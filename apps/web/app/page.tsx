"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Captions,
  CheckCircle2,
  Clock,
  Film,
  Link2,
  Loader2,
  ScanFace,
  Scissors,
  Timer,
  UploadCloud,
  Zap,
} from "lucide-react";
import {
  api,
  formatDate,
  formatTimecode,
  parseTimecode,
  type Channel,
  type ClipMeta,
  type Job,
  type NichePreset,
  type StorageOverview,
} from "@/lib/api";

const LONG_VIDEO_SECONDS = 30 * 60;

export default function ImportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [storage, setStorage] = useState<StorageOverview | null>(null);
  const [niches, setNiches] = useState<NichePreset[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [niche, setNiche] = useState("generic");
  const [channelId, setChannelId] = useState("");
  const [probing, setProbing] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [teams, setTeams] = useState({ home: "", away: "" });
  const [score, setScore] = useState({ home: "", away: "" });
  const [minute, setMinute] = useState("");
  const [competition, setCompetition] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Job[]>("/api/jobs")
      .then(setJobs)
      .catch(() => undefined)
      .finally(() => setJobsLoading(false));
    api<StorageOverview>("/api/storage").then(setStorage).catch(() => undefined);
    api<NichePreset[]>("/api/niches").then(setNiches).catch(() => undefined);
    api<Channel[]>("/api/channels").then(setChannels).catch(() => undefined);
  }, []);

  const activeChannel = channels.find((channel) => channel.id === channelId) || null;
  const activeNiche = activeChannel?.niche || niche;
  const activeNichePreset = niches.find((item) => item.id === activeNiche) || null;

  // Long VODs are unusable end-to-end on a laptop, so the form offers a range
  // automatically once the duration is known.
  useEffect(() => {
    if (tab !== "url" || !/^https?:\/\//i.test(url.trim())) {
      setVideoDuration(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setProbing(true);
      api<{ duration: number; long: boolean }>(`/api/jobs/probe?url=${encodeURIComponent(url.trim())}`)
        .then((data) => {
          if (controller.signal.aborted) return;
          setVideoDuration(data.duration || null);
          if (data.long) setRangeOpen(true);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setProbing(false);
        });
    }, 900);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, tab]);

  const range = useMemo(() => {
    if (!rangeOpen) return { start: null as number | null, end: null as number | null, invalid: false };
    const start = parseTimecode(rangeStart);
    const end = parseTimecode(rangeEnd);
    if (rangeStart.trim() && start === null) return { start: null, end: null, invalid: true };
    if (rangeEnd.trim() && end === null) return { start: null, end: null, invalid: true };
    if (start !== null && end !== null && end <= start) return { start, end, invalid: true };
    return { start, end, invalid: false };
  }, [rangeOpen, rangeStart, rangeEnd]);

  function buildMeta(): ClipMeta | undefined {
    if (activeNiche !== "football") return undefined;
    const meta: ClipMeta = {};
    if (teams.home.trim() || teams.away.trim()) {
      meta.teams = { home: teams.home.trim() || "HOME", away: teams.away.trim() || "AWAY" };
    }
    if (score.home.trim() || score.away.trim()) {
      meta.score = { home: Number(score.home) || 0, away: Number(score.away) || 0 };
    }
    if (minute.trim()) meta.minute = minute.trim();
    if (competition.trim()) meta.competition = competition.trim();
    return Object.keys(meta).length ? meta : undefined;
  }

  async function createUrlJob() {
    if (!url.trim()) {
      setError("Paste a YouTube, TikTok, or Twitch URL first.");
      return;
    }
    if (range.invalid) {
      setError("Import range is invalid. Use mm:ss and end after start.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ job_id: string }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          source_type: "url",
          url: url.trim(),
          niche: activeChannel ? null : niche,
          channel_id: activeChannel?.id || null,
          source_start: range.start,
          source_end: range.end,
          meta: buildMeta(),
        }),
      });
      router.push(`/studio/${result.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create job.");
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (!file) return;
    if (range.invalid) {
      setError("Import range is invalid. Use mm:ss and end after start.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (activeChannel) form.append("channel_id", activeChannel.id);
      else form.append("niche", niche);
      if (range.start !== null) form.append("source_start", String(range.start));
      if (range.end !== null) form.append("source_end", String(range.end));
      const meta = buildMeta();
      if (meta) form.append("meta", JSON.stringify(meta));
      const result = await api<{ job_id: string }>("/api/jobs/upload", {
        method: "POST",
        body: form,
      });
      router.push(`/studio/${result.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
    }
  }

  const showRange = rangeOpen || (videoDuration !== null && videoDuration > LONG_VIDEO_SECONDS && activeNiche !== "gaming");

  return (
    <div className="space-y-14">
      <section className="relative pt-6 sm:pt-12">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-lime/25 bg-lime/10 px-3 py-1.5 text-xs font-medium text-lime">
            <Zap size={13} />
            Local engine · no cloud rendering
          </div>
          <h1 className="text-balance text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl">
            Long video in.
            <br />
            <span className="glow-text text-lime">Viral clips out.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-sm leading-relaxed text-zinc-400 sm:text-base">
            Paste a link or upload a file. Clipper finds the hooks, tracks the speaker, burns captions, and renders
            platform-ready clips on your own machine.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <div className="glass overflow-hidden rounded-3xl p-2 shadow-2xl">
            <div className="flex gap-1 rounded-2xl bg-black/30 p-1">
              <button
                onClick={() => setTab("url")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  tab === "url" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Link2 size={15} />
                Paste URL
              </button>
              <button
                onClick={() => setTab("upload")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  tab === "upload" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <UploadCloud size={15} />
                Upload video
              </button>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
              {tab === "url" ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Link2 size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") createUrlJob();
                      }}
                      placeholder="https://youtube.com/watch?v=..."
                      className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                    />
                  </div>
                  <button
                    onClick={createUrlJob}
                    disabled={busy}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-lime px-6 text-sm font-bold text-black transition hover:bg-lime/90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
                    Find clips
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) uploadFile(file);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition ${
                    dragOver ? "border-lime bg-lime/10" : "border-white/15 bg-black/20 hover:border-white/30"
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadFile(file);
                    }}
                  />
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-lime">
                    {busy ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
                  </span>
                  <span className="mt-3 text-sm font-medium text-white">Drop a video here or click to browse</span>
                  <span className="mt-1 text-xs text-zinc-500">MP4, MOV, MKV, WEBM · long videos welcome</span>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Channel
                  </span>
                  <select
                    value={channelId}
                    onChange={(event) => setChannelId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus:border-lime/40"
                  >
                    <option value="">No channel (use niche default)</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Niche
                  </span>
                  <select
                    value={activeNiche}
                    onChange={(event) => {
                      setNiche(event.target.value);
                      setChannelId("");
                    }}
                    disabled={Boolean(activeChannel)}
                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus:border-lime/40 disabled:opacity-50"
                  >
                    {niches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {activeNiche === "football" ? (
                <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-orange-300">
                    <Film size={12} /> Scoreboard data
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={teams.home}
                      onChange={(event) => setTeams((prev) => ({ ...prev, home: event.target.value }))}
                      placeholder="Home team"
                      className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                    />
                    <input
                      value={teams.away}
                      onChange={(event) => setTeams((prev) => ({ ...prev, away: event.target.value }))}
                      placeholder="Away team"
                      className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input
                      value={score.home}
                      onChange={(event) => setScore((prev) => ({ ...prev, home: event.target.value.replace(/\D/g, "") }))}
                      inputMode="numeric"
                      placeholder="0"
                      className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                    />
                    <input
                      value={score.away}
                      onChange={(event) => setScore((prev) => ({ ...prev, away: event.target.value.replace(/\D/g, "") }))}
                      inputMode="numeric"
                      placeholder="0"
                      className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                    />
                    <input
                      value={minute}
                      onChange={(event) => setMinute(event.target.value)}
                      placeholder="78'"
                      className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                    />
                    <input
                      value={competition}
                      onChange={(event) => setCompetition(event.target.value)}
                      placeholder="Liga 1"
                      className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <button
                  onClick={() => setRangeOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                    <Timer size={13} className="text-lime" />
                    Import a range
                    {probing ? <Loader2 size={12} className="animate-spin text-zinc-500" /> : null}
                    {videoDuration ? (
                      <span className="text-zinc-500">· source {formatTimecode(videoDuration)}</span>
                    ) : null}
                  </span>
                  <span className="text-[11px] text-zinc-500">{showRange ? "Hide" : "Optional"}</span>
                </button>
                {showRange ? (
                  <div className="mt-3 space-y-2">
                    {videoDuration !== null && videoDuration > LONG_VIDEO_SECONDS ? (
                      <p className="text-[11px] leading-relaxed text-amber-300/90">
                        This video is {formatTimecode(videoDuration)} long.{" "}
                        {activeNiche === "gaming"
                          ? "Gaming processes the full video by default; set a window only if you want a shorter import."
                          : "Pick a window so the download and transcription stay manageable."}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={rangeStart}
                        onChange={(event) => setRangeStart(event.target.value)}
                        placeholder="Start 00:00"
                        className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                      />
                      <input
                        value={rangeEnd}
                        onChange={(event) => setRangeEnd(event.target.value)}
                        placeholder="End 10:00"
                        className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {activeNichePreset ? (
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {activeNichePreset.name} preset · {activeNichePreset.clip_focus}
                </p>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs text-red-300">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              ) : null}
              {storage?.warning ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-300">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  Disk space is low. Clean up old jobs from the Storage page before starting a new import.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Scissors, title: "Hook detection", text: "Transcript-aware clip picking with LLM or local heuristic." },
          { icon: ScanFace, title: "Smart re-frame", text: "Face tracking keeps the speaker in frame across canvases." },
          { icon: Captions, title: "Caption styles", text: "Glow, box, karaoke, typewriter, and more." },
          { icon: Film, title: "Niche layouts", text: "Gaming HUD, football scoreboard, duo split, lower third." },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-white/10 bg-panel/70 p-4">
            <item.icon size={18} className="text-lime" />
            <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.text}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Recent projects</h2>
            <p className="mt-1 text-xs text-zinc-500">Jobs rendered on this machine.</p>
          </div>
          <Link href="/storage" className="flex items-center gap-1 text-xs font-medium text-lime hover:underline">
            Manage storage <ArrowRight size={13} />
          </Link>
        </div>

        {jobsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-panel/70 p-4">
                <div className="shimmer h-4 w-2/3 rounded" />
                <div className="shimmer mt-3 h-3 w-1/3 rounded" />
                <div className="shimmer mt-6 h-1 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-panel/40 px-6 py-12 text-center">
            <Scissors size={22} className="mx-auto text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">No jobs yet. Paste a link or upload a video to start.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/studio/${job.id}`}
                className="group rounded-2xl border border-white/10 bg-panel/70 p-4 transition hover:border-lime/30 hover:bg-panel2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-white group-hover:text-lime">
                      {job.title || "Untitled job"}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <Clock size={11} />
                      {formatDate(job.created_at)}
                    </p>
                  </div>
                  <StatusPill status={job.status} />
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    {job.clip_count || 0} clip{(job.clip_count || 0) === 1 ? "" : "s"}
                    {job.niche && job.niche !== "generic" ? ` · ${job.niche}` : ""}
                  </span>
                  <span>{job.stage}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${job.status === "failed" ? "bg-red-400" : "bg-lime"}`}
                    style={{ width: `${Math.max(3, job.progress)}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-lime/25 bg-lime/10 px-2 py-1 text-[10px] font-medium text-lime">
        <CheckCircle2 size={11} /> Ready
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-400/25 bg-red-400/10 px-2 py-1 text-[10px] font-medium text-red-300">
        <AlertCircle size={11} /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-zinc-300">
      <Loader2 size={11} className="animate-spin" /> Working
    </span>
  );
}
