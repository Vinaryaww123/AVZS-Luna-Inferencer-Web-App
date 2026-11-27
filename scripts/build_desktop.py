#!/usr/bin/env python3
"""build_desktop.py — package AVZS Luna Inferencer as a desktop executable.

  python scripts/build_desktop.py            single-file build (default)
  python scripts/build_desktop.py --onedir   folder build (faster startup, easier debugging)

Output:
  Windows   dist-desktop/AVZS Luna Inferencer.exe
  macOS     dist-desktop/AVZS Luna Inferencer.app
  Linux     dist-desktop/AVZS Luna Inferencer

Requirements:  pip install -r requirements-desktop.txt
The desktop app is built with pywebview + PyInstaller; see DESKTOP.md.
"""
import os, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_NAME = 'AVZS Luna Inferencer'
STAGE = ROOT / 'build' / 'desktop-stage'
DIST = ROOT / 'dist-desktop'
WORK = ROOT / 'build' / 'pyinstaller'
SPEC = ROOT / 'build'

PAGES = ['index.html', 'app.html', 'models.html', 'login.html']
DIRS = ['css', 'js', 'assets']


def stage_files() -> None:
    """Copy only the files the desktop app needs into a clean staging folder."""
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    for name in PAGES + ['mcp.example.json']:
        shutil.copy2(ROOT / name, STAGE / name)
    for name in DIRS:
        ignore = shutil.ignore_patterns('env.js') if name == 'js' else None
        shutil.copytree(ROOT / name, STAGE / name, ignore=ignore)
    # Never bundle the local .env secrets: desktop settings live in the window profile.
    (STAGE / 'js' / 'env.js').write_text(
        '/* Desktop build: configure providers in Settings (stored in the app profile). */\nwindow.ENV={};\n', 'utf-8')
    # The example MCP server referenced by mcp.example.json.
    (STAGE / 'scripts').mkdir()
    shutil.copy2(ROOT / 'scripts' / 'mcp_demo.py', STAGE / 'scripts' / 'mcp_demo.py')


def build(onefile: bool = True) -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        sys.exit('PyInstaller is required. Run: pip install -r requirements-desktop.txt')
    try:
        import webview  # noqa: F401
    except ImportError:
        sys.exit('pywebview is required. Run: pip install -r requirements-desktop.txt')

    stage_files()
    mode = '--onefile' if onefile else '--onedir'
    args = [
        sys.executable, '-m', 'PyInstaller',
        '--noconfirm', '--clean', mode, '--windowed',
        '--name', APP_NAME,
        '--distpath', str(DIST),
        '--workpath', str(WORK),
        '--specpath', str(SPEC),
        '--paths', str(ROOT),
        '--hidden-import', 'server',
        '--collect-all', 'webview',
        str(ROOT / 'desktop.py'),
    ]
    for name in PAGES + ['mcp.example.json']:
        args += ['--add-data', f'{STAGE / name}{os.pathsep}.']
    for name in DIRS:
        args += ['--add-data', f'{STAGE / name}{os.pathsep}{name}']
    args += ['--add-data', f'{STAGE / "scripts" / "mcp_demo.py"}{os.pathsep}scripts']

    print(f'Building {APP_NAME} ({mode[2:]})...')
    subprocess.run(args, cwd=ROOT, check=True)

    exe = DIST / (APP_NAME + ('.exe' if sys.platform == 'win32' else ''))
    target = exe if onefile else DIST / APP_NAME
    print(f'\nBuilt: {target}')
    if target.exists() and target.is_file():
        print(f'Size: {target.stat().st_size / 1048576:.1f} MB')
    print('Test it, then share the file/folder together with DESKTOP.md notes.')


if __name__ == '__main__':
    build(onefile='--onedir' not in sys.argv[1:])
