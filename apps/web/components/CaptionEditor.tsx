"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildLines, type Word } from "@clipper/video";
import { api, type Clip, type Job } from "@/lib/api";

type CaptionWord = { word: string; start: number; end: number; line?: number };

type Props = {
  jobId: string;
  clip: Clip;
  duration: number;
  hasTranscript: boolean;
  onPatch: (patch: Partial<import("@/lib/api").Clip>) => void;
  onSeek?: (time: number) => void;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function seedFromTranscript(transcript: any, clipStart: number, clipEnd: number): CaptionWord[] {
  const all: CaptionWord[] = [];
  for (const segment of transcript?.segments || []) {
    for (const word of segment.words || []) {
      if (word.word && word.end > clipStart && word.start < clipEnd) {
        all.push({
          word: String(word.word).trim(),
          start: Math.max(0, word.start - clipStart),
          end: Math.max(0, word.end - clipStart),
          line: typeof word.line === "number" ? word.line : undefined,
        });
      }
    }
  }
  all.sort((a, b) => a.start - b.start);
  // assign lines using buildLines logic
  const lines = buildLines(all.map((w) => ({ word: w.word, start: w.start, end: w.end, line: w.line })));
  const withLines: CaptionWord[] = [];
  lines.forEach((line, index) => {
    line.forEach((w) => {
      withLines.push({ word: w.word, start: w.start, end: w.end, line: index });
    });
  });
  return withLines;
}

export default function CaptionEditor({ jobId, clip, duration, hasTranscript, onPatch, onSeek }: Props) {
  const [words, setWords] = useState<CaptionWord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // Load initial words
  useEffect(() => {
    initializedRef.current = false;
    dirtyRef.current = false;
    if (clip.captions?.words && clip.captions.words.length > 0) {
      setWords(
        clip.captions.words.map((w) => ({
          word: String(w.word || "").trim(),
          start: Number(w.start) || 0,
          end: Number(w.end) || 0,
          line: typeof w.line === "number" ? w.line : 0,
        })),
      );
      initializedRef.current = true;
      return;
    }
    if (!hasTranscript) {
      setWords([]);
      initializedRef.current = true;
      return;
    }
    setLoading(true);
    api<any>(`/api/jobs/${jobId}/transcript`)
      .then((data) => {
        const seeded = seedFromTranscript(data, clip.start_time, clip.end_time);
        setWords(seeded);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load transcript."))
      .finally(() => {
        setLoading(false);
        initializedRef.current = true;
      });
  }, [clip.id, clip.captions, hasTranscript, jobId, clip.start_time, clip.end_time]);

  // Auto-save
  useEffect(() => {
    if (!initializedRef.current || !dirtyRef.current || words === null) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onPatch({ captions: { version: 1, words } });
      dirtyRef.current = false;
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [words, onPatch]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const updateWord = (index: number, patch: Partial<CaptionWord>) => {
    setWords((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      if (next[index].end <= next[index].start) next[index].end = round3(next[index].start + 0.06);
      next[index].start = round3(Math.max(0, Math.min(duration, next[index].start)));
      next[index].end = round3(Math.max(0, Math.min(duration, next[index].end)));
      return next;
    });
    markDirty();
  };

  const deleteWord = (index: number) => {
    setWords((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    markDirty();
  };

  const addWord = (afterIndex: number, line: number) => {
    setWords((prev) => {
      if (!prev) return [{ word: "word", start: 0, end: Math.min(duration, 0.5), line }];
      const next = [...prev];
      const base = prev[afterIndex];
      const start = base ? Math.min(duration, base.end + 0.02) : 0;
      const end = Math.min(duration, start + 0.4);
      next.splice(afterIndex + 1, 0, { word: "word", start: round3(start), end: round3(end), line });
      return next;
    });
    markDirty();
  };

  const addLine = () => {
    setWords((prev) => {
      const next = prev ? [...prev] : [];
      const lastLine = next.length ? Math.max(...next.map((w) => w.line || 0)) : -1;
      const newLine = lastLine + 1;
      const start = 0;
      const end = Math.min(duration, 0.5);
      next.push({ word: "new line", start, end, line: newLine });
      return next;
    });
    markDirty();
  };

  const quickEditLine = (lineNumber: number, text: string) => {
    setWords((prev) => {
      if (!prev) return prev;
      const lineWords = prev.filter((w) => (w.line || 0) === lineNumber);
      if (lineWords.length === 0) return prev;
      const start = Math.min(...lineWords.map((w) => w.start));
      const end = Math.max(...lineWords.map((w) => w.end));
      const tokens = text.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        // remove line
        return prev.filter((w) => (w.line || 0) !== lineNumber);
      }
      const total = Math.max(0.06, end - start);
      const weights = tokens.map((t) => Math.max(1, t.length));
      const weightSum = weights.reduce((a, b) => a + b, 0);
      let cursor = start;
      const rebuilt: CaptionWord[] = tokens.map((token, idx) => {
        const slice = (weights[idx] / weightSum) * total;
        const wStart = cursor;
        const wEnd = idx === tokens.length - 1 ? end : cursor + slice;
        cursor = wEnd;
        return { word: token, start: round3(wStart), end: round3(Math.max(wStart + 0.01, wEnd)), line: lineNumber };
      });
      const others = prev.filter((w) => (w.line || 0) !== lineNumber);
      return [...others, ...rebuilt].sort((a, b) => a.start - b.start);
    });
    markDirty();
  };

  const resetToTranscript = async () => {
    try {
      await api(`/api/clips/${clip.id}/captions`, { method: "DELETE" });
      // reload from transcript
      if (hasTranscript) {
        const data = await api<any>(`/api/jobs/${jobId}/transcript`);
        setWords(seedFromTranscript(data, clip.start_time, clip.end_time));
      } else {
        setWords([]);
      }
      dirtyRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<number, CaptionWord[]>();
    (words || []).forEach((w, index) => {
      const line = w.line || 0;
      if (!map.has(line)) map.set(line, []);
      map.get(line)!.push({ ...w, _index: index } as any);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [words]);

  if (loading) {
    return <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-zinc-400">Loading captions…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-white">Caption track</div>
        <div className="flex gap-2">
          <button
            onClick={addLine}
            className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-white/5"
          >
            + Line
          </button>
          <button
            onClick={resetToTranscript}
            className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-white/5"
          >
            Reset
          </button>
        </div>
      </div>
      {error ? <div className="text-[10px] text-red-300">{error}</div> : null}
      {(!words || words.length === 0) && !loading ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] text-zinc-500">
          No words. Add a line or generate a transcript.
        </div>
      ) : null}
      {grouped.map(([lineNumber, lineWords]) => {
        const lineText = lineWords.map((w: any) => w.word).join(" ");
        return (
          <div key={lineNumber} className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-zinc-400">Line {lineNumber + 1}</span>
              <button
                onClick={() => addWord((lineWords[lineWords.length - 1] as any)._index, lineNumber)}
                className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] text-zinc-300 hover:bg-white/5"
              >
                + word
              </button>
            </div>
            <textarea
              value={lineText}
              onChange={(e) => quickEditLine(lineNumber, e.target.value)}
              rows={1}
              className="mb-2 w-full resize-none rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white focus:border-lime/40 focus:outline-none"
            />
            <div className="space-y-1">
              {lineWords.map((w: any) => (
                <div key={w._index} className="flex items-center gap-1">
                  <input
                    value={w.word}
                    onChange={(e) => updateWord(w._index, { word: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white focus:border-lime/40 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={w.start}
                    onChange={(e) => updateWord(w._index, { start: Number(e.target.value) })}
                    className="w-14 rounded-md border border-white/10 bg-black/30 px-1 py-1 text-[10px] text-white focus:border-lime/40 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={w.end}
                    onChange={(e) => updateWord(w._index, { end: Number(e.target.value) })}
                    className="w-14 rounded-md border border-white/10 bg-black/30 px-1 py-1 text-[10px] text-white focus:border-lime/40 focus:outline-none"
                  />
                  {onSeek ? (
                    <button
                      onClick={() => onSeek(w.start)}
                      className="rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[9px] text-zinc-300 hover:bg-white/5"
                      title="Seek"
                    >
                      ▶
                    </button>
                  ) : null}
                  <button
                    onClick={() => deleteWord(w._index)}
                    className="rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[9px] text-zinc-400 hover:bg-red-400/10 hover:text-red-300"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[9px] leading-relaxed text-zinc-600">
        Times are relative to the clip. Edits save automatically.
      </p>
    </div>
  );
}
