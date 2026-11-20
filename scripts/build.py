#!/usr/bin/env python3
"""build.py — alat build (pengganti npm scripts).

  python scripts/build.py env     membuat js/env.js dari file .env
  python scripts/build.py css     membangun css/app.css dari src/input.css (Tailwind, sekali jalan)
  python scripts/build.py all     env + css
  python scripts/build.py watch   env sekali, lalu CSS dipantau dan dibangun ulang saat file berubah

CSS butuh:  pip install -r requirements-dev.txt   (pytailwindcss: binary Tailwind mandiri, tanpa Node.js).
Binary diunduh otomatis saat pertama kali dipakai. Proyek ini memakai Tailwind v3 (tailwind.config.js + @tailwind);
v4 memakai konfigurasi berbeda, jadi versinya dikunci di bawah.
"""
import json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAILWIND_VERSION = 'v3.4.17'      # ubah di sini bila ingin versi v3 lain

def build_env():
    """Baca .env, ambil variabel berawalan LUNA_, tulis js/env.js (window.ENV)."""
    env, f = {}, ROOT / '.env'
    if f.exists():
        for line in f.read_text('utf-8').splitlines():
            m = re.match(r'^\s*(LUNA_[A-Z0-9_]+)\s*=\s*(.*?)\s*$', line)   # abaikan komentar dan baris kosong
            if m and m.group(2):                                              # lewati nilai kosong
                env[m.group(1)] = re.sub(r'^["\']|["\']$', '', m.group(2))
    out = '/* GENERATED oleh `python scripts/build.py env` dari file .env — jangan diedit manual. */\n'
    (ROOT / 'js' / 'env.js').write_text(out + 'window.ENV=' + json.dumps(env, indent=2, ensure_ascii=False) + ';\n', 'utf-8')
    print(f'env.js ditulis ({len(env)} variabel)')

def build_css(watch=False):
    try: import pytailwindcss  # noqa: F401
    except ImportError: sys.exit('Butuh pytailwindcss. Jalankan: pip install -r requirements-dev.txt')
    args = [sys.executable, '-m', 'pytailwindcss', '-i', 'src/input.css', '-o', 'css/app.css', '--watch' if watch else '--minify']
    subprocess.run(args, cwd=ROOT, env={**os.environ, 'TAILWINDCSS_VERSION': TAILWIND_VERSION}, check=True)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if cmd == 'env': build_env()
    elif cmd == 'css': build_css()
    elif cmd == 'all': build_env(); build_css()
    elif cmd == 'watch': build_env(); build_css(watch=True)
    else: sys.exit(__doc__)
