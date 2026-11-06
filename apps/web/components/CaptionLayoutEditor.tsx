"use client";

import { useEffect, useRef, useState } from "react";
import { captionLayoutOf, type CaptionLayout } from "@clipper/video";
import { type Clip } from "@/lib/api";

type Props = {
  clip: Clip;
  patchClip: (patch: Partial<Clip>, applyAll?: boolean) => Promise<void>;
  applyAll?: boolean;
};

const ALIGNS: Array<{ value: CaptionLayout["align"]; label: string }> = [
  { value: "left", label: "Kiri" },
  { value: "center", label: "Tengah" },
  { value: "right", label: "Kanan" },
];

const POSITIONS: Array<{ label: string; y: number }> = [
  { label: "Atas", y: 0.18 },
  { label: "Tengah", y: 0.5 },
  { label: "Bawah", y: 0.84 },
];

export default function CaptionLayoutEditor({ clip, patchClip, applyAll = false }: Props) {
  const [layout, setLayout] = useState<CaptionLayout>(() =>
    captionLayoutOf(clip.caption_layout as any),
  );
  const [dirty, setDirty] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef<string | null>(null);

  useEffect(() => {
    const key = clip.id + ":" + JSON.stringify(clip.caption_layout);
    if (seededRef.current === key) return;
    seededRef.current = key;
    setLayout(captionLayoutOf(clip.caption_layout as any));
    setDirty(false);
  }, [clip.id, clip.caption_layout]);

  useEffect(() => {
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      patchClip({ caption_layout: layout as any }, applyAll);
      setDirty(false);
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [layout, dirty, patchClip, applyAll]);

  const update = (patch: Partial<CaptionLayout>) => {
    setLayout((prev) => captionLayoutOf({ ...prev, ...patch }));
    setDirty(true);
  };

  const reset = () => {
    const base = captionLayoutOf(null);
    setLayout(base);
    setDirty(true);
  };

  const nearestPos = POSITIONS.reduce((best, p) =>
    Math.abs(p.y - layout.y) < Math.abs(best.y - layout.y) ? p : best,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-white">Layout caption</div>
        <button
          onClick={reset}
          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-white/5"
        >
          Reset
        </button>
      </div>

      {/* lines on screen */}
      <div>
        <div className="mb-1 text-[10px] font-semibold text-zinc-400">Jumlah baris tampil</div>
        <div className="flex gap-1">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => update({ lines_on_screen: n })}
              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                layout.lines_on_screen === n
                  ? "border-lime/40 bg-lime/10 text-lime"
                  : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
              }`}
            >
              {n} baris
            </button>
          ))}
        </div>
      </div>

      {/* words per line */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-zinc-400">
          <span>Kata per baris</span>
          <span className="text-zinc-300">{layout.words_per_line}</span>
        </div>
        <input
          type="range"
          min={2}
          max={6}
          step={1}
          value={layout.words_per_line}
          onChange={(e) => update({ words_per_line: Number(e.target.value) })}
          className="w-full accent-lime"
        />
      </div>

      {/* position presets */}
      <div>
        <div className="mb-1 text-[10px] font-semibold text-zinc-400">Posisi vertikal</div>
        <div className="mb-2 flex gap-1">
          {POSITIONS.map((pos) => (
            <button
              key={pos.label}
              onClick={() => update({ y: pos.y })}
              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                nearestPos.label === pos.label
                  ? "border-lime/40 bg-lime/10 text-lime"
                  : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
              }`}
            >
              {pos.label}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0.05}
          max={0.95}
          step={0.01}
          value={layout.y}
          onChange={(e) => update({ y: Number(e.target.value) })}
          className="w-full accent-lime"
        />
      </div>

      {/* align */}
      <div>
        <div className="mb-1 text-[10px] font-semibold text-zinc-400">Perataan</div>
        <div className="flex gap-1">
          {ALIGNS.map((a) => (
            <button
              key={a.value}
              onClick={() => update({ align: a.value })}
              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                layout.align === a.value
                  ? "border-lime/40 bg-lime/10 text-lime"
                  : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* width */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-zinc-400">
          <span>Lebar caption</span>
          <span className="text-zinc-300">{Math.round(layout.width * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.35}
          max={0.98}
          step={0.01}
          value={layout.width}
          onChange={(e) => update({ width: Number(e.target.value) })}
          className="w-full accent-lime"
        />
      </div>

      {/* font scale */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-zinc-400">
          <span>Ukuran font</span>
          <span className="text-zinc-300">{Math.round(layout.font_scale * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.6}
          max={1.6}
          step={0.05}
          value={layout.font_scale}
          onChange={(e) => update({ font_scale: Number(e.target.value) })}
          className="w-full accent-lime"
        />
      </div>

      {/* line gap */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-zinc-400">
          <span>Jarak baris</span>
          <span className="text-zinc-300">{Math.round(layout.line_gap * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={0.6}
          step={0.02}
          value={layout.line_gap}
          onChange={(e) => update({ line_gap: Number(e.target.value) })}
          className="w-full accent-lime"
        />
      </div>

      <p className="text-[9px] leading-relaxed text-zinc-600">
        Perubahan tersimpan otomatis. Preview langsung mengikuti.
      </p>
    </div>
  );
}
