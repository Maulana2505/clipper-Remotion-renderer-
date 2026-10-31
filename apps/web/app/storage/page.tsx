"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, HardDrive, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { api, formatDate, type StorageOverview } from "@/lib/api";

export default function StoragePage() {
  const [data, setData] = useState<StorageOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const overview = await api<StorageOverview>("/api/storage");
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load storage.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function deleteJob(id: string) {
    if (!confirm("Delete this job and all of its generated clips and renders?")) return;
    setBusy(id);
    try {
      await api(`/api/storage/jobs/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRender(id: string) {
    setBusy(id);
    try {
      await api(`/api/storage/renders/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-panel text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">Storage</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Nothing is deleted automatically. Clean up whenever you want.</p>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-300">
          <AlertCircle size={15} /> {error}
        </div>
      ) : null}

      {!data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-lime" />
        </div>
      ) : (
        <>
          {data.reminder ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Storage reminder</div>
                <div className="mt-0.5 text-amber-200/70">
                  Files are getting old ({data.oldest_days} days) or the data folder is using a lot of space. Delete jobs
                  you no longer need.
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Disk total" value={data.disk_total_label} />
            <Stat label="Disk free" value={data.disk_free_label} danger={data.warning} />
            <Stat label="Clipper data" value={data.data_size_label} />
          </div>

          <section className="rounded-2xl border border-white/10 bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive size={15} className="text-lime" />
                <h2 className="text-sm font-bold text-white">Jobs</h2>
              </div>
              <span className="text-[11px] text-zinc-500">{data.jobs.length} total</span>
            </div>
            {data.jobs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-zinc-500">
                No jobs on disk.
              </p>
            ) : (
              <div className="space-y-2">
                {data.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-black/15 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <Link href={`/studio/${job.id}`} className="truncate text-xs font-medium text-white hover:text-lime">
                        {job.title || job.id}
                      </Link>
                      <div className="mt-0.5 text-[10px] text-zinc-500">
                        {job.status} · {formatDate(job.created_at)} · {job.size_label}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteJob(job.id)}
                      disabled={busy === job.id}
                      className="flex items-center gap-1 rounded-lg border border-red-400/20 px-2.5 py-1.5 text-[11px] text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                    >
                      {busy === job.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete job
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Render files</h2>
              <span className="text-[11px] text-zinc-500">{data.renders.length} files</span>
            </div>
            {data.renders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-zinc-500">
                No render files yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.renders.map((render) => (
                  <div
                    key={render.id}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/15 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">{render.canvas}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-500">
                        {render.clip_id.slice(0, 8)} · {render.size_label} · {formatDate(render.created_at)}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteRender(render.id)}
                      disabled={busy === render.id}
                      className="flex items-center gap-1 rounded-lg border border-red-400/20 px-2.5 py-1.5 text-[11px] text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                    >
                      {busy === render.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${danger ? "border-red-400/25 bg-red-400/5" : "border-white/10 bg-panel"}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${danger ? "text-red-300" : "text-white"}`}>{value}</div>
    </div>
  );
}
