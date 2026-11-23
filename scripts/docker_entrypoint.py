#!/usr/bin/env python3
"""Docker entrypoint: prepare DATA_DIR, drop privileges, then start server.py.

Persistent disks on hosting platforms are often mounted as root. This script runs as root,
makes the data folder writable by the app user, and then switches to UID/GID 10001.
"""
import os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UID = int(os.environ.get('APP_UID', '10001'))
GID = int(os.environ.get('APP_GID', '10001'))
DATA_DIR = Path(os.environ.get('DATA_DIR') or (ROOT / 'data'))

DATA_DIR.mkdir(parents=True, exist_ok=True)

if os.geteuid() == 0:
    try:
        for entry in [DATA_DIR, *DATA_DIR.iterdir()]:
            os.chown(entry, UID, GID)
    except OSError as e:
        sys.exit(f'Cannot set ownership of {DATA_DIR}: {e}')
    os.setgroups([])
    os.setgid(GID)
    os.setuid(UID)

if not os.access(DATA_DIR, os.W_OK):
    sys.exit(f'DATA_DIR ({DATA_DIR}) is not writable. Mount a writable volume there.')

cmd = sys.argv[1:] or [sys.executable, str(ROOT / 'server.py')]
os.execvp(cmd[0], cmd)
