# Deployment

There are two ways to publish this app:

| Mode | What works | Hosting |
| --- | --- | --- |
| **Full app** (recommended) | Accounts, settings sync, and all AI tabs. MCP and server-side PC specs work only when `server.py` runs directly on the same computer. | Any Docker host with a persistent disk (Render, Railway, Fly.io, VPS) |
| **Static site** | Chat/Coder/Multimodal/Research/Image/Video, Local Models page, browser-only settings | GitHub Pages, Netlify, Vercel, Cloudflare Pages |

The app calls AI providers **directly from the visitor's browser**. There is no provider proxy, so provider CORS rules and the visitor's own API keys apply in both modes. Local providers (Ollama, LM Studio, etc.) generally require the app to run on the same computer.

Looking for the native desktop app instead? See [DESKTOP.md](DESKTOP.md).

---

## Option 1 — Full app with accounts (Docker)

### Test locally

```bash
docker build -t avzs-luna .
docker run --rm -p 3000:3000 -v luna-data:/data avzs-luna
```

Open http://localhost:3000. Do **not** set `COOKIE_SECURE=1` while testing over plain HTTP, or the browser will reject the session cookie.

### Deploy to Render (Blueprint)

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml` and creates a web service with a 1 GB persistent disk at `/var/data`.
4. After the deploy finishes, open the service URL.

`render.yaml` uses the `starter` plan because persistent disks require a paid instance. To try the free plan, change `plan` to `free` and remove the `disk` block — **account data will then be lost on every restart or deploy**.

The service runs a single instance. Do not scale it horizontally: account data is a local JSON file and sessions are kept in memory.

### Deploy to another Docker host

Use the included `Dockerfile` on Railway, Fly.io, Koyeb, a VPS, or any container platform. Set:

| Variable | Value | Notes |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Required so the container accepts external connections |
| `PORT` | platform default or `3000` | Most platforms inject this automatically |
| `DATA_DIR` | `/data` (or your mount path) | Must be a **persistent** volume |
| `COOKIE_SECURE` | `1` | Required when the public URL uses HTTPS |
| `TRUST_PROXY` | `1` | Only behind a trusted reverse proxy that sets `X-Forwarded-For` |
| `ALLOW_LOCAL_TOOLS` | `0` | Disables MCP and `/api/system`; the Docker image defaults to `0` |
| `ALLOW_GUEST` | `1` or `0` | `0` hides "Continue without an account" and requires sign-in |

Mount a volume at `DATA_DIR` and keep exactly one app instance. The container entrypoint fixes volume ownership and then runs the server as UID 10001.

For a VPS, put Nginx/Caddy with HTTPS in front of `127.0.0.1:3000`; do not expose plain HTTP to the internet, because passwords and account data travel through it. Example:

```bash
HOST=127.0.0.1 PORT=3000 DATA_DIR=/srv/luna-data COOKIE_SECURE=1 ALLOW_LOCAL_TOOLS=0 python server.py
```

### What is intentionally unavailable in the cloud

- **MCP** (`/api/mcp/*`) and **computer specifications** (`/api/system`) only work from `localhost`. This is a security boundary: MCP can execute commands and read local files. On a public server these endpoints return `403`, and the Local Models page falls back to browser estimates.
- Account data is stored in `DATA_DIR/db.json`, including provider API keys **in plain text** (passwords are scrypt-hashed). Protect backups and the volume. Render takes daily disk snapshots.
- Sessions live in process memory; a restart signs everyone out. The file database is not safe for multiple instances.

---

## Option 2 — Static site

Build a clean folder containing only browser files:

```bash
python scripts/build.py static
```

This creates `dist/` with the four pages, `css/`, `js/`, and `assets/`. Server code, `data/`, MCP config, and `.env` are **not** copied. `js/env.js` is reset to empty so secrets from `.env` are never published — visitors enter their own API keys in Settings.

Deploy `dist/` to any static host:

- **Netlify:** `netlify.toml` already sets the build command and publish folder. Import the repository and deploy.
- **Vercel:** `vercel.json` already sets the build command and output folder. Import the repository and deploy.
- **Cloudflare Pages:** build command `python3 scripts/build.py static`, output directory `dist`.
- **GitHub Pages:** enable **Settings → Pages → Source: GitHub Actions**. The workflow in `.github/workflows/pages.yml` builds and deploys `dist/` on every push to `main`.

### Static-mode limitations

- No accounts, no settings sync (`login.html` explains that the account server is unavailable).
- No MCP tools and no server-side PC specifications.
- Settings and API keys live only in each visitor's browser.
- Local model servers may be blocked by mixed-content or CORS rules on an HTTPS static site.

---

## Security checklist

- Serve the full app over **HTTPS** and set `COOKIE_SECURE=1`.
- Set `TRUST_PROXY=1` only when a known proxy sits in front of the app; otherwise clients can spoof `X-Forwarded-For`.
- Never commit `.env`, `data/db.json`, or `mcp.json` (all are already in `.gitignore`).
- Back up the persistent volume. There is no password-reset flow yet; losing the database means losing accounts.
- The login rate limiter is in memory and per instance. It is a basic protection, not a replacement for a WAF.
- MCP can run local commands. Keep it local; do not expose it publicly. Set `ALLOW_LOCAL_TOOLS=0` on public deployments, and never run the app behind a local reverse proxy that forwards the `Host: localhost` header.
- Provider API keys are stored in the account database. Use trusted providers and restrict access to the server and its backups.
