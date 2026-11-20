#!/usr/bin/env python3
"""server.py — server lokal tanpa dependensi (Python standar): file statis + API akun.

Jalankan:  python server.py   ->  http://localhost:3000/app.html   (butuh Python 3.8+)
Ubah alamat/port:  PORT=8080 HOST=127.0.0.1 python server.py
Data akun ada di data/db.json (kata sandi di-hash scrypt; pengaturan pengguna tersimpan apa adanya).

Endpoint:  GET /api/me | POST /api/register | POST /api/login | POST /api/logout | GET/PUT /api/data
Format file db.json sama dengan versi Node.js lama, jadi akun yang sudah ada tetap bisa dipakai.
"""
import atexit, hashlib, hmac, json, os, platform, re, secrets, shutil, signal, subprocess, sys, threading, time, traceback, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get('PORT', 3000))
HOST = os.environ.get('HOST', '127.0.0.1')   # 127.0.0.1 = hanya komputer ini. Jangan ubah ke 0.0.0.0 tanpa HTTPS.
DB_FILE = ROOT / 'data' / 'db.json'
SESSION_MS = 30 * 24 * 3600 * 1000           # masa berlaku sesi: 30 hari
MAX_BODY = 1_000_000                          # batas ukuran body JSON (byte)
MAX_FAILS, FAIL_WINDOW = 5, 600               # maksimal 5 login gagal per 10 menit (per IP + pengguna)

# Halaman yang butuh login (redirect ke login.html bila belum masuk). index.html dan login.html bebas diakses.
GATED = {'app.html', 'models.html'}
ALLOW_GUEST = os.environ.get('ALLOW_GUEST', '1') != '0'   # ALLOW_GUEST=0 python server.py  -> wajib login, tombol "tanpa akun" hilang

# ---------- Penyimpanan: satu file JSON, dijaga lock supaya aman saat banyak permintaan ----------
lock = threading.Lock()
try:
    db = json.loads(DB_FILE.read_text('utf-8'))
except (OSError, ValueError):
    db = {}
db.setdefault('users', {}); db.setdefault('sessions', {})

