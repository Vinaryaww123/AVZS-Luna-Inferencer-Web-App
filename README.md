# AVZS Luna Inferencer

A web app for running cloud and local AI models: chat, coder, agent, multimodal, research, image, video.
It can also run small GGUF models directly inside the app with wllama, so no Ollama or server is
required for a local chat. The backend and build tools use standard Python; Node.js is not required.

## Highlights
- **Agent tab:** give a goal instead of a prompt. The model plans, calls MCP tools in configurable
  4/8/12/20 steps, and reports back.
- **In-app GGUF runtime:** download a GGUF model once, cache it in the browser, then chat offline
  (CPU by default, optional WebGPU). Advanced settings include KV cache type, batch sizes, context,
  GPU layers, threads, flash attention, and sampling.
- **Sessions and context view:** separate local sessions per tab, reopen old conversations, inspect
  the system prompt and estimated token usage, and trim or clear messages.
- **Appearance:** light/dark/system mode, accent colors, and optional animated backgrounds (aurora,
  stars, grid, waves, particles). The default look is unchanged until you configure it.
- **MCP finder:** search the official Model Context Protocol registry and add a server with one
  click, including required environment variables.

## Getting started
- Use directly: open `index.html` (homepage) or `app.html` in a browser. `css/app.css` already contains the build output.
- With an account: `python server.py`, then open http://localhost:3000/app.html (Python 3.8+, no packages to install).
- Change the UI: `pip install -r requirements-dev.txt`, then `python scripts/build.py watch` (or `css` for a one-off build).
- Build a static site for hosting: `python scripts/build.py static` (output in `dist/`).
- Desktop app: `pip install -r requirements-desktop.txt`, then `python desktop.py`. Build a standalone executable with `python scripts/build_desktop.py` (see [DESKTOP.md](DESKTOP.md)).
- Initial values via env: copy `.env.example` to `.env`, fill it in, then run `python scripts/build.py env` (or `all`). The result is `js/env.js`.
  Values in `.env` are readable by anyone who opens the page. For personal use only.

## In-app GGUF models
Choose **In-app (wllama, GGUF)** as the provider, then click **Runtime** next to Load models.
The catalog includes small Qwen, Llama, Gemma, Phi, and SmolLM models. You can also load any
Hugging Face repo or a local `.gguf` file.

- The model is downloaded once and cached by the browser (OPFS). Later loads are much faster.
- The first load needs internet access to jsDelivr (wllama) and Hugging Face (model).
- Defaults are conservative: CPU only, 4096 context, f16 KV cache. Set **GPU layers** to `999`
  to try WebGPU; if it fails, return to `0`.
- Larger models need more RAM and take longer to download. Start with a 1B–3B Q4 model.
- In-app models support tools, so they work with the Agent tab and MCP. Vision attachments are not
  supported by this runtime yet.
- The runtime is client-side: static hosting works too, but MCP still needs `server.py`.

## Deployment
See [DEPLOY.md](DEPLOY.md) for two ready-made paths:
- **Full app with accounts:** Docker + Render Blueprint (`render.yaml`), with a persistent disk.
- **Static site:** `dist/` for GitHub Pages, Netlify, Vercel, or Cloudflare Pages (no accounts or MCP;
  in-app models, sessions, and themes still work).

For a native desktop app, see [DESKTOP.md](DESKTOP.md): run `python desktop.py`, or build a standalone executable with `python scripts/build_desktop.py`.

## Accounts (optional)
With `python server.py`, opening `app.html` or `models.html` without signing in redirects to `login.html` (sign in/register).
A "Continue without an account" option is available; disable it with `ALLOW_GUEST=0 python server.py` to require sign-in.
Without a server (opening the files directly), the app still works as usual, without accounts.
- Account data: `data/db.json`. Passwords are hashed (scrypt). Account settings, including API keys, are stored as-is in that file.
- The server listens only on 127.0.0.1 by default. For a network or cloud deploy, set `HOST=0.0.0.0`, put HTTPS in front of it, and follow [DEPLOY.md](DEPLOY.md).
  Do not put keys in `.env` for a public deployment (`js/env.js` can be read by anyone who opens the server).
- The `db.json` format is the same as the old Node.js version, so old accounts keep working.
- Sessions are stored in the browser only (`luna.sessions.v1`), not in the account and not synced
  between devices. Account settings sync remains unchanged.

## MCP (tools for models)
Requires `python server.py` (or the desktop app). Copy `mcp.example.json` to `mcp.json` and fill in the servers you want (same format as Claude Desktop):
stdio (`command`, `args`, `env`) or HTTP streamable (`url`, `headers`). stdio servers use `uvx` (Python) or `npx` (Node), which must be installed.
In the Chat, Coder, or Agent tab, check "MCP tools"; configure servers and tools in Settings > MCP. Every tool call asks for confirmation (can be disabled).

The **Find MCP servers** section in Settings > MCP searches the official registry
(`registry.modelcontextprotocol.io`) through `server.py`. Add a result to write it into `mcp.json`;
required environment variables can be filled in first. The endpoint is local-only, requires a JSON
request from the app, and only allows common runtimes (`npx`, `uvx`, `python`, `node`, `docker`,
`deno`, `bunx`, `uv`, `pipx`). Only servers you add or write yourself can run, and only from this
computer. Use only servers you trust. The old SSE transport and OAuth are not supported yet.
`scripts/mcp_demo.py` is an example server with no dependencies.

## Structure and where to change things
- `index.html` homepage, `app.html` app, `models.html` PC specs + recommendations + Hugging Face search, `login.html` sign-in/register page
- `server.py` local server + account API + MCP bridge/registry proxy
- `desktop.py` native desktop launcher (pywebview); `scripts/build_desktop.py` builds the executable (see `DESKTOP.md`)
- `requirements-desktop.txt` pywebview + PyInstaller for the desktop app (the web server needs no packages)
- `Dockerfile`, `render.yaml`, `netlify.toml`, `vercel.json`, `.github/workflows/pages.yml` deployment files (see `DEPLOY.md`)
- `js/brand.js` name, tagline, logo (replace `assets/logo.svg`, or upload via Settings)
- `js/config.js` providers (`P`), tabs (`M`), default models (`DM`), per-tab options (`OPT`), Agent prompt (`AGENT`), advanced image/video settings (`GEN`), storage defaults (`S.theme`, `S.local`, `S.ag`)
- `js/api.js` API calls per provider, local runtime dispatch, and the agent tool loop
- `js/local.js` in-app GGUF runtime (wllama), model catalog, advanced load/sampling settings
- `js/sessions.js` local sessions and the context viewer
- `js/theme.js` color modes, accent colors, and animated backgrounds
- `js/login.js` login page logic; `js/auth.js` account status, settings sync, Sign in/Sign out button
- `js/tour.js` interactive tutorial (edit the content in the `TOUR` array)
- `js/hw.js` hardware detection and model fit calculation (numbers are in the FIT section)
- `js/models.js` Local Models page (Hugging Face, download to Ollama)
- `mcp.json` (create from `mcp.example.json`) MCP server list; `scripts/mcp_demo.py` example server
- `js/ui.js` tabs, send flow, research, settings dialog, MCP finder UI
- `src/input.css` Tailwind component classes, `tailwind.config.js` configuration, `css/style.css` theme colors, startup screen, and animated-background canvas
- `scripts/build.py` generator for `js/env.js`, `css/app.css`, and the static `dist/` folder

The order of `<script>` tags in the HTML matters: brand, env, config, auth, local, api, theme, sessions, ui, tour
(Local Models page: brand, env, config, theme, hw, models).
