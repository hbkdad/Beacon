const express = require('express');
const basicAuth = require('express-basic-auth');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ── Core config ───────────────────────────────────────────────────────────────
const PORT = process.env.DASHBOARD_PORT || 3001;
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const HERMES_URL = process.env.HERMES_URL || 'http://localhost:8080';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';
const AUTH_MODE = process.env.AUTH_MODE || 'basic';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || '/config/openclaw.json';
const HERMES_CONFIG_PATH = process.env.HERMES_CONFIG_PATH || '/config/hermes.yaml';
const LOG_DIR = process.env.LOG_DIR || '/data/logs';
const STATE_FILE = process.env.STATE_FILE || '/data/state.json';
const USERS_FILE = path.join(__dirname, 'users.json');

const BACKENDS = {
  openclaw: { container: 'openclaw',  url: OPENCLAW_URL, healthPath: '/health',   port: 18789 },
  hermes:   { container: 'hermes',    url: HERMES_URL,   healthPath: '/health',   port: 8080  },
  ollama:   { container: 'ollama',    url: OLLAMA_URL,   healthPath: '/api/tags', port: 11434 },
};

// ── Persistent dirs ───────────────────────────────────────────────────────────
for (const dir of [LOG_DIR, path.dirname(STATE_FILE)]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

// ── State (active backend) ────────────────────────────────────────────────────
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (_) { return { activeBackend: 'openclaw' }; }
}
function writeState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function getActiveBackend() { return readState().activeBackend || 'openclaw'; }

// ── Log streams ───────────────────────────────────────────────────────────────
function getLogStream(backend) {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `${backend}-${date}.log`);
  return fs.createWriteStream(file, { flags: 'a' });
}

// ── In-memory metrics ─────────────────────────────────────────────────────────
const metrics = { tokensToday: 0, errorsTotal: 0, requestsTotal: 0 };
const backendUp = { openclaw: 0, hermes: 0, ollama: 0 };
const backendUptime = { openclaw: 0, hermes: 0, ollama: 0 };
const TOKEN_RE = /tokens?[:\s]+(\d+)/i;

// ── Webhook alerting ──────────────────────────────────────────────────────────
const lastState = { openclaw: null, hermes: null, ollama: null };

async function sendAlert(msg) {
  if (!ALERT_WEBHOOK_URL) return;
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg, text: msg }),
    });
  } catch (_) {}
}

// ── Shared backend status helper ──────────────────────────────────────────────
async function getBackendStatus(name) {
  const cfg = BACKENDS[name];
  try {
    const container = docker.getContainer(cfg.container);
    const info = await container.inspect();
    const state = info.State;
    let healthy = false;
    if (state.Running) {
      try {
        const fetch = (await import('node-fetch')).default;
        const r = await fetch(`${cfg.url}${cfg.healthPath}`, { timeout: 3000 });
        healthy = r.ok;
      } catch (_) {}
    }
    const uptime = state.Running ? Math.floor((Date.now() - new Date(state.StartedAt)) / 1000) : 0;
    return { running: state.Running, status: state.Status, startedAt: state.StartedAt, healthy, uptime };
  } catch (_) {
    return { running: false, status: 'not_found', healthy: false, uptime: 0 };
  }
}

// Poll all backends every 15s for metrics + alerts
setInterval(async () => {
  for (const [name, _] of Object.entries(BACKENDS)) {
    const s = await getBackendStatus(name);
    backendUp[name] = s.running ? 1 : 0;
    backendUptime[name] = s.uptime;
    const nowUp = s.running && s.healthy;
    if (lastState[name] !== null && lastState[name] !== nowUp) {
      sendAlert(nowUp
        ? `🟢 SelfClawy: ${name} is back online!`
        : `🔴 SelfClawy: ${name} went offline!`);
    }
    lastState[name] = nowUp;
  }
}, 15000);

// ── User store (JWT mode) ─────────────────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const users = [{ username: 'admin', passwordHash: bcrypt.hashSync(PASSWORD, 10), role: 'admin' }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return users;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

