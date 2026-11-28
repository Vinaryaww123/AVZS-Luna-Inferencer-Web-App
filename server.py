#!/usr/bin/env python3
"""server.py — dependency-free server (standard Python): static files + account API.

Run locally:  python server.py   ->  http://localhost:3000/app.html   (requires Python 3.8+)
Change address/port:  PORT=8080 HOST=127.0.0.1 python server.py

Deployment (see DEPLOY.md):
  HOST=0.0.0.0        listen on all interfaces (required inside Docker/hosting)
  DATA_DIR=/data      folder for db.json (mount a persistent disk there)
  COOKIE_SECURE=1     add the Secure flag to the session cookie (required behind HTTPS)
  TRUST_PROXY=1       read the client IP from X-Forwarded-For (only behind a trusted proxy)
  ALLOW_LOCAL_TOOLS=0 disable MCP and /api/system (recommended for public deployments)
  ALLOW_GUEST=0       require sign-in (hide "Continue without an account")

Desktop app (see DESKTOP.md):
  DESKTOP=1           desktop mode: no page sign-in gate, account button hidden
  LUNA_ROOT=<folder>  folder containing the web files (used by the packaged app)
  DATA_DIR=<folder>   writable per-user data folder
  MCP_FILE=<file>     path to mcp.json (default: ROOT/mcp.json)
  MCP_CWD=<folder>    working folder for stdio MCP servers (default: ROOT)

Account data is in data/db.json by default (passwords are scrypt-hashed; user settings are stored as-is).

Endpoints:  GET /api/health | GET /api/me | POST /api/register | POST /api/login | POST /api/logout | GET/PUT /api/data
The db.json format matches the old Node.js version, so existing accounts keep working.
"""
import atexit, hashlib, hmac, json, os, platform, re, secrets, shutil, signal, subprocess, sys, threading, time, traceback, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote, urlencode

ROOT = Path(os.environ.get('LUNA_ROOT') or Path(__file__).resolve().parent).resolve()
PORT = int(os.environ.get('PORT', 3000))
HOST = os.environ.get('HOST', '127.0.0.1')   # 127.0.0.1 = this computer only. Set HOST=0.0.0.0 in Docker/hosting.
DATA_DIR = Path(os.environ.get('DATA_DIR') or (ROOT / 'data')).expanduser()
DB_FILE = DATA_DIR / 'db.json'
COOKIE_SECURE = os.environ.get('COOKIE_SECURE', '0') == '1'   # Secure cookie flag; enable when served over HTTPS
TRUST_PROXY = os.environ.get('TRUST_PROXY', '0') == '1'       # only when a trusted reverse proxy sets X-Forwarded-For
ALLOW_LOCAL_TOOLS = os.environ.get('ALLOW_LOCAL_TOOLS', '1') != '0'   # 0 = disable MCP and /api/system (public deployments)
DESKTOP = os.environ.get('DESKTOP', '0') == '1'                # native desktop window: no login page, local tools available
SESSION_MS = 30 * 24 * 3600 * 1000           # session lifetime: 30 days
MAX_BODY = 1_000_000                          # JSON body size limit (bytes)
MAX_FAILS, FAIL_WINDOW = 5, 600               # at most 5 failed sign-ins per 10 minutes (per IP + user)

# Pages that require sign-in (redirect to login.html if not signed in). index.html and login.html are publicly accessible.
GATED = {'app.html', 'models.html'}
ALLOW_GUEST = os.environ.get('ALLOW_GUEST', '1') != '0'   # ALLOW_GUEST=0 python server.py  -> sign-in required, "without account" button hidden

# ---------- Storage: one JSON file, guarded by a lock so it is safe under many requests ----------
lock = threading.Lock()
try:
    db = json.loads(DB_FILE.read_text('utf-8'))
except (OSError, ValueError):
    db = {}
db.setdefault('users', {}); db.setdefault('sessions', {})

