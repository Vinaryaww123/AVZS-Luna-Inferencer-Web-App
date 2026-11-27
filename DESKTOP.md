# Desktop app

AVZS Luna Inferencer can run as a normal desktop application: a native window
(pywebview) with the existing Python server running inside the same process on a
fixed loopback port (47653). No browser tab, no terminal, and no account is
required.

The desktop build keeps the full app: all AI tabs, Local Models, settings, and
MCP tools. Accounts and settings sync stay available in the web server version;
the desktop app stores its settings in the window profile instead.

---

## Run from source

```bash
python -m venv .venv-desktop
# Windows
.venv-desktop\Scripts\activate
# macOS/Linux
source .venv-desktop/bin/activate

pip install -r requirements-desktop.txt
python desktop.py
```

The first launch creates the data folder and a first-run `mcp.json`.

### Platform requirements

| Platform | Window engine | Requirements |
| --- | --- | --- |
| Windows 10/11 | Edge WebView2 | WebView2 Runtime (preinstalled on current Windows) |
| macOS | WKWebView | None (bundled with macOS) |
| Linux | WebKitGTK or Qt | `python3-gi` + `gir1.2-webkit2-4.1`, or `pip install pywebview[qt]` |

---

## Build a standalone executable

```bash
pip install -r requirements-desktop.txt
python scripts/build_desktop.py
```

Output:

- Windows: `dist-desktop/AVZS Luna Inferencer.exe` (single file)
- macOS: `dist-desktop/AVZS Luna Inferencer.app`
- Linux: `dist-desktop/AVZS Luna Inferencer`

Use `python scripts/build_desktop.py --onedir` for a folder build. It starts
faster and makes debugging easier; distribute the whole folder in that case.

PyInstaller must build on the target operating system. Build Windows on Windows,
macOS on macOS, and Linux on the distribution/architecture you want to support.
The resulting file is not code-signed, so Windows SmartScreen and macOS Gatekeeper
may warn on first launch. Sign and notarize the app before distributing it widely.

You can also build the Windows executable on GitHub without a local setup:
**Actions → Build desktop app (Windows) → Run workflow**. The `.exe` is attached
to the workflow run as a downloadable artifact.

The build intentionally does **not** embed `.env` or `js/env.js`: users enter
provider keys in Settings, and the keys stay in that user's app profile.

---

## Where data is stored

| Data | Location |
| --- | --- |
| Account database (only if you use accounts; not needed by the desktop app) | `<data>/db.json` |
| MCP configuration | `<data>/mcp.json` |
| Window cookies/localStorage | `<data>/webview/` |
| Startup log | `<data>/desktop.log` |

`<data>` is:

- **Windows:** `%APPDATA%\AVZS Luna Inferencer`
- **macOS:** `~/Library/Application Support/AVZS Luna Inferencer`
- **Linux:** `$XDG_DATA_HOME/AVZS Luna Inferencer` (usually `~/.local/share/AVZS Luna Inferencer`)

Override it before launching:

```bash
# Windows PowerShell
$env:LUNA_DATA_DIR = "D:\LunaData"; python desktop.py
# macOS/Linux
LUNA_DATA_DIR="$HOME/LunaData" python desktop.py
```

Updating or replacing the executable does not remove this folder, so settings
survive app updates. Back up the folder if you want to keep your keys/settings.
Delete it to reset the app completely.

---

## MCP tools in the desktop app

The first launch copies `mcp.example.json` to `<data>/mcp.json` and copies the
example server to `<data>/scripts/mcp_demo.py`. Open **Settings → MCP** in the
app to see the exact configuration path.

1. Edit `<data>/mcp.json` with any text editor.
2. Add the servers you trust (same format as Claude Desktop).
3. Press **Reload mcp.json** in Settings → MCP.

MCP servers run with `<data>` as their working directory, so relative paths in
`mcp.json` resolve there. Use absolute paths for files elsewhere on the computer.
The `demo` entry works when `python` is on `PATH`; the `uvx`/`npx` examples need
those tools installed.

MCP can run local commands. Only add servers and commands you trust, and keep the
confirmation prompt enabled unless you fully trust the model and server.

---

## Security and limitations

- The server listens on `127.0.0.1:47653` only and is not reachable from other
  computers. A stable port is required so the window's localStorage/cookies
  survive restarts. Starting a second copy fails while the first one is running.
  `LUNA_DESKTOP_PORT` is available for debugging; changing it creates a new
  window-storage origin (settings appear reset).
- The desktop app skips the sign-in page and hides the account button. To use
  accounts and settings sync, run the web version (`python server.py`).
- Provider API keys are stored in the app profile in plain text (and in `db.json`
  if you use accounts). Protect the data folder and do not share it.
- The app calls AI providers directly from the embedded browser. Provider CORS
  rules still apply; local providers (Ollama, LM Studio) usually work because the
  app runs on the same computer.
- The desktop window profile persists cookies and localStorage. Clearing the
  `webview` folder resets the window storage (including provider settings stored
  there).
- The executable is not signed. Code signing is recommended before public
  distribution.