// ── Rate limiters ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// ── CSRF (double-submit cookie) ───────────────────────────────────────────────
function setCsrfCookie(req, res, next) {
  if (!(req.headers['cookie'] || '').includes('csrf-token=')) {
    res.setHeader('Set-Cookie', `csrf-token=${crypto.randomBytes(24).toString('hex')}; SameSite=Strict; Path=/`);
  }
  next();
}
function verifyCsrf(req, res, next) {
  const match = (req.headers['cookie'] || '').match(/csrf-token=([a-f0-9]+)/);
  const cookieToken = match ? match[1] : null;
  if (!cookieToken || cookieToken !== req.headers['x-csrf-token']) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function jwtAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (_) { res.status(401).json({ error: 'Invalid token' }); }
}
const basicAuthMiddleware = basicAuth({ users: { admin: PASSWORD }, challenge: true, realm: 'SelfClawy Dashboard' });
function auth(req, res, next) {
  return AUTH_MODE === 'jwt' ? jwtAuth(req, res, next) : basicAuthMiddleware(req, res, next);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(apiLimiter);
app.use(express.json());
app.use(setCsrfCookie);
app.use(express.static(path.join(__dirname, 'public')));

// ── Login (JWT mode) ──────────────────────────────────────────────────────────
app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// ── OpenClaw status (legacy, always openclaw) ─────────────────────────────────
app.get('/api/status', auth, async (req, res) => {
  metrics.requestsTotal++;
  const s = await getBackendStatus('openclaw');
  res.json({ ...s, tokensToday: metrics.tokensToday, errorsTotal: metrics.errorsTotal });
});

// ── All backends status ───────────────────────────────────────────────────────
app.get('/api/backends', auth, async (req, res) => {
  const results = {};
  for (const name of Object.keys(BACKENDS)) {
    results[name] = await getBackendStatus(name);
  }
  res.json({ backends: results, activeBackend: getActiveBackend() });
});

// ── Per-backend status ────────────────────────────────────────────────────────
app.get('/api/status/:backend', auth, async (req, res) => {
  const { backend } = req.params;
  if (!BACKENDS[backend]) return res.status(400).json({ error: 'Unknown backend' });
  res.json(await getBackendStatus(backend));
});

// ── Active backend switch ─────────────────────────────────────────────────────
app.post('/api/backend/switch', auth, verifyCsrf, (req, res) => {
  const { backend } = req.body || {};
  if (!BACKENDS[backend]) return res.status(400).json({ error: 'Unknown backend: ' + backend });
  writeState({ activeBackend: backend });
  io.emit('backend-changed', { activeBackend: backend });
  res.json({ ok: true, activeBackend: backend });
});

// ── OpenClaw container controls (legacy) ──────────────────────────────────────
app.post('/api/start',   auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').start();   res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/stop',    auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').stop();    res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/restart', auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').restart(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ── Generic per-backend controls ──────────────────────────────────────────────
app.post('/api/:backend/start',   auth, verifyCsrf, async (req, res) => {
  const cfg = BACKENDS[req.params.backend];
  if (!cfg) return res.status(400).json({ error: 'Unknown backend' });
  try { await docker.getContainer(cfg.container).start();   res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/:backend/stop',    auth, verifyCsrf, async (req, res) => {
  const cfg = BACKENDS[req.params.backend];
  if (!cfg) return res.status(400).json({ error: 'Unknown backend' });
  try { await docker.getContainer(cfg.container).stop();    res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/:backend/restart', auth, verifyCsrf, async (req, res) => {
  const cfg = BACKENDS[req.params.backend];
  if (!cfg) return res.status(400).json({ error: 'Unknown backend' });
  try { await docker.getContainer(cfg.container).restart(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Hermes: migrate from OpenClaw ─────────────────────────────────────────────
app.post('/api/hermes/migrate', auth, verifyCsrf, async (req, res) => {
  try {
    const container = docker.getContainer('hermes');
    const exec = await container.exec({
      Cmd: ['hermes', 'claw', 'migrate'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    let output = '';
    stream.on('data', (chunk) => { output += chunk.slice(8).toString('utf8'); });
    stream.on('end', () => res.json({ ok: true, output }));
    stream.on('error', (e) => res.status(500).json({ error: e.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Config routes ─────────────────────────────────────────────────────────────
app.get('/api/config', auth, (req, res) => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) { res.status(500).json({ error: 'Cannot read config: ' + err.message }); }
});

app.post('/api/config', auth, verifyCsrf, (req, res) => {
  try {
    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const { provider, model } = req.body;
    if (provider && model) {
      if (!current.providers[provider]) current.providers[provider] = {};
      current.providers[provider].model = model;
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Cannot write config: ' + err.message }); }
});

// ── Ollama: list models ───────────────────────────────────────────────────────
app.get('/api/ollama/models', auth, async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    if (!r.ok) return res.status(502).json({ error: 'Ollama unreachable' });
    res.json(await r.json());
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── Ollama: pull model (SSE streaming) ────────────────────────────────────────
app.post('/api/ollama/pull', auth, verifyCsrf, async (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });
    r.body.on('data', (chunk) => res.write(`data: ${chunk.toString('utf8')}\n\n`));
    r.body.on('end', () => { res.write('data: {"status":"done"}\n\n'); res.end(); });
    r.body.on('error', (e) => { res.write(`data: {"error":"${e.message}"}\n\n`); res.end(); });
  } catch (err) { res.write(`data: {"error":"${err.message}"}\n\n`); res.end(); }
});

// ── Metrics ───────────────────────────────────────────────────────────────────
app.get('/api/metrics', auth, (req, res) => {
  res.json({ ...metrics, backendUp, backendUptime, activeBackend: getActiveBackend() });
});

app.get('/metrics', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  const lines = [
    '# HELP selfclawy_container_up Whether the backend container is running',
    '# TYPE selfclawy_container_up gauge',
    ...Object.entries(backendUp).map(([b, v]) => `selfclawy_container_up{backend="${b}"} ${v}`),
    '# HELP selfclawy_uptime_seconds Container uptime in seconds',
    '# TYPE selfclawy_uptime_seconds gauge',
    ...Object.entries(backendUptime).map(([b, v]) => `selfclawy_uptime_seconds{backend="${b}"} ${v}`),
    '# HELP selfclawy_tokens_today Tokens used today',
    '# TYPE selfclawy_tokens_today counter',
    `selfclawy_tokens_today ${metrics.tokensToday}`,
    '# HELP selfclawy_errors_total Log error lines counted',
    '# TYPE selfclawy_errors_total counter',
    `selfclawy_errors_total ${metrics.errorsTotal}`,
    '# HELP selfclawy_requests_total Dashboard API requests',
    '# TYPE selfclawy_requests_total counter',
    `selfclawy_requests_total ${metrics.requestsTotal}`,
  ];
  res.send(lines.join('\n'));
});

// ── Backup ────────────────────────────────────────────────────────────────────
app.post('/api/backup', auth, verifyCsrf, (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const backend = req.query.backend || 'openclaw';
  const volume = backend === 'hermes' ? 'selfclawy_hermes_data' : 'selfclawy_openclaw_data';
  const filename = `${backend}-backup-${date}.tar.gz`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/gzip');
  const child = exec(`docker run --rm -v ${volume}:/data alpine tar czf - -C /data .`, { encoding: 'buffer' });
  child.stdout.pipe(res);
  child.stderr.on('data', () => {});
  child.on('error', (err) => res.status(500).end(err.message));
});

// ── Socket.io: live log streaming (backend-aware) ─────────────────────────────
io.on('connection', (socket) => {
  let logStream = null;
  let fileStream = null;

  async function subscribeToBackend(backend) {
    if (logStream) { try { logStream.destroy(); } catch (_) {} }
    if (fileStream) { try { fileStream.end(); } catch (_) {} }
    const cfg = BACKENDS[backend] || BACKENDS.openclaw;
    try {
      fileStream = getLogStream(backend);
      const container = docker.getContainer(cfg.container);
      logStream = await container.logs({ follow: true, stdout: true, stderr: true, tail: 100 });
      logStream.on('data', (chunk) => {
        const line = chunk.slice(8).toString('utf8');
        socket.emit('log', line);
        fileStream.write(line);
        if (/error|fatal/i.test(line)) metrics.errorsTotal++;
        const tm = line.match(TOKEN_RE);
        if (tm) metrics.tokensToday += parseInt(tm[1], 10);
      });
      logStream.on('end', () => { socket.emit('log', '[stream ended]'); if (fileStream) fileStream.end(); });
    } catch (err) { socket.emit('log', `[error: ${err.message}]`); }
  }

  socket.on('subscribe-logs', () => subscribeToBackend(getActiveBackend()));
  socket.on('subscribe-logs-backend', (backend) => subscribeToBackend(backend));
  socket.on('disconnect', () => {
    if (logStream) try { logStream.destroy(); } catch (_) {}
    if (fileStream) try { fileStream.end(); } catch (_) {}
  });
});

httpServer.listen(PORT, () => console.log(`SelfClawy dashboard running at http://localhost:${PORT}`));
