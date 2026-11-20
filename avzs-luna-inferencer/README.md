# AVZS Luna Inferencer

Aplikasi web untuk menjalankan model AI cloud dan lokal: chat, coder, multimodal, riset, gambar, video.
Backend dan alat build memakai Python standar. Node.js tidak diperlukan.

## Mulai
- Langsung pakai: buka `index.html` (homepage) atau `app.html` di browser. `css/app.css` sudah berisi hasil build.
- Dengan akun: `python server.py`, lalu buka http://localhost:3000/app.html (Python 3.8+, tanpa install paket apa pun).
- Mengubah tampilan: `pip install -r requirements-dev.txt`, lalu `python scripts/build.py watch` (atau `css` untuk sekali build).
- Nilai awal lewat env: salin `.env.example` ke `.env`, isi, lalu `python scripts/build.py env` (atau `all`). Hasilnya `js/env.js`.
  Nilai di `.env` terbaca oleh siapa pun yang membuka halaman. Hanya untuk pemakaian pribadi.

## Akun (opsional)
Dengan `python server.py`, membuka `app.html` atau `models.html` tanpa login akan diarahkan ke `login.html` (masuk/daftar).
Pilihan "Lanjut tanpa akun" tersedia; matikan dengan `ALLOW_GUEST=0 python server.py` agar login wajib.
Tanpa server (buka file langsung) aplikasi tetap jalan seperti biasa, tanpa akun.
- Data akun: `data/db.json`. Kata sandi di-hash (scrypt). Pengaturan akun, termasuk kunci API, tersimpan apa adanya di file itu.
- Server hanya mendengarkan 127.0.0.1. Untuk dibuka ke jaringan, pasang HTTPS di depannya dan jangan taruh kunci di `.env`
  (`js/env.js` bisa dibaca siapa pun yang membuka server).
- Format `db.json` sama dengan versi Node.js lama, jadi akun lama tetap berfungsi.

## MCP (alat untuk model)
Butuh `python server.py`. Salin `mcp.example.json` menjadi `mcp.json` lalu isi server yang Anda mau (format sama dengan Claude Desktop):
stdio (`command`, `args`, `env`) atau HTTP streamable (`url`, `headers`). Server stdio memakai `uvx` (Python) atau `npx` (Node) yang harus terpasang.
Di tab Chat atau Coder centang "Alat MCP"; atur server dan alat di Pengaturan > MCP. Setiap pemanggilan alat meminta konfirmasi (bisa dimatikan).
Hanya perintah di `mcp.json` yang bisa dijalankan (browser tidak bisa menambahkannya), dan hanya dari komputer ini. Gunakan hanya server yang Anda percaya.
Server SSE versi lama dan OAuth belum didukung. `scripts/mcp_demo.py` adalah server contoh tanpa dependensi.

## Struktur dan tempat mengubah
- `index.html` homepage, `app.html` aplikasi, `models.html` spesifikasi PC + rekomendasi + pencarian Hugging Face, `login.html` halaman masuk/daftar
- `server.py` server lokal + API akun
- `js/brand.js` nama, tagline, logo (ganti `assets/logo.svg`, atau unggah lewat Pengaturan)
- `js/config.js` provider (`P`), tab (`M`), model default (`DM`), opsi per tab (`OPT`), pengaturan lanjutan gambar/video (`GEN`)
- `js/api.js` pemanggilan API per provider
- `js/login.js` logika halaman login; `js/auth.js` status akun, sinkron pengaturan, tombol Masuk/Keluar
- `js/tour.js` tutorial interaktif (ubah isi di array `TOUR`)
- `js/hw.js` deteksi spesifikasi dan hitung kecocokan model (angka ada di bagian KECOCOKAN)
- `js/models.js` halaman Model Lokal (Hugging Face, unduh ke Ollama)
- `mcp.json` (buat dari `mcp.example.json`) daftar server MCP; `scripts/mcp_demo.py` server contoh
- `js/ui.js` tab, alur kirim, riset, dialog pengaturan
- `src/input.css` kelas komponen Tailwind, `tailwind.config.js` konfigurasi, `css/style.css` warna tema
- `scripts/build.py` pembuat `js/env.js` dan `css/app.css`

Urutan `<script>` di HTML penting: brand, env, config, auth, api, ui, tour (halaman Model Lokal: brand, env, config, hw, models).
