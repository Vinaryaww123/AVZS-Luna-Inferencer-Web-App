# AVZS Luna Inferencer

A web app for running cloud and local AI models: chat, coder, multimodal, research, image, video.
The backend and build tools use standard Python. Node.js is not required.

## Getting started
- Use directly: open `index.html` (homepage) or `app.html` in a browser. `css/app.css` already contains the build output.
- With an account: `python server.py`, then open http://localhost:3000/app.html (Python 3.8+, no packages to install).
- Change the UI: `pip install -r requirements-dev.txt`, then `python scripts/build.py watch` (or `css` for a one-off build).
- Build a static site for hosting: `python scripts/build.py static` (output in `dist/`).
- Initial values via env: copy `.env.example` to `.env`, fill it in, then run `python scripts/build.py env` (or `all`). The result is `js/env.js`.
  Values in `.env` are readable by anyone who opens the page. For personal use only.

## Deployment
See [DEPLOY.md](DEPLOY.md) for two ready-made paths:
- **Full app with accounts:** Docker + Render Blueprint (`render.yaml`), with a persistent disk.
- **Static site:** `dist/` for GitHub Pages, Netlify, Vercel, or Cloudflare Pages (no accounts or MCP).

## Accounts (optional)
With `python server.py`, opening `app.html` or `models.html` without signing in redirects to `login.html` (sign in/register).
A "Continue without an account" option is available; disable it with `ALLOW_GUEST=0 python server.py` to require sign-in.
Without a server (opening the files directly), the app still works as usual, without accounts.
- Account data: `data/db.json`. Passwords are hashed (scrypt). Account settings, including API keys, are stored as-is in that file.
- The server listens only on 127.0.0.1 by default. For a network or cloud deploy, set `HOST=0.0.0.0`, put HTTPS in front of it, and follow [DEPLOY.md](DEPLOY.md).
  Do not put keys in `.env` for a public deployment (`js/env.js` can be read by anyone who opens the server).
- The `db.json` format is the same as the old Node.js version, so old accounts keep working.

## MCP (tools for models)
Requires `python server.py`. Copy `mcp.example.json` to `mcp.json` and fill in the servers you want (same format as Claude Desktop):
stdio (`command`, `args`, `env`) or HTTP streamable (`url`, `headers`). stdio servers use `uvx` (Python) or `npx` (Node), which must be installed.
In the Chat or Coder tab, check "MCP tools"; configure servers and tools in Settings > MCP. Every tool call asks for confirmation (can be disabled).
Only commands in `mcp.json` can run (the browser cannot add them), and only from this computer. Use only servers you trust.
The old SSE servers and OAuth are not supported yet. `scripts/mcp_demo.py` is an example server with no dependencies.

## Structure and where to change things
- `index.html` homepage, `app.html` app, `models.html` PC specs + recommendations + Hugging Face search, `login.html` sign-in/register page
- `server.py` local server + account API
- `Dockerfile`, `render.yaml`, `netlify.toml`, `vercel.json`, `.github/workflows/pages.yml` deployment files (see `DEPLOY.md`)
- `js/brand.js` name, tagline, logo (replace `assets/logo.svg`, or upload via Settings)
- `js/config.js` providers (`P`), tabs (`M`), default models (`DM`), per-tab options (`OPT`), advanced image/video settings (`GEN`)
- `js/api.js` API calls per provider
- `js/login.js` login page logic; `js/auth.js` account status, settings sync, Sign in/Sign out button
- `js/tour.js` interactive tutorial (edit the content in the `TOUR` array)
- `js/hw.js` hardware detection and model fit calculation (numbers are in the FIT section)
- `js/models.js` Local Models page (Hugging Face, download to Ollama)
- `mcp.json` (create from `mcp.example.json`) MCP server list; `scripts/mcp_demo.py` example server
- `js/ui.js` tabs, send flow, research, settings dialog
- `src/input.css` Tailwind component classes, `tailwind.config.js` configuration, `css/style.css` theme colors
- `scripts/build.py` generator for `js/env.js`, `css/app.css`, and the static `dist/` folder

The order of `<script>` tags in the HTML matters: brand, env, config, auth, api, ui, tour (Local Models page: brand, env, config, hw, models).