def persist():
    """Tulis db ke disk secara atomik. Panggil saat memegang lock."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DB_FILE.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(db), 'utf-8')
    os.replace(tmp, DB_FILE)

# ---------- Helper ----------
now_ms = lambda: int(time.time() * 1000)
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()

def hash_pw(pw, salt):
    # Parameter scrypt (N=16384, r=8, p=1) dan salt berupa teks hex, sama dengan versi Node.js lama.
    return hashlib.scrypt(pw.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()

class ApiError(Exception):
    def __init__(self, code, msg):
        super().__init__(msg); self.code, self.msg = code, msg

fails = {}   # pembatas login: "ip|pengguna" -> [waktu gagal, ...]
def too_many(k):
    a = [t for t in fails.get(k, []) if t > time.time() - FAIL_WINDOW]
    fails[k] = a
    return len(a) >= MAX_FAILS

def start_session(user):
    """Buat sesi baru; kembalikan nilai header Set-Cookie. Panggil saat memegang lock."""
    t = secrets.token_hex(32)
    for k in [k for k, v in db['sessions'].items() if v['exp'] < now_ms()]:
        del db['sessions'][k]                      # bersihkan sesi kedaluwarsa
    db['sessions'][sha(t)] = {'user': user, 'exp': now_ms() + SESSION_MS}   # yang disimpan hanya hash token
    return f'sid={t}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MS // 1000}'

# ---------- Spesifikasi komputer (untuk halaman Model Lokal) ----------
_sysinfo = None
def run(cmd, timeout=5):
    try: return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout.strip()
    except Exception: return ''

def system_info():
    """Baca spesifikasi komputer ini (sekali, lalu disimpan). Tiap langkah dibungkus try agar satu kegagalan tidak merusak sisanya."""
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
            if platform.machine() == 'arm64':   # Apple Silicon: CPU dan GPU berbagi memori terpadu
                info['unified'] = True; info['gpus'] = [{'name': info['cpu'] + ' (GPU terpadu)', 'vram_gb': None}]
        elif sysname == 'Windows':
            import ctypes
            class MS(ctypes.Structure):
                _fields_ = [('l', ctypes.c_ulong), ('load', ctypes.c_ulong), ('total', ctypes.c_ulonglong)] + [(f'x{i}', ctypes.c_ulonglong) for i in range(5)]
            ms = MS(); ms.l = ctypes.sizeof(ms); ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms))
            info['ram_gb'] = round(ms.total / 2**30, 1)
            info['cpu'] = run(['powershell', '-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Select-Object -First 1).Name'])
    except Exception: pass
    # NVIDIA (semua OS): nvidia-smi memberi VRAM yang akurat
    for line in run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits']).splitlines():
        try: n, mb = [x.strip() for x in line.rsplit(',', 1)]; info['gpus'].append({'name': n, 'vram_gb': round(int(mb) / 1024, 1)})
        except ValueError: pass
    if not info['gpus']:   # GPU lain: hanya nama (VRAM tidak bisa dibaca andal tanpa alat vendor; pengguna mengisi manual)
        if sysname == 'Windows': names = run(['powershell', '-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name']).splitlines()
        elif sysname == 'Linux': names = [re.sub(r'^.*?: ', '', l) for l in run(['lspci']).splitlines() if re.search(r'VGA|3D|Display', l)]
        else: names = []
        info['gpus'] = [{'name': n.strip(), 'vram_gb': None} for n in names if n.strip()]
    _sysinfo = info
    return info

# ---------- MCP (Model Context Protocol): jembatan antara browser dan server MCP ----------
# Konfigurasi ada di mcp.json (format sama dengan Claude Desktop). Hanya perintah yang Anda tulis di file itu yang bisa dijalankan;
# browser tidak bisa menambah atau mengubah server. Transport: stdio (command/args/env) dan HTTP streamable (url/headers).
MCP_FILE = ROOT / 'mcp.json'
MCP_PROTO = '2025-06-18'
class McpError(Exception): pass

class McpClient:
    """Satu server MCP: mulai lazy saat dipakai, lalu tetap berjalan sampai server.py berhenti atau dimuat ulang."""
    def __init__(self, name, cfg):
        self.name, self.cfg, self.ready = name, cfg, False
        self.lock, self.wlock = threading.RLock(), threading.Lock()
        self.next_id, self.pending, self.proc, self.sid, self.err = 0, {}, None, None, ''

    # --- stdio ---
    def _start(self):
        c = str(self.cfg.get('command', ''))
        cmd = shutil.which(c) or (sys.executable if c in ('python', 'python3') else c)   # npx.cmd di Windows, python bawaan bila tak ketemu
        env = {**os.environ, **{k: str(v) for k, v in (self.cfg.get('env') or {}).items()}}
        try:
            self.proc = subprocess.Popen([cmd, *map(str, self.cfg.get('args') or [])], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                         stderr=subprocess.PIPE, env=env, cwd=ROOT, text=True, encoding='utf-8', bufsize=1)
        except OSError as e: raise McpError(f'Tidak bisa menjalankan "{c}": {e}')
        threading.Thread(target=self._read_out, daemon=True).start()
        threading.Thread(target=self._read_err, daemon=True).start()
    def _read_out(self):
        for line in self.proc.stdout:
            try: msg = json.loads(line)
            except ValueError: continue
            p = self.pending.get(msg.get('id'))
            if p: p[1]['msg'] = msg; p[0].set()
        for ev, box in list(self.pending.values()):   # proses berhenti: bangunkan semua yang menunggu
            box['msg'] = {'error': {'message': 'Proses server MCP berhenti. ' + self.err.strip()[-300:]}}; ev.set()
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
                    raise McpError('Respons SSE tanpa jawaban.')
                body = r.read()
                return json.loads(body) if body.strip() else None
        except urllib.error.HTTPError as e: raise McpError(f'HTTP {e.code}: {e.read()[:200].decode("utf-8", "replace")}')
        except (urllib.error.URLError, OSError) as e: raise McpError(f'Tidak bisa terhubung: {e}')

    # --- JSON-RPC ---
    def rpc(self, method, params=None, timeout=30, notify=False):
        msg = {'jsonrpc': '2.0', 'method': method}
        if params is not None: msg['params'] = params
        if not notify: self.next_id += 1; msg['id'] = mid = self.next_id
        if self.cfg.get('url'):
            r = self._http(msg, timeout)
            if notify: return None
            if r is None: raise McpError('Server tidak memberi jawaban.')
        else:
            if self.proc is None or self.proc.poll() is not None: raise McpError('Proses server MCP tidak berjalan. ' + self.err.strip()[-300:])
            if not notify: ev, box = threading.Event(), {}; self.pending[mid] = (ev, box)
            with self.wlock: self.proc.stdin.write(json.dumps(msg) + '\n'); self.proc.stdin.flush()
            if notify: return None
            if not ev.wait(timeout): self.pending.pop(mid, None); raise McpError(f'Waktu habis ({timeout} dtk). ' + self.err.strip()[-300:])
            self.pending.pop(mid, None); r = box['msg']
        if 'error' in r: raise McpError(str(r['error'].get('message', 'error')))
        return r.get('result') or {}

    def connect(self):
        with self.lock:
            if self.ready: return
            if not self.cfg.get('url'):
                if not self.cfg.get('command'): raise McpError('Isi "command" atau "url" di mcp.json.')
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
    if cfg is None: raise McpError(f'Server "{name}" tidak ada di mcp.json.')
    c = mcp_clients.get(name)
    if c is None or c.cfg != cfg:           # konfigurasi berubah -> mulai ulang
        if c: c.close()
        c = mcp_clients[name] = McpClient(name, cfg)
    return c

MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'}
PAGES = {'index.html', 'app.html', 'models.html', 'login.html'}       # halaman di root yang boleh diakses
DIRS = {'css', 'js', 'assets'}           # folder yang boleh diakses (server.py, data/, .env, dll. tidak bisa diunduh)

class Handler(BaseHTTPRequestHandler):
    server_version = 'LunaServer'
    def log_message(self, fmt, *args): pass          # hapus baris ini bila ingin log akses di terminal

    # ----- respons -----
    def send_json(self, code, obj, cookie=None):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if cookie: self.send_header('Set-Cookie', cookie)
        self.end_headers(); self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY: raise ApiError(413, 'Data terlalu besar')
        raw = self.rfile.read(n) if n else b''
        try: body = json.loads(raw) if raw else {}
        except ValueError: raise ApiError(400, 'JSON tidak valid')
        if not isinstance(body, dict): raise ApiError(400, 'JSON harus berupa objek')
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
            else: self.send_json(405, {'error': 'Metode tidak diizinkan'})
        except Exception:
            traceback.print_exc()
            try: self.send_json(500, {'error': 'Kesalahan server'})
            except Exception: pass

    # ----- API akun -----
    def api(self, route):
        try:
            m, body = self.command, {}
            if m != 'GET':   # pertahanan CSRF dasar: Origin harus sama dengan Host, dan body harus JSON
                o = self.headers.get('Origin')
                if o and urlparse(o).netloc != self.headers.get('Host'): raise ApiError(403, 'Origin ditolak')
                if 'application/json' not in (self.headers.get('Content-Type') or ''):
                    raise ApiError(415, 'Content-Type harus application/json')
                body = self.read_json()
            me = self.user_of()

            if route == 'me' and m == 'GET':
                if not me: return self.send_json(401, {'error': 'Belum masuk', 'allow_guest': ALLOW_GUEST})
                return self.send_json(200, {'username': me})

            if route == 'register' and m == 'POST':
                u = str(body.get('username') or '').strip().lower(); p = str(body.get('password') or '')
                if not re.fullmatch(r'[a-z0-9_.-]{3,32}', u):
                    raise ApiError(400, 'Nama pengguna 3-32 karakter: huruf, angka, titik, strip, atau garis bawah.')
                if not 8 <= len(p) <= 200: raise ApiError(400, 'Kata sandi minimal 8 karakter.')
                salt = secrets.token_hex(16); h = hash_pw(p, salt)
                with lock:
                    if u in db['users']: raise ApiError(409, 'Nama pengguna sudah dipakai.')
                    db['users'][u] = {'salt': salt, 'hash': h, 'data': None, 'created': now_ms()}
                    cookie = start_session(u); persist()
                return self.send_json(200, {'username': u}, cookie)

            if route == 'login' and m == 'POST':
                u = str(body.get('username') or '').strip().lower(); p = str(body.get('password') or '')[:200]
                k = f'{self.client_address[0]}|{u}'
                with lock: blocked = too_many(k)
                if blocked: raise ApiError(429, 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.')
                with lock: rec = dict(db['users'].get(u) or {})
                h = hash_pw(p, rec.get('salt', '0' * 32))        # tetap menghitung hash walau pengguna tidak ada
                if not rec or not hmac.compare_digest(h, rec['hash']):
                    with lock: fails.setdefault(k, []).append(time.time())
                    raise ApiError(401, 'Nama pengguna atau kata sandi salah.')
                with lock:
                    fails.pop(k, None); cookie = start_session(u); persist()
                return self.send_json(200, {'username': u}, cookie)

            if route == 'logout' and m == 'POST':
                t = self.token()
                if t:
                    with lock: db['sessions'].pop(sha(t), None); persist()
                return self.send_json(200, {'ok': True}, 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')

            if route == 'data':   # pengaturan per akun (kunci API, URL, model terakhir)
                if not me: raise ApiError(401, 'Belum masuk')
                if m == 'GET':
                    with lock: data = (db['users'].get(me) or {}).get('data')
                    return self.send_json(200, {'data': data})
                if m == 'PUT':
                    d = body.get('data')
                    if not isinstance(d, dict): raise ApiError(400, 'data harus berupa objek')
                    with lock:
                        if me not in db['users']: raise ApiError(401, 'Belum masuk')
                        db['users'][me]['data'] = d; persist()
                    return self.send_json(200, {'ok': True})

            if route.startswith('mcp/'):
                self.require_local(True)
                return self.mcp(route[4:], m, body)

            if route == 'system' and m == 'GET':   # spesifikasi komputer ini; hanya untuk akses dari komputer yang sama
                self.require_local(False)
                return self.send_json(200, system_info())

            raise ApiError(404, 'Endpoint tidak ada')
        except ApiError as e:
            self.send_json(e.code, {'error': e.msg})

    # ----- keamanan akses lokal -----
    def require_local(self, need_app):
        """Hanya dari komputer ini: IP loopback + header Host localhost (menahan DNS rebinding). need_app: wajib login atau cookie tamu."""
        host = self.headers.get('Host', '')
        name = host[1:host.index(']')] if host.startswith('[') and ']' in host else host.split(':')[0]
        if self.client_address[0] not in ('127.0.0.1', '::1', '::ffff:127.0.0.1') or name not in ('localhost', '127.0.0.1', '::1'):
            raise ApiError(403, 'Hanya dari komputer ini (buka lewat http://localhost).')
        if need_app and not self.user_of() and not (ALLOW_GUEST and re.search(r'(?:^|;\s*)guest=1(?:;|$)', self.headers.get('Cookie', ''))):
            raise ApiError(403, 'Masuk dulu atau pilih lanjut tanpa akun.')

    # ----- API MCP -----
    def mcp(self, route, m, body):
        try:
            if route == 'servers' and m == 'GET':
                return self.send_json(200, {'configured': MCP_FILE.exists(), 'servers': [
                    {'name': n, 'type': 'http' if c.get('url') else 'stdio', 'ready': bool(mcp_clients.get(n) and mcp_clients[n].ready)} for n, c in mcp_config().items()]})
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
        raise ApiError(404, 'Endpoint tidak ada')

    # ----- file statis -----
    def static(self, path):
        rel = unquote('/index.html' if path == '/' else path).lstrip('/')
        f = (ROOT / rel).resolve()
        mime = MIME.get(f.suffix)
        if mime and ROOT in f.parents and f.is_file():
            parts = f.relative_to(ROOT).parts
            if (len(parts) == 1 and parts[0] in PAGES) or parts[0] in DIRS:
                guest = ALLOW_GUEST and re.search(r'(?:^|;\s*)guest=1(?:;|$)', self.headers.get('Cookie', ''))   # cookie "tamu" dari login.html
                if parts[0] in GATED and not self.user_of() and not guest:
                    self.send_response(302); self.send_header('Location', f'/login.html?next={parts[0]}')
                    self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', '0'); self.end_headers()
                    return
                data = f.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', mime); self.send_header('Cache-Control', 'no-cache')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers(); self.wfile.write(data)
                return
        self.send_json(404, {'error': 'Tidak ditemukan'})

if __name__ == '__main__':
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))   # supaya server MCP anak ikut dihentikan (atexit)
    print(f'AVZS Luna Inferencer: http://{HOST}:{PORT}/app.html   (Ctrl+C untuk berhenti)')
    try: srv.serve_forever()
    except KeyboardInterrupt: print('\nBerhenti.')
