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
const db = require('./db');

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
      if (nowUp) {
        sendAlert(`🟢 SelfClawy: ${name} is back online!`);
        db.addNotification('info', `${name} is back online`, `${name} container running`);
      } else {
        sendAlert(`🔴 SelfClawy: ${name} went offline!`);
        db.addNotification('alert', `${name} went offline`, `${name} container stopped`);
      }
    }
    lastState[name] = nowUp;
    const today = new Date().toISOString().slice(0, 10);
    db.upsertDailyMetrics(today, name, { requests: 0 });
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

// ── Socket.io auth middleware ─────────────────────────────────────────────────
io.use((socket, next) => {
  if (AUTH_MODE === 'jwt') {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try { jwt.verify(token, JWT_SECRET); next(); } catch { next(new Error('Unauthorized')); }
  } else {
    const authHeader = socket.handshake.headers?.authorization || '';
    const b64 = authHeader.startsWith('Basic ') ? authHeader.slice(6) : '';
    if (!b64) return next(new Error('Unauthorized'));
    try {
      const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
      if (pass === PASSWORD) next();
      else next(new Error('Unauthorized'));
    } catch { next(new Error('Unauthorized')); }
  }
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

// ── Setup wizard check ────────────────────────────────────────────────────────
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

app.get('/api/setup/status', (req, res) => {
  const s = readState();
  res.json({ complete: !!s.setup_complete, activeBackend: s.activeBackend || 'openclaw' });
});

app.post('/api/setup/complete', (req, res) => {
  const s = readState();
  const { password, provider, apiKey, backend, channel } = req.body || {};
  if (password) {
    // Update admin password in users.json
    const users = loadUsers();
    const admin = users.find(u => u.username === 'admin');
    if (admin) {
      admin.passwordHash = bcrypt.hashSync(password, 10);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
  }
  writeState({ ...s, setup_complete: true, activeBackend: backend || s.activeBackend || 'openclaw' });
  db.addAudit('setup', 'setup_complete', 'wizard', 'ok', req.ip);
  res.json({ ok: true });
});

// ── Local AI scanner ──────────────────────────────────────────────────────────
app.get('/api/scan/local-ai', auth, async (req, res) => {
  const fetch = (await import('node-fetch')).default;
  const CANDIDATES = [
    { name: 'Ollama',     url: 'http://localhost:11434', check: '/api/tags',   type: 'ollama'    },
    { name: 'LM Studio', url: 'http://localhost:1234',  check: '/v1/models',  type: 'openai'    },
    { name: 'llama.cpp',  url: 'http://localhost:8080',  check: '/health',     type: 'llamacpp'  },
    { name: 'llama.cpp',  url: 'http://localhost:8000',  check: '/health',     type: 'llamacpp'  },
    { name: 'Hermes',     url: 'http://localhost:8642',  check: '/health',     type: 'hermes'    },
    { name: 'OpenClaw',   url: 'http://localhost:18789', check: '/health',     type: 'openclaw'  },
    { name: 'Jan AI',     url: 'http://localhost:1337',  check: '/v1/models',  type: 'openai'    },
    { name: 'GPT4All',    url: 'http://localhost:4891',  check: '/v1/models',  type: 'openai'    },
    { name: 'TabbyML',    url: 'http://localhost:8080',  check: '/v1/health',  type: 'tabby'     },
    { name: 'vLLM',       url: 'http://localhost:8000',  check: '/v1/models',  type: 'openai'    },
  ];
  const results = await Promise.all(CANDIDATES.map(async (c) => {
    try {
      const r = await fetch(c.url + c.check, { timeout: 1500 });
      if (r.ok) {
        let models = [];
        try {
          const d = await r.json();
          if (c.type === 'ollama' && d.models) models = d.models.map(m => m.name);
          else if (d.data) models = d.data.map(m => m.id);
        } catch (_) {}
        return { ...c, reachable: true, models };
      }
    } catch (_) {}
    return { ...c, reachable: false, models: [] };
  }));
  // Deduplicate by url
  const seen = new Set();
  const deduped = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
  res.json({ services: deduped });
});

// ── Conversation history ──────────────────────────────────────────────────────
app.get('/api/history', auth, (req, res) => {
  const { backend, limit = '50', offset = '0' } = req.query;
  res.json(db.getConversations({ backend, limit: parseInt(limit), offset: parseInt(offset) }));
});

app.get('/api/history/:id', auth, (req, res) => {
  const row = db.getConversation(parseInt(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.delete('/api/history/:id', auth, verifyCsrf, (req, res) => {
  db.deleteConversation(parseInt(req.params.id));
  db.addAudit(req.user?.username || 'admin', 'delete_history', req.params.id, 'ok', req.ip);
  res.json({ ok: true });
});

// ── User management ───────────────────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  const users = loadUsers().map(u => ({ username: u.username, role: u.role }));
  res.json(users);
});

app.post('/api/users', auth, verifyCsrf, async (req, res) => {
  if (req.user?.role !== 'admin' && AUTH_MODE === 'jwt') return res.status(403).json({ error: 'Admin only' });
  const { username, password, role = 'viewer' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = loadUsers();
  if (users.find(u => u.username === username)) return res.status(409).json({ error: 'User exists' });
  users.push({ username, passwordHash: bcrypt.hashSync(password, 10), role });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  db.addAudit(req.user?.username || 'admin', 'create_user', username, 'ok', req.ip);
  res.json({ ok: true });
});

app.patch('/api/users/:username', auth, verifyCsrf, async (req, res) => {
  if (req.user?.role !== 'admin' && AUTH_MODE === 'jwt') return res.status(403).json({ error: 'Admin only' });
  const { password, role } = req.body || {};
  const users = loadUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (password) user.passwordHash = bcrypt.hashSync(password, 10);
  if (role) user.role = role;
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  db.addAudit(req.user?.username || 'admin', 'update_user', req.params.username, 'ok', req.ip);
  res.json({ ok: true });
});

app.delete('/api/users/:username', auth, verifyCsrf, (req, res) => {
  if (req.user?.role !== 'admin' && AUTH_MODE === 'jwt') return res.status(403).json({ error: 'Admin only' });
  if (req.params.username === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });
  const users = loadUsers().filter(u => u.username !== req.params.username);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  db.addAudit(req.user?.username || 'admin', 'delete_user', req.params.username, 'ok', req.ip);
  res.json({ ok: true });
});

// ── MCP server management ─────────────────────────────────────────────────────
app.get('/api/mcp/servers', auth, (req, res) => {
  res.json(db.getMcpServers().map(s => ({ ...s, auth_token: s.auth_token ? '***' : null })));
});

app.post('/api/mcp/servers', auth, verifyCsrf, (req, res) => {
  const { name, url, auth_token } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  db.addMcpServer(name, url, auth_token);
  db.addAudit(req.user?.username || 'admin', 'add_mcp_server', name, 'ok', req.ip);
  res.json({ ok: true });
});

app.delete('/api/mcp/servers/:id', auth, verifyCsrf, (req, res) => {
  db.deleteMcpServer(parseInt(req.params.id));
  db.addAudit(req.user?.username || 'admin', 'delete_mcp_server', req.params.id, 'ok', req.ip);
  res.json({ ok: true });
});

app.post('/api/mcp/servers/:id/test', auth, async (req, res) => {
  const servers = db.getMcpServers();
  const server = servers.find(s => s.id === parseInt(req.params.id));
  if (!server) return res.status(404).json({ error: 'Not found' });
  try {
    const fetch = (await import('node-fetch')).default;
    const headers = {};
    if (server.auth_token) headers['Authorization'] = `Bearer ${server.auth_token}`;
    const r = await fetch(server.url, { timeout: 5000, headers });
    res.json({ ok: r.ok, status: r.status });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── ClawHub skill browser ─────────────────────────────────────────────────────
const CURATED_SKILLS = [
  { name: 'web-search',      description: 'Search the web and summarize results in chat',              category: 'Information',  installs: 22100, version: '3.0.1' },
  { name: 'reminder',        description: 'Set reminders — "remind me in 30 min to call John"',        category: 'Productivity', installs: 18400, version: '2.1.0' },
  { name: 'image-gen',       description: 'Generate images via DALL·E or Stable Diffusion',            category: 'Creative',     installs: 15700, version: '2.2.0' },
  { name: 'summarize',       description: 'Summarize URLs, PDFs, or pasted text blocks',               category: 'Productivity', installs: 16500, version: '2.4.0' },
  { name: 'todo',            description: 'Manage a personal to-do list across sessions',              category: 'Productivity', installs: 14200, version: '1.8.0' },
  { name: 'email-draft',     description: 'Draft professional emails from bullet points',              category: 'Communication',installs: 13200, version: '1.6.0' },
  { name: 'weather',         description: 'Current conditions and forecasts for any city',             category: 'Information',  installs: 19800, version: '1.5.2' },
  { name: 'daily-brief',     description: 'Morning briefing: weather + news + calendar + tasks',       category: 'Productivity', installs: 9800,  version: '1.4.0' },
  { name: 'spotify',         description: 'Play, pause, skip, and search Spotify tracks by chat',      category: 'Media',        installs: 10200, version: '1.3.0' },
  { name: 'news',            description: 'Top headlines from configurable news sources',              category: 'Information',  installs: 11300, version: '1.3.0' },
  { name: 'youtube-summary', description: 'Summarize any YouTube video from its URL',                  category: 'Media',        installs: 8400,  version: '1.2.0' },
  { name: 'calendar-sync',   description: 'Read and create Google Calendar events',                    category: 'Productivity', installs: 8900,  version: '1.4.0' },
  { name: 'proofreader',     description: 'Grammar, style, and readability improvements',              category: 'Writing',      installs: 7300,  version: '1.5.0' },
  { name: 'github-issues',   description: 'Create, list, and comment on GitHub issues by chat',        category: 'Development',  installs: 7800,  version: '1.1.0' },
  { name: 'notion-pages',    description: 'Create and append to Notion pages by chat',                 category: 'Productivity', installs: 6700,  version: '1.1.0' },
  { name: 'translate',       description: 'Translate text between 100+ languages via LibreTranslate',  category: 'Language',     installs: 9700,  version: '1.2.1' },
  { name: 'stock-ticker',    description: 'Live stock prices and basic fundamentals',                  category: 'Finance',      installs: 5800,  version: '1.0.4' },
  { name: 'crypto-price',    description: 'Real-time crypto prices and 24h change',                   category: 'Finance',      installs: 6100,  version: '1.1.0' },
  { name: 'system-monitor',  description: 'Report CPU, RAM, disk usage on your server',               category: 'DevOps',       installs: 5200,  version: '1.2.0' },
  { name: 'docker-manager',  description: 'List, start, and stop containers by chat',                  category: 'DevOps',       installs: 4100,  version: '1.0.1' },
  { name: 'home-assistant',  description: 'Control Home Assistant devices and automations',            category: 'Smart Home',   installs: 3700,  version: '2.0.0' },
  { name: 'expense-tracker', description: 'Log expenses by message, export weekly CSV',               category: 'Finance',      installs: 4200,  version: '1.0.1' },
  { name: 'code-review',     description: 'Paste code, get a review with improvement suggestions',    category: 'Development',  installs: 5400,  version: '1.0.3' },
  { name: 'tweet-draft',     description: 'Draft and schedule tweets with tone options',               category: 'Social',       installs: 4900,  version: '1.0.2' },
];

app.get('/api/skills', auth, async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const category = req.query.category || '';
  try {
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(`https://hub.openclaw.ai/api/skills?limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`, { timeout: 4000 });
    if (r.ok) return res.json(await r.json());
  } catch (_) {}
  let skills = CURATED_SKILLS;
  if (q) skills = skills.filter(s => s.name.includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  if (category) skills = skills.filter(s => s.category === category);
  res.json({ skills, source: 'curated', total: skills.length });
});

app.get('/api/skills/installed', auth, async (req, res) => {
  try {
    const container = docker.getContainer('openclaw');
    const ex = await container.exec({ Cmd: ['openclaw', 'skill', 'list', '--json'], AttachStdout: true, AttachStderr: true });
    const stream = await ex.start({ hijack: true, stdin: false });
    let out = '';
    stream.on('data', (chunk) => { out += chunk.slice(8).toString('utf8'); });
    stream.on('end', () => { try { res.json(JSON.parse(out)); } catch { res.json({ skills: [] }); } });
  } catch { res.json({ skills: [] }); }
});

app.post('/api/skills/install', auth, verifyCsrf, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !/^[a-z0-9_-]{1,64}$/.test(name)) return res.status(400).json({ error: 'Invalid skill name' });
  db.addAudit(req.user?.username || 'admin', 'install_skill', name, 'started', req.ip);
  try {
    const container = docker.getContainer('openclaw');
    const ex = await container.exec({ Cmd: ['openclaw', 'skill', 'install', name], AttachStdout: true, AttachStderr: true });
    const stream = await ex.start({ hijack: true, stdin: false });
    let out = '';
    stream.on('data', (chunk) => { out += chunk.slice(8).toString('utf8'); });
    stream.on('end', () => {
      db.addAudit(req.user?.username || 'admin', 'install_skill', name, 'ok', req.ip);
      res.json({ ok: true, output: out });
    });
    stream.on('error', (e) => res.status(500).json({ error: e.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Routing rules ─────────────────────────────────────────────────────────────
app.get('/api/routing', auth, (req, res) => { res.json(db.getRoutingRules()); });

app.post('/api/routing', auth, verifyCsrf, (req, res) => {
  const { condition_type, condition_value, target_model, target_backend, priority = 0 } = req.body || {};
  if (!condition_type || !condition_value || !target_model) return res.status(400).json({ error: 'condition_type, condition_value, target_model required' });
  db.addRoutingRule(condition_type, condition_value, target_model, target_backend, priority);
  res.json({ ok: true });
});

app.delete('/api/routing/:id', auth, verifyCsrf, (req, res) => {
  db.deleteRoutingRule(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── Presets ───────────────────────────────────────────────────────────────────
app.get('/api/presets', auth, (req, res) => { res.json(db.getPresets()); });

app.post('/api/presets', auth, verifyCsrf, (req, res) => {
  const { name, system_prompt, model, channel } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  db.addPreset(name, system_prompt, model, channel);
  res.json({ ok: true });
});

app.delete('/api/presets/:id', auth, verifyCsrf, (req, res) => {
  db.deletePreset(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── Audit log ─────────────────────────────────────────────────────────────────
app.get('/api/audit', auth, (req, res) => {
  const { limit = '100', offset = '0' } = req.query;
  res.json(db.getAuditLog({ limit: parseInt(limit), offset: parseInt(offset) }));
});

// ── Notifications ─────────────────────────────────────────────────────────────
app.get('/api/notifications', auth, (req, res) => {
  res.json({ notifications: db.getNotifications(), unread: db.getUnreadCount() });
});

app.post('/api/notifications/:id/read', auth, (req, res) => {
  if (req.params.id === 'all') db.markAllRead();
  else db.markRead(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── 7-day metrics ─────────────────────────────────────────────────────────────
app.get('/api/metrics/history', auth, (req, res) => {
  res.json(db.getMetrics7Days());
});

// ── Restore backup ────────────────────────────────────────────────────────────
app.post('/api/restore', auth, verifyCsrf, (req, res) => {
  // Streams are complex; inform client of the manual approach for now
  res.json({ ok: false, error: 'Restore via: docker run --rm -v <volume>:/data alpine tar xzf - < backup.tar.gz' });
});

httpServer.listen(PORT, () => console.log(`SelfClawy dashboard running at http://localhost:${PORT}`));
