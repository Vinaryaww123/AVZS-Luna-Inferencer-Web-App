#!/usr/bin/env python3
"""desktop.py — native desktop launcher for AVZS Luna Inferencer.

Starts server.py on a fixed loopback port, then shows the app in a native
pywebview window. A stable origin (host + port) is required so the window's
localStorage and cookies survive between launches. Accounts are optional in the
desktop app: the app opens straight to app.html and settings are kept in the
window profile.

Data location (db.json, mcp.json, webview profile, desktop.log):
  Windows  %APPDATA%\\AVZS Luna Inferencer
  macOS    ~/Library/Application Support/AVZS Luna Inferencer
  Linux    $XDG_DATA_HOME/AVZS Luna Inferencer (or ~/.local/share/...)
Override with LUNA_DATA_DIR=/some/folder.

Run from source:      python desktop.py
Build an executable:  python scripts/build_desktop.py     (see DESKTOP.md)
"""
import logging, os, shutil, sys, threading
from http.server import ThreadingHTTPServer
from pathlib import Path

APP_NAME = 'AVZS Luna Inferencer'
DEFAULT_PORT = 47653   # fixed loopback port; keeps the window storage origin stable


class DesktopHTTPServer(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR allows a second process to bind the same port; disable it there.
    allow_reuse_address = sys.platform != 'win32'
    daemon_threads = True


def resource_dir() -> Path:
    """Folder containing the web files (PyInstaller temporary folder when frozen)."""
    if getattr(sys, 'frozen', False):
        return Path(getattr(sys, '_MEIPASS', Path(sys.executable).parent)).resolve()
    return Path(__file__).resolve().parent


def user_data_dir() -> Path:
    """Writable per-user folder for the database, MCP config, and window profile."""
    override = os.environ.get('LUNA_DATA_DIR')
    if override:
        return Path(override).expanduser().resolve()
    if sys.platform == 'win32':
        base = Path(os.environ.get('APPDATA') or (Path.home() / 'AppData' / 'Roaming'))
    elif sys.platform == 'darwin':
        base = Path.home() / 'Library' / 'Application Support'
    else:
        base = Path(os.environ.get('XDG_DATA_HOME') or (Path.home() / '.local' / 'share'))
    return base / APP_NAME


def configure(root: Path, data: Path) -> None:
    """Set the environment before server.py is imported (it reads these at import time)."""
    os.environ.update({
        'LUNA_ROOT': str(root),
        'DATA_DIR': str(data),
        'MCP_FILE': str(data / 'mcp.json'),
        'MCP_CWD': str(data),                               # stable working folder for MCP servers
        'DESKTOP': '1',
        'HOST': '127.0.0.1',
        'PORT': os.environ.get('LUNA_DESKTOP_PORT', str(DEFAULT_PORT)),   # fixed port keeps localStorage origin stable
        'COOKIE_SECURE': '0',                              # loopback HTTP inside the app window
        'TRUST_PROXY': '0',
        'ALLOW_LOCAL_TOOLS': '1',                          # MCP and PC specs are local features
        'ALLOW_GUEST': '1',
    })


def prepare_data(root: Path, data: Path) -> Path:
    """Create the data folder and first-run mcp.json from the shipped example."""
    data.mkdir(parents=True, exist_ok=True)
    (data / 'webview').mkdir(exist_ok=True)
    mcp = data / 'mcp.json'
    if not mcp.exists():
        example = root / 'mcp.example.json'
        if example.is_file():
            shutil.copy2(example, mcp)
            logging.info('Created MCP config: %s', mcp)
    demo = data / 'scripts' / 'mcp_demo.py'
    source = root / 'scripts' / 'mcp_demo.py'
    if not demo.exists() and source.is_file():
        demo.parent.mkdir(exist_ok=True)
        shutil.copy2(source, demo)
    return mcp


def start_server():
    """Start the existing HTTP server on a background thread. Returns (server, port)."""
    import server   # imported after configure(), so DATA_DIR/MCP_FILE/DESKTOP are applied

    try:
        httpd = DesktopHTTPServer(('127.0.0.1', server.PORT), server.Handler)
    except OSError as e:
        raise RuntimeError(
            f'Cannot listen on http://127.0.0.1:{server.PORT}. Another copy of the app '
            'may already be running. Close it, or set LUNA_DESKTOP_PORT to another port.'
        ) from e
    threading.Thread(target=httpd.serve_forever, name='luna-http', daemon=True).start()
    return httpd, httpd.server_address[1]


def acquire_instance_lock(data: Path):
    """Hold an exclusive lock so two copies cannot share one data folder and window profile."""
    f = open(data / 'desktop.lock', 'a+b')
    try:
        if f.seek(0, os.SEEK_END) == 0:
            f.write(b'lock'); f.flush()
        f.seek(0)
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        raise RuntimeError(
            'Another copy of AVZS Luna Inferencer is already running with this data folder.'
        )
    return f


def run_window(url: str, data: Path) -> None:
    """Open the native window. Must run on the main thread."""
    import webview

    window = webview.create_window(
        APP_NAME, url,
        width=1280, height=860, min_size=(960, 600),
        background_color='#0b0f19',
    )
    window.events.loaded += lambda: logging.info('Window loaded: %s', url)
    storage = data / 'webview'
    webview.start(
        private_mode=False,                 # keep cookies/localStorage between launches
        storage_path=str(storage),
        debug=os.environ.get('LUNA_DESKTOP_DEBUG') == '1',
    )


def show_error(message: str) -> None:
    """Show a message even in a windowed build with no console."""
    logging.error(message)
    if sys.platform == 'win32':
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, message, APP_NAME, 0x10)
            return
        except Exception:
            pass
    print(message, file=sys.stderr)


def main() -> int:
    root = resource_dir()
    data = user_data_dir()
    configure(root, data)

    try:
        data.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(data / 'desktop.log', encoding='utf-8')
        logging.basicConfig(
            level=logging.INFO, handlers=[handler],
            format='%(asctime)s %(levelname)s %(message)s',
        )
        logging.info('Starting %s | resources=%s | data=%s', APP_NAME, root, data)
        mcp = prepare_data(root, data)
        lock = acquire_instance_lock(data)
        logging.info('Instance lock: %s', data / 'desktop.lock')

        if sys.platform == 'win32':
            try:
                import ctypes
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('AVZS.LunaInferencer')
            except Exception:
                pass

        httpd, port = start_server()
        url = f'http://127.0.0.1:{port}/app.html'
        logging.info('Server: %s | MCP: %s', url, mcp)
        try:
            run_window(url, data)
        finally:
            httpd.shutdown()
            httpd.server_close()
            lock.close()
            logging.info('Stopped')
        return 0
    except Exception as e:
        logging.exception('Desktop startup failed')
        show_error(
            f'{APP_NAME} could not start.\n\n{e}\n\n'
            f'Details: {data / "desktop.log"}'
        )
        return 1


if __name__ == '__main__':
    sys.exit(main())