def persist():
    """Write the db to disk atomically. Call while holding the lock."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DB_FILE.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(db), 'utf-8')
    os.replace(tmp, DB_FILE)

# ---------- Helpers ----------
now_ms = lambda: int(time.time() * 1000)
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()

def hash_pw(pw, salt):
    # scrypt parameters (N=16384, r=8, p=1) and a hex-text salt, same as the old Node.js version.
    return hashlib.scrypt(pw.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()

class ApiError(Exception):
    def __init__(self, code, msg):
        super().__init__(msg); self.code, self.msg = code, msg

fails = {}   # sign-in limiter: "ip|user" -> [failure times, ...]
def too_many(k):
    a = [t for t in fails.get(k, []) if t > time.time() - FAIL_WINDOW]
    fails[k] = a
    return len(a) >= MAX_FAILS

def start_session(user):
    """Create a new session; return the Set-Cookie header value. Call while holding the lock."""
    t = secrets.token_hex(32)
    for k in [k for k, v in db['sessions'].items() if v['exp'] < now_ms()]:
        del db['sessions'][k]                      # remove expired sessions
    db['sessions'][sha(t)] = {'user': user, 'exp': now_ms() + SESSION_MS}   # only the token hash is stored
    secure = '; Secure' if COOKIE_SECURE else ''
    return f'sid={t}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MS // 1000}{secure}'

# ---------- Computer specifications (for the Local Models page) ----------
_sysinfo = None
def run(cmd, timeout=5):
    try: return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout.strip()
    except Exception: return ''

def system_info():
    """Read this computer's specifications (once, then cached). Each step is wrapped in try so one failure does not break the rest."""
    global _sysinfo
    if _sysinfo: return _sysinfo
    sysname = platform.system()
    info = {'os': f'{sysname} {platform.release()}', 'arch': platform.machine(), 'cores': os.cpu_count(), 'cpu': '',
            'ram_gb': 0, 'gpus': [], 'unified': False, 'disk_free_gb': round(shutil.disk_usage(ROOT).free / 1e9)}
    try:
        if sysname == 'Linux':
            info['ram_gb'] = round(int(re.search(r'MemTotal:\s+(\d+)', Path('/proc/meminfo').read_text()).group(1)) / 1048576, 1)
            m = re.search(r'model name\s*:\s*(.+)', Path('/proc/cpuinfo').read_text()); info['cpu'] = m.group(1).strip() if m else ''
        elif sysname == 'Darwin':
            info['ram_gb'] = round(int(run(['sysctl', '-n', 'hw.memsize'])) / 2**30, 1)
            info['cpu'] = run(['sysctl', '-n', 'machdep.cpu.brand_string'])
            if platform.machine() == 'arm64':   # Apple Silicon: CPU and GPU share unified memory
                info['unified'] = True; info['gpus'] = [{'name': info['cpu'] + ' (integrated GPU)', 'vram_gb': None}]
        elif sysname == 'Windows':
            import ctypes
            class MS(ctypes.Structure):
                _fields_ = [('l', ctypes.c_ulong), ('load', ctypes.c_ulong), ('total', ctypes.c_ulonglong)] + [(f'x{i}', ctypes.c_ulonglong) for i in range(5)]
            ms = MS(); ms.l = ctypes.sizeof(ms); ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms))
            info['ram_gb'] = round(ms.total / 2**30, 1)
            info['cpu'] = run(['powershell', '-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Select-Object -First 1).Name'])
    except Exception: pass
    # NVIDIA (all OSes): nvidia-smi gives accurate VRAM
    for line in run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits']).splitlines():
        try: n, mb = [x.strip() for x in line.rsplit(',', 1)]; info['gpus'].append({'name': n, 'vram_gb': round(int(mb) / 1024, 1)})
        except ValueError: pass
    if not info['gpus']:   # Other GPUs: name only (VRAM cannot be read reliably without vendor tools; the user enters it manually)
        if sysname == 'Windows': names = run(['powershell', '-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name']).splitlines()
        elif sysname == 'Linux': names = [re.sub(r'^.*?: ', '', l) for l in run(['lspci']).splitlines() if re.search(r'VGA|3D|Display', l)]
        else: names = []
        info['gpus'] = [{'name': n.strip(), 'vram_gb': None} for n in names if n.strip()]
    _sysinfo = info
    return info

# ---------- MCP (Model Context Protocol): bridge between the browser and MCP servers ----------
# Configuration is in mcp.json (same format as Claude Desktop). Only commands you write in that file can run;
# the browser cannot add or change servers. Transports: stdio (command/args/env) and HTTP streamable (url/headers).
MCP_FILE = Path(os.environ.get('MCP_FILE') or (ROOT / 'mcp.json')).expanduser()
MCP_CWD = Path(os.environ.get('MCP_CWD') or ROOT).expanduser()   # working folder for stdio MCP servers
MCP_PROTO = '2025-06-18'
class McpError(Exception): pass

