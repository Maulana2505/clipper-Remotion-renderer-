export const STAGE_LABELS: Record<string, string> = {
  queued: "Menunggu",
  download: "Mengunduh",
  trim: "Memotong",
  probe: "Memeriksa",
  audio: "Analisis audio",
  detect: "Deteksi momen",
  clips: "Menyimpan klip",
  transcribe: "Transkripsi",
  ready: "Siap",
  failed: "Gagal",
  rendering: "Render",
  face: "Face track",
  redetect: "Re-detect",
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "Menunggu";
  return STAGE_LABELS[stage] || stage;
}