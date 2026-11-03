# Colab Whisper Worker

Jalankan `ClipperWhisperWorker.ipynb` di Google Colab (runtime GPU). Di cell terakhir akan muncul
`TUNNEL URL` dan `TOKEN`. Tempel keduanya ke **Settings -> Whisper -> Colab** di Clipper lokal.

- Worker: `worker.py` (FastAPI, port 8010)
- Tunnel: cloudflared (URL publik, berubah tiap sesi)
- Auth: Bearer token
- Model default: `large-v3-turbo` (fp16, CUDA)

Catatan:
- Colab gratis bisa disconnect; jika worker mati, Clipper otomatis fallback ke Whisper lokal.
- Model diunduh ulang tiap sesi (~1.5 GB). Cache ke Google Drive jika perlu.
- Jangan bagikan URL + token.