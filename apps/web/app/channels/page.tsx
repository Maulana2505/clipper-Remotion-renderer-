"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Plus, Save, Trash2, Tv } from "lucide-react";
import {
  api,
  type Channel,
  type FontPreset,
  type NichePreset,
  type TemplateItem,
} from "@/lib/api";

type Draft = {
  id?: string;
  name: string;
  niche: string;
  accent: string;
  video_template: string;
  caption_template: string;
  font_preset: string;
  caption_enabled: boolean;
  language: string;
  notes: string;
};

const EMPTY: Draft = {
  name: "",
  niche: "gaming",
  accent: "#CCFF00",
  video_template: "gaming_hud",
  caption_template: "accent_highlight",
  font_preset: "anton",
  caption_enabled: true,
  language: "",
  notes: "",
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [niches, setNiches] = useState<NichePreset[]>([]);
  const [videos, setVideos] = useState<TemplateItem[]>([]);
  const [captions, setCaptions] = useState<TemplateItem[]>([]);
  const [fonts, setFonts] = useState<FontPreset[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = () => {
    api<Channel[]>("/api/channels").then(setChannels).catch(() => undefined);
  };

  useEffect(() => {
    load();
    api<NichePreset[]>("/api/niches").then(setNiches).catch(() => undefined);
    api<TemplateItem[]>("/api/video-templates").then(setVideos).catch(() => undefined);
    api<TemplateItem[]>("/api/caption-templates").then(setCaptions).catch(() => undefined);
    api<FontPreset[]>("/api/font-presets").then(setFonts).catch(() => undefined);
  }, []);

  const nicheMap = useMemo(() => new Map(niches.map((item) => [item.id, item])), [niches]);

  function startCreate() {
    const preset = nicheMap.get("gaming");
    setDraft({
      ...EMPTY,
      ...(preset
        ? {
            niche: preset.id,
            accent: preset.accent,
            video_template: preset.video_template,
            caption_template: preset.caption_template,
            font_preset: preset.font_preset,
          }
        : {}),
    });
    setError(null);
  }

  function startEdit(channel: Channel) {
    setDraft({
      id: channel.id,
      name: channel.name,
      niche: channel.niche,
      accent: channel.accent,
      video_template: channel.video_template,
      caption_template: channel.caption_template,
      font_preset: channel.font_preset,
      caption_enabled: channel.caption_enabled,
      language: channel.language || "",
      notes: channel.notes || "",
    });
    setError(null);
  }

  function applyNiche(nicheId: string) {
    const preset = nicheMap.get(nicheId);
    setDraft((current) =>
      current
        ? {
            ...current,
            niche: nicheId,
            ...(preset
              ? {
                  accent: preset.accent,
                  video_template: preset.video_template,
                  caption_template: preset.caption_template,
                  font_preset: preset.font_preset,
                }
              : {}),
          }
        : current,
    );
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Channel name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name: draft.name.trim(),
        niche: draft.niche,
        accent: draft.accent,
        video_template: draft.video_template,
        caption_template: draft.caption_template,
        font_preset: draft.font_preset,
        caption_enabled: draft.caption_enabled,
        language: draft.language.trim() || null,
        notes: draft.notes.trim() || null,
      });
      if (draft.id) {
        await api<Channel>(`/api/channels/${draft.id}`, { method: "PATCH", body });
        setSaved(`Updated ${draft.name.trim()}`);
      } else {
        await api<Channel>("/api/channels", { method: "POST", body });
        setSaved(`Created ${draft.name.trim()}`);
      }
      setDraft(null);
      load();
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save channel.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(channel: Channel) {
    if (!window.confirm(`Delete "${channel.name}"? Jobs stay, but lose the channel link.`)) return;
    try {
      await api(`/api/channels/${channel.id}`, { method: "DELETE" });
      if (draft?.id === channel.id) setDraft(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete channel.");
    }
  }

  return (
    <div className="space-y-8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Channels</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            A channel stores the look of a niche once — layout, captions, font, accent and language. Every new import
            inherits it, and each clip can still be overridden in the studio.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-black hover:bg-lime/90"
        >
          <Plus size={16} /> New channel
        </button>
      </div>

      {saved ? (
        <div className="flex items-center gap-2 rounded-xl border border-lime/25 bg-lime/10 px-3 py-2.5 text-xs text-lime">
          <Check size={14} /> {saved}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs text-red-300">
          <AlertCircle size={14} /> {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-3">
          {channels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-panel/40 px-6 py-12 text-center">
              <Tv size={22} className="mx-auto text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-400">No channels yet. Create one per niche you post to.</p>
            </div>
          ) : (
            channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-panel/70 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: channel.accent }}
                    />
                    <h3 className="truncate text-sm font-semibold text-white">{channel.name}</h3>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                      {channel.niche}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                    {channel.video_template} · {channel.caption_template} · {channel.font_preset}
                    {channel.language ? ` · ${channel.language}` : ""}
                  </p>
                  {channel.notes ? (
                    <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-500">{channel.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => startEdit(channel)}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-white/25 hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(channel)}
                    className="rounded-lg border border-white/10 px-2 py-1.5 text-zinc-500 hover:border-red-400/40 hover:text-red-300"
                    aria-label={`Delete ${channel.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {draft ? (
          <div className="h-fit rounded-2xl border border-white/10 bg-panel/70 p-4">
            <h2 className="text-sm font-semibold text-white">{draft.id ? "Edit channel" : "New channel"}</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Football ID"
                  className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Niche</span>
                <select
                  value={draft.niche}
                  onChange={(event) => applyNiche(event.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus:border-lime/40"
                >
                  {niches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Accent</span>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2">
                    <input
                      type="color"
                      value={draft.accent}
                      onChange={(event) => setDraft({ ...draft, accent: event.target.value })}
                      className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <input
                      value={draft.accent}
                      onChange={(event) => setDraft({ ...draft, accent: event.target.value })}
                      className="h-10 w-full bg-transparent text-xs text-white focus:outline-none"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Language</span>
                  <input
                    value={draft.language}
                    onChange={(event) => setDraft({ ...draft, language: event.target.value })}
                    placeholder="id"
                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Video layout</span>
                <select
                  value={draft.video_template}
                  onChange={(event) => setDraft({ ...draft, video_template: event.target.value })}
                  className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus:border-lime/40"
                >
                  {videos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Caption style</span>
                <select
                  value={draft.caption_template}
                  onChange={(event) => setDraft({ ...draft, caption_template: event.target.value })}
                  className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus:border-lime/40"
                >
                  {captions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Font</span>
                  <select
                    value={draft.font_preset}
                    onChange={(event) => setDraft({ ...draft, font_preset: event.target.value })}
                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus:border-lime/40"
                  >
                    {fonts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={draft.caption_enabled}
                    onChange={(event) => setDraft({ ...draft, caption_enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-white/20 bg-black/30 accent-lime"
                  />
                  <span className="text-xs text-zinc-300">Captions on</span>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  rows={3}
                  placeholder="Hook style, do/don't, tone…"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-lime/40"
                />
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl bg-lime px-4 py-2 text-sm font-bold text-black hover:bg-lime/90 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {draft.id ? "Save changes" : "Create channel"}
                </button>
                <button
                  onClick={() => setDraft(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:border-white/25"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-fit rounded-2xl border border-white/10 bg-panel/40 p-4 text-xs leading-relaxed text-zinc-500">
            <p className="font-semibold text-zinc-300">How presets apply</p>
            <p className="mt-2">
              Niche defaults come first, the channel overrides them, and clip-level edits always win. Badges like
              CLUTCH or GOL are generated by the LLM and stay editable per clip.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