class McpClient:
    """One MCP server: starts lazily when used, then keeps running until server.py stops or is reloaded."""
    def __init__(self, name, cfg):
        self.name, self.cfg, self.ready = name, cfg, False
        self.lock, self.wlock = threading.RLock(), threading.Lock()
        self.next_id, self.pending, self.proc, self.sid, self.err = 0, {}, None, None, ''

    # --- stdio ---
    def _start(self):
        c = str(self.cfg.get('command', ''))
        cmd = shutil.which(c) or (sys.executable if c in ('python', 'python3') else c)   # npx.cmd on Windows, bundled Python if not found
        env = {**os.environ, **{k: str(v) for k, v in (self.cfg.get('env') or {}).items()}}
        try:
            self.proc = subprocess.Popen([cmd, *map(str, self.cfg.get('args') or [])], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                         stderr=subprocess.PIPE, env=env, cwd=MCP_CWD, text=True, encoding='utf-8', bufsize=1)
        except OSError as e: raise McpError(f'Cannot run "{c}": {e}')
        threading.Thread(target=self._read_out, daemon=True).start()
        threading.Thread(target=self._read_err, daemon=True).start()
    def _read_out(self):
        for line in self.proc.stdout:
            try: msg = json.loads(line)
            except ValueError: continue
            p = self.pending.get(msg.get('id'))
            if p: p[1]['msg'] = msg; p[0].set()
        for ev, box in list(self.pending.values()):   # process exited: wake everyone waiting
            box['msg'] = {'error': {'message': 'MCP server process stopped. ' + self.err.strip()[-300:]}}; ev.set()
    def _read_err(self):
        for line in self.proc.stderr: self.err = (self.err + line)[-2000:]

    # --- HTTP streamable ---
    def _http(self, msg, timeout):
        h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': MCP_PROTO,
             **{k: str(v) for k, v in (self.cfg.get('headers') or {}).items()}}
        if self.sid: h['Mcp-Session-Id'] = self.sid
        req = urllib.request.Request(self.cfg['url'], data=json.dumps(msg).encode(), headers=h, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                self.sid = r.headers.get('Mcp-Session-Id') or self.sid
                if 'text/event-stream' in (r.headers.get('Content-Type') or ''):
                    for raw in r:
                        line = raw.decode('utf-8', 'replace').strip()
                        if line.startswith('data:'):
                            try: m = json.loads(line[5:])
                            except ValueError: continue
                            if m.get('id') == msg.get('id'): return m
                    raise McpError('SSE response without an answer.')
                body = r.read()
                return json.loads(body) if body.strip() else None
        except urllib.error.HTTPError as e: raise McpError(f'HTTP {e.code}: {e.read()[:200].decode("utf-8", "replace")}')
        except (urllib.error.URLError, OSError) as e: raise McpError(f'Cannot connect: {e}')

    # --- JSON-RPC ---
    def rpc(self, method, params=None, timeout=30, notify=False):
        msg = {'jsonrpc': '2.0', 'method': method}
        if params is not None: msg['params'] = params
        if not notify: self.next_id += 1; msg['id'] = mid = self.next_id
        if self.cfg.get('url'):
            r = self._http(msg, timeout)
            if notify: return None
            if r is None: raise McpError('Server gave no answer.')
        else:
            if self.proc is None or self.proc.poll() is not None: raise McpError('MCP server process is not running. ' + self.err.strip()[-300:])
            if not notify: ev, box = threading.Event(), {}; self.pending[mid] = (ev, box)
            with self.wlock: self.proc.stdin.write(json.dumps(msg) + '\n'); self.proc.stdin.flush()
            if notify: return None
            if not ev.wait(timeout): self.pending.pop(mid, None); raise McpError(f'Timed out ({timeout} s). ' + self.err.strip()[-300:])
            self.pending.pop(mid, None); r = box['msg']
        if 'error' in r: raise McpError(str(r['error'].get('message', 'error')))
        return r.get('result') or {}

    def connect(self):
        with self.lock:
            if self.ready: return
            if not self.cfg.get('url'):
                if not self.cfg.get('command'): raise McpError('Fill in "command" or "url" in mcp.json.')
                self._start()
            try:
                self.rpc('initialize', {'protocolVersion': MCP_PROTO, 'capabilities': {}, 'clientInfo': {'name': 'avzs-luna-inferencer', 'version': '1.0'}}, timeout=45)
                self.rpc('notifications/initialized', notify=True)
            except McpError: self.close(); raise
            self.ready = True
    def list_tools(self):
        self.connect(); tools, cur = [], None
        while True:
            r = self.rpc('tools/list', {'cursor': cur} if cur else {}, timeout=30)
            tools += r.get('tools', []); cur = r.get('nextCursor')
            if not cur: return tools
    def call(self, tool, args):
        self.connect()
        return self.rpc('tools/call', {'name': tool, 'arguments': args or {}}, timeout=float(self.cfg.get('timeout', 60)))
    def close(self):
        self.ready, self.sid = False, None
        if self.proc and self.proc.poll() is None:
            try: self.proc.terminate()
            except OSError: pass
        self.proc = None

mcp_clients = {}
atexit.register(lambda: [c.close() for c in list(mcp_clients.values())])
def mcp_config():
    try: cfg = json.loads(MCP_FILE.read_text('utf-8')).get('mcpServers', {})
    except (OSError, ValueError, AttributeError): return {}
    return {n: c for n, c in cfg.items() if isinstance(c, dict)}
def mcp_get(name):
    cfg = mcp_config().get(name)
    if cfg is None: raise McpError(f'Server "{name}" is not in mcp.json.')
    c = mcp_clients.get(name)
    if c is None or c.cfg != cfg:           # configuration changed -> restart
        if c: c.close()
        c = mcp_clients[name] = McpClient(name, cfg)
    return c

# ---------- MCP finder: official registry proxy + validated "add server" ----------
# The registry (registry.modelcontextprotocol.io) is public. Results are normalized so the browser
# only needs name/description/packages/remotes. The add endpoint only writes mcp.json; it never runs a command.
MCP_REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers'
MCP_COMMANDS = {'npx', 'npx.cmd', 'uvx', 'uvx.exe', 'python', 'python3', 'node', 'node.exe',
                'docker', 'docker.exe', 'deno', 'deno.exe', 'bunx', 'uv', 'pipx'}
_registry_cache, _registry_lock = {}, threading.Lock()
mcp_file_lock = threading.Lock()

def mcp_registry(query):
    q = str(query or '').strip()[:100]
    now = time.time()
    with _registry_lock:
        hit = _registry_cache.get(q)
        if hit and hit[0] > now: return hit[1]
    url = MCP_REGISTRY + '?' + urlencode({'search': q, 'version': 'latest', 'limit': 20})
    req = urllib.request.Request(url, headers={'User-Agent': 'AVZS-Luna-Inferencer/1.0', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: data = json.loads(r.read())
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise McpError(f'Registry unavailable: {e}')
    out = []
    for item in data.get('servers') or []:
        s = item.get('server') or {}
        packages = []
        for p in s.get('packages') or []:
            if not isinstance(p, dict): continue
            packages.append({
                'registryType': p.get('registryType') or '', 'identifier': p.get('identifier') or '',
                'version': p.get('version') or '', 'runtimeHint': p.get('runtimeHint') or '',
                'transport': p.get('transport') or {}, 'runtimeArguments': p.get('runtimeArguments') or [],
                'packageArguments': p.get('packageArguments') or [],
                'environmentVariables': [{k: e.get(k) for k in ('name', 'description', 'isRequired', 'isSecret') if e.get(k) is not None}
                                         for e in p.get('environmentVariables') or [] if isinstance(e, dict)]})
        remotes = []
        for r in s.get('remotes') or []:
            if not isinstance(r, dict): continue
            if str(r.get('type') or '').lower() not in ('streamable-http', 'http'): continue  # SSE-only is not supported
            remotes.append({'type': r.get('type'), 'url': r.get('url') or '',
                            'headers': [{k: h.get(k) for k in ('name', 'description', 'isRequired', 'isSecret') if h.get(k) is not None}
                                        for h in r.get('headers') or [] if isinstance(h, dict)]})
        out.append({'name': s.get('name') or '', 'title': s.get('title') or s.get('name') or '',
                    'description': s.get('description') or '', 'version': s.get('version') or '',
                    'repository': (s.get('repository') or {}).get('url') or '',
                    'packages': packages, 'remotes': remotes})
    with _registry_lock: _registry_cache[q] = (now + 300, out)
    return out

def mcp_add(body):
    """Validate one server from the finder and append it to mcp.json atomically."""
    name = str(body.get('name') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,40}', name): raise ApiError(400, 'Invalid server name.')
    cfg = body.get('config')
    if not isinstance(cfg, dict): raise ApiError(400, 'config must be an object')
    out = {}
    if cfg.get('url'):
        u = str(cfg['url'])[:2000]; p = urlparse(u)
        if p.scheme not in ('http', 'https') or not p.netloc: raise ApiError(400, 'URL must start with http:// or https://.')
        out['url'] = u
        hdr = cfg.get('headers')
        if hdr is not None:
            if not isinstance(hdr, dict): raise ApiError(400, 'headers must be an object')
            out['headers'] = {str(k)[:200]: str(v)[:2000] for k, v in list(hdr.items())[:30]}
    else:
        cmd = str(cfg.get('command') or '').strip()
        if Path(cmd).name.lower() not in MCP_COMMANDS:
            raise ApiError(400, 'Command not allowed. Use npx, uvx, python, node, docker, deno, bunx, uv, or pipx.')
        args = cfg.get('args') or []
        if not isinstance(args, list) or len(args) > 40: raise ApiError(400, 'args must be a list of at most 40 items.')
        out['command'] = cmd[:200]; out['args'] = [str(a)[:1000] for a in args]
        env = cfg.get('env')
        if env is not None:
            if not isinstance(env, dict): raise ApiError(400, 'env must be an object')
            out['env'] = {str(k)[:100]: str(v)[:4000] for k, v in list(env.items())[:40]}
    with mcp_file_lock:
        try: data = json.loads(MCP_FILE.read_text('utf-8'))
        except (OSError, ValueError): data = {}
        if not isinstance(data, dict): data = {}
        servers = data.get('mcpServers')
        if not isinstance(servers, dict): servers = {}
        if name in servers: raise ApiError(409, f'Server "{name}" already exists in mcp.json.')
        servers[name] = out; data['mcpServers'] = servers
        MCP_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = MCP_FILE.with_name(MCP_FILE.name + '.tmp')
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), 'utf-8')
        os.replace(tmp, MCP_FILE)
    c = mcp_clients.pop(name, None)
    if c: c.close()
    return name, out

MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'}
PAGES = {'index.html', 'app.html', 'models.html', 'login.html'}       # root pages that may be accessed
DIRS = {'css', 'js', 'assets'}           # folders that may be accessed (server.py, data/, .env, etc. cannot be downloaded)

class Handler(BaseHTTPRequestHandler):
    server_version = 'LunaServer'
    def log_message(self, fmt, *args): pass          # remove this line to log access in the terminal

    # ----- responses -----
    def security_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        if COOKIE_SECURE:
            self.send_header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

    def send_json(self, code, obj, cookie=None):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.security_headers()
        if cookie: self.send_header('Set-Cookie', cookie)
        self.end_headers(); self.wfile.write(body)

    def client_ip(self):
        """Client IP for rate limiting. Only trust X-Forwarded-For when TRUST_PROXY=1 (behind a reverse proxy)."""
        if TRUST_PROXY:
            xff = self.headers.get('X-Forwarded-For', '')
            if xff: return xff.split(',')[0].strip()
        return self.client_address[0]

    def read_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY: raise ApiError(413, 'Data too large')
        raw = self.rfile.read(n) if n else b''
        try: body = json.loads(raw) if raw else {}
        except ValueError: raise ApiError(400, 'Invalid JSON')
        if not isinstance(body, dict): raise ApiError(400, 'JSON must be an object')
        return body

    def token(self):
        m = re.search(r'(?:^|;\s*)sid=([a-f0-9]{64})', self.headers.get('Cookie', ''))
        return m.group(1) if m else None

    def user_of(self):
        t = self.token()
        if not t: return None
        with lock: s = db['sessions'].get(sha(t))
        return s['user'] if s and s['exp'] > now_ms() else None

    # ----- routing -----
    def do_GET(self): self.route()
    def do_POST(self): self.route()
    def do_PUT(self): self.route()
    def route(self):
        try:
            path = urlparse(self.path).path
            if path.startswith('/api/'): self.api(path[5:])
            elif self.command == 'GET': self.static(path)
            else: self.send_json(405, {'error': 'Method not allowed'})
        except Exception:
            traceback.print_exc()
            try: self.send_json(500, {'error': 'Server error'})
            except Exception: pass

    # ----- account API -----
    def api(self, route):
        try:
            m, body = self.command, {}
            if m != 'GET':   # basic CSRF defense: Origin must match Host, and the body must be JSON
                o = self.headers.get('Origin')
                if o and urlparse(o).netloc != self.headers.get('Host'): raise ApiError(403, 'Origin rejected')
                if 'application/json' not in (self.headers.get('Content-Type') or ''):
                    raise ApiError(415, 'Content-Type must be application/json')
                body = self.read_json()
            me = self.user_of()

            if route == 'health' and m == 'GET':
                return self.send_json(200, {'ok': True})

            if route == 'me' and m == 'GET':
                if not me: return self.send_json(401, {'error': 'Not signed in', 'allow_guest': ALLOW_GUEST, 'desktop': DESKTOP})
                return self.send_json(200, {'username': me, 'desktop': DESKTOP})

            if route == 'register' and m == 'POST':
                u = str(body.get('username') or '').strip().lower(); p = str(body.get('password') or '')
                if not re.fullmatch(r'[a-z0-9_.-]{3,32}', u):
                    raise ApiError(400, 'Username 3-32 characters: letters, numbers, dots, dashes, or underscores.')
                if not 8 <= len(p) <= 200: raise ApiError(400, 'Password must be at least 8 characters.')
                salt = secrets.token_hex(16); h = hash_pw(p, salt)
                with lock:
                    if u in db['users']: raise ApiError(409, 'Username is already taken.')
                    db['users'][u] = {'salt': salt, 'hash': h, 'data': None, 'created': now_ms()}
                    cookie = start_session(u); persist()
                return self.send_json(200, {'username': u}, cookie)

            if route == 'login' and m == 'POST':
                u = str(body.get('username') or '').strip().lower(); p = str(body.get('password') or '')[:200]
                k = f'{self.client_ip()}|{u}'
                with lock: blocked = too_many(k)
                if blocked: raise ApiError(429, 'Too many attempts. Try again in 10 minutes.')
                with lock: rec = dict(db['users'].get(u) or {})
                h = hash_pw(p, rec.get('salt', '0' * 32))        # still compute the hash even if the user does not exist
                if not rec or not hmac.compare_digest(h, rec['hash']):
                    with lock: fails.setdefault(k, []).append(time.time())
                    raise ApiError(401, 'Incorrect username or password.')
                with lock:
                    fails.pop(k, None); cookie = start_session(u); persist()
                return self.send_json(200, {'username': u}, cookie)

            if route == 'logout' and m == 'POST':
                t = self.token()
                if t:
                    with lock: db['sessions'].pop(sha(t), None); persist()
                return self.send_json(200, {'ok': True}, 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + ('; Secure' if COOKIE_SECURE else ''))

            if route == 'data':   # per-account settings (API keys, URLs, last model)
                if not me: raise ApiError(401, 'Not signed in')
                if m == 'GET':
                    with lock: data = (db['users'].get(me) or {}).get('data')
                    return self.send_json(200, {'data': data})
                if m == 'PUT':
                    d = body.get('data')
                    if not isinstance(d, dict): raise ApiError(400, 'data must be an object')
                    with lock:
                        if me not in db['users']: raise ApiError(401, 'Not signed in')
                        db['users'][me]['data'] = d; persist()
                    return self.send_json(200, {'ok': True})

            if route.startswith('mcp/'):
                self.require_local(True)
                return self.mcp(route[4:], m, body)

            if route == 'system' and m == 'GET':   # this computer's specifications; only accessible from the same computer
                self.require_local(False)
                return self.send_json(200, system_info())

            raise ApiError(404, 'Endpoint not found')
        except ApiError as e:
            self.send_json(e.code, {'error': e.msg})

    # ----- local access security -----
    def require_local(self, need_app):
        """Only from this computer: loopback IP + localhost Host header (blocks DNS rebinding). need_app: sign-in or guest cookie required."""
        if not ALLOW_LOCAL_TOOLS:
            raise ApiError(403, 'Local tools are disabled on this server.')
        if any(self.headers.get(h) for h in ('Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Real-IP', 'CF-Connecting-IP', 'True-Client-IP')):
            raise ApiError(403, 'Only direct local access is allowed (proxy headers detected).')
        host = self.headers.get('Host', '')
        name = host[1:host.index(']')] if host.startswith('[') and ']' in host else host.split(':')[0]
        if self.client_address[0] not in ('127.0.0.1', '::1', '::ffff:127.0.0.1') or name not in ('localhost', '127.0.0.1', '::1'):
            raise ApiError(403, 'Only from this computer (open via http://localhost).')
        if need_app and not DESKTOP and not self.user_of() and not (ALLOW_GUEST and re.search(r'(?:^|;\s*)guest=1(?:;|$)', self.headers.get('Cookie', ''))):
            raise ApiError(403, 'Sign in first or choose continue without an account.')

    # ----- MCP API -----
    def mcp(self, route, m, body):
        try:
            if route == 'servers' and m == 'GET':
                return self.send_json(200, {'configured': MCP_FILE.exists(), 'file': str(MCP_FILE), 'servers': [
                    {'name': n, 'type': 'http' if c.get('url') else 'stdio', 'ready': bool(mcp_clients.get(n) and mcp_clients[n].ready)} for n, c in mcp_config().items()]})
            if route == 'registry' and m == 'POST':
                return self.send_json(200, {'servers': mcp_registry(body.get('q'))})
            if route == 'add' and m == 'POST':
                name, cfg = mcp_add(body)
                return self.send_json(200, {'ok': True, 'name': name, 'config': cfg})
            if route == 'tools' and m == 'POST':
                tools = mcp_get(str(body.get('server', ''))).list_tools()
                return self.send_json(200, {'tools': [{'name': t.get('name'), 'description': t.get('description', ''), 'inputSchema': t.get('inputSchema')} for t in tools]})
            if route == 'call' and m == 'POST':
                a = body.get('arguments'); a = a if isinstance(a, dict) else {}
                return self.send_json(200, mcp_get(str(body.get('server', ''))).call(str(body.get('tool', '')), a))
            if route == 'reload' and m == 'POST':
                for c in list(mcp_clients.values()): c.close()
                mcp_clients.clear()
                return self.send_json(200, {'ok': True})
        except McpError as e: raise ApiError(502, str(e))
        raise ApiError(404, 'Endpoint not found')

    # ----- static files -----
    def static(self, path):
        rel = unquote('/index.html' if path == '/' else path).lstrip('/')
        f = (ROOT / rel).resolve()
        mime = MIME.get(f.suffix)
        if mime and ROOT in f.parents and f.is_file():
            parts = f.relative_to(ROOT).parts
            if (len(parts) == 1 and parts[0] in PAGES) or parts[0] in DIRS:
                guest = ALLOW_GUEST and re.search(r'(?:^|;\s*)guest=1(?:;|$)', self.headers.get('Cookie', ''))   # "guest" cookie from login.html
                if parts[0] in GATED and not DESKTOP and not self.user_of() and not guest:
                    self.send_response(302); self.send_header('Location', f'/login.html?next={parts[0]}')
                    self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', '0')
                    self.security_headers(); self.end_headers()
                    return
                data = f.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', mime); self.send_header('Cache-Control', 'no-cache')
                self.send_header('Content-Length', str(len(data)))
                self.security_headers(); self.end_headers(); self.wfile.write(data)
                return
        self.send_json(404, {'error': 'Not found'})

if __name__ == '__main__':
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))   # so child MCP servers are stopped too (atexit)
    print(f'AVZS Luna Inferencer: http://{HOST}:{PORT}/app.html   (Ctrl+C to stop)')
    print(f'Data: {DB_FILE}   secure cookies: {"on" if COOKIE_SECURE else "off"}   trust proxy: {"on" if TRUST_PROXY else "off"}')
    if DESKTOP: print(f'Desktop mode   MCP config: {MCP_FILE}')
    try: srv.serve_forever()
    except KeyboardInterrupt: print('\nStopped.')
