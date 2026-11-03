# Colab Whisper Worker

Jalankan `ClipperWhisperWorker.ipynb` di Google Colab (runtime GPU). Di cell terakhir akan muncul
`TUNNEL URL` dan `TOKEN`. Tempel keduanya ke **Settings -> Whisper -> Colab** di Clipper lokal.

- Worker: `worker.py` (FastAPI, port 8010)
- Tunnel: cloudflared (URL publik, berubah tiap sesi)
- Auth: Bearer token
- Model default: `large-v3-turbo` (fp16, CUDA)

Token otomatis dibuat kuat di cell 2 dan dicetak di output-nya. Untuk melihat ulang kapan saja,
jalankan cell "Tampilkan kredensial" atau `!cat /content/.clipper_token` dan `!cat /content/.clipper_url`
di cell baru.

Catatan:
- Colab gratis bisa disconnect; jika worker mati, Clipper otomatis fallback ke Whisper lokal.
- Model diunduh ulang tiap sesi (~1.5 GB). Cache ke Google Drive jika perlu.
- Jangan bagikan URL + token.
- PyAV harus `<19` (faster-whisper 1.1.1 memanggil `av.open(..., metadata_errors="ignore")`,
  yang dihapus di PyAV 19). Install cell sudah mem-pin `av>=12,<19`.
- `worker.py` juga punya shim kompatibilitas, jadi kalau Colab memaksa PyAV 19+, tetap jalan.
- Kalau muncul `TypeError: open() got an unexpected keyword argument 'metadata_errors'`,
  jalankan ulang cell install (pastikan av < 19) lalu restart runtime.