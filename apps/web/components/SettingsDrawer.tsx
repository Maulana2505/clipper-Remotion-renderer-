"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Trash2, X } from "lucide-react";
import { api, type LlmSettings, type WhisperSettings } from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
};

const PROVIDERS = [
  { id: "openai", name: "OpenAI", model: "gpt-4o-mini", base: "https://api.openai.com/v1" },
  { id: "gemini", name: "Gemini", model: "gemini-1.5-flash", base: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "deepseek", name: "DeepSeek", model: "deepseek-chat", base: "https://api.deepseek.com/v1" },
  { id: "custom", name: "Custom (OpenAI-compatible)", model: "gpt-4o-mini", base: "" },
];

export default function SettingsDrawer({ open, onClose }: Props) {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [maxClips, setMaxClips] = useState(20);
  const [whisperModel, setWhisperModel] = useState("small");
  const [whisperBusy, setWhisperBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    api<LlmSettings>("/api/settings/llm")
      .then((data) => {
        setSettings(data);
        setProvider(data.provider || "openai");
        setModel(data.model || "gpt-4o-mini");
        setBaseUrl(data.base_url || "");
        setTemperature(data.temperature ?? 0.3);
        setMaxClips(data.max_clips ?? 20);
        setApiKey("");
      })
      .catch((error) => setMessage({ kind: "error", text: error.message }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api<WhisperSettings>("/api/settings/whisper")
      .then((data) => setWhisperModel(data.model || "small"))
      .catch(() => {});
  }, [open]);

  function selectProvider(id: string) {
    setProvider(id);
    const preset = PROVIDERS.find((item) => item.id === id);
    if (preset) {
      setModel(preset.model);
      setBaseUrl(preset.base);
    }
  }

  async function testConnection() {
    if (!apiKey.trim()) {
      setMessage({ kind: "error", text: "Enter an API key first. Saved keys are never sent back to the browser." });
      return;
    }
    setTesting(true);
    setMessage(null);
    try {
      await api("/api/settings/llm/test", {
        method: "POST",
        body: JSON.stringify({ provider, model, api_key: apiKey.trim(), base_url: baseUrl || null }),
      });
      setMessage({ kind: "ok", text: "Connection OK. The provider responded." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Test failed." });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await api<LlmSettings>("/api/settings/llm", {
        method: "PUT",
        body: JSON.stringify({
          provider,
          model,
          api_key: apiKey.trim() ? apiKey.trim() : undefined,
          base_url: baseUrl || null,
          temperature,
          max_clips: maxClips,
        }),
      });
      setSettings(data);
      setApiKey("");
      setMessage({ kind: "ok", text: "LLM settings saved." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  }

  async function saveWhisper() {
    setWhisperBusy(true);
    setMessage(null);
    try {
      const data = await api<WhisperSettings>("/api/settings/whisper", {
        method: "PUT",
        body: JSON.stringify({ model: whisperModel }),
      });
      setWhisperModel(data.model);
      setMessage({ kind: "ok", text: "Whisper model saved." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Save failed." });
    } finally {
      setWhisperBusy(false);
    }
  }

  async function clearKey() {
    setBusy(true);
    try {
      const data = await api<LlmSettings>("/api/settings/llm", { method: "DELETE" });
      setSettings(data);
      setApiKey("");
      setMessage({ kind: "ok", text: "API key cleared." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not clear key." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close settings" />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0c0c0f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <KeyRound size={16} className="text-lime" />
              LLM Settings
            </div>
            <p className="mt-1 text-xs text-zinc-500">Stored encrypted on this machine. The key never returns to the browser.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="rounded-xl border border-white/10 bg-panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Status</span>
              <span className={settings?.configured ? "text-xs font-semibold text-lime" : "text-xs font-semibold text-amber-400"}>
                {settings?.configured ? `Configured · ${settings.api_key_masked}` : "Not configured"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Without a key, Clipper uses a local heuristic to pick clips. Add a key for smarter hooks, titles, and hashtags.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">Provider</span>
            <select
              value={provider}
              onChange={(event) => selectProvider(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-sm text-white"
            >
              {PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">Model name</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings?.configured ? "Leave blank to keep the saved key" : "sk-..."}
              className="w-full rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">Base URL (optional)</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">Temperature</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
                className="w-full rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">Max clips</span>
              <input
                type="number"
                min={1}
                max={50}
                value={maxClips}
                onChange={(event) => setMaxClips(Number(event.target.value))}
                className="w-full rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-sm text-white"
              />
            </label>
          </div>

          <div className="rounded-xl border border-white/10 bg-panel p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">Transcription model (Whisper)</div>
            <p className="mb-3 text-xs leading-relaxed text-zinc-500">
              Smaller = faster but less accurate. Applied to new transcription jobs.
            </p>
            <div className="flex gap-2">
              <select
                value={whisperModel}
                onChange={(event) => setWhisperModel(event.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-[#0c0c0f] px-3 py-2.5 text-sm text-white"
              >
                <option value="tiny">tiny — fastest, lowest quality</option>
                <option value="base">base — fast, OK for clean audio</option>
                <option value="small">small — balanced (recommended)</option>
                <option value="medium">medium — slower, more accurate</option>
                <option value="large-v3">large-v3 — slowest, best (needs RAM)</option>
              </select>
              <button
                onClick={saveWhisper}
                disabled={whisperBusy}
                className="flex items-center justify-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-sm font-semibold text-black hover:bg-lime/90 disabled:opacity-50"
              >
                {whisperBusy ? <Loader2 size={15} className="animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>

          {message ? (
            <div
              className={`rounded-xl border px-3 py-2.5 text-xs ${
                message.kind === "ok"
                  ? "border-lime/30 bg-lime/10 text-lime"
                  : "border-red-400/30 bg-red-400/10 text-red-300"
              }`}
            >
              {message.text}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-white/10 px-5 py-4">
          <div className="flex gap-2">
            <button
              onClick={testConnection}
              disabled={testing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-sm font-medium text-zinc-200 hover:bg-white/5 disabled:opacity-50"
            >
              {testing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Test connection
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-lime px-3 py-2.5 text-sm font-semibold text-black hover:bg-lime/90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              Save
            </button>
          </div>
          <button
            onClick={clearKey}
            disabled={busy || !settings?.configured}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 px-3 py-2 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-40"
          >
            <Trash2 size={13} />
            Clear saved key
          </button>
        </div>
      </aside>
    </div>
  );
}
