const express = require('express');
const helmet = require('helmet');
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
const { parseLogLine } = require('./logParser');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const PORT = process.env.DASHBOARD_PORT || 3001;
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const HERMES_URL = process.env.HERMES_URL || 'http://localhost:8080';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';
const AUTH_MODE = process.env.AUTH_MODE || 'basic';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || '/config/openclaw.json';
const LOG_DIR = process.env.LOG_DIR || '/data/logs';
const STATE_FILE = process.env.STATE_FILE || '/data/state.json';
const USERS_FILE = path.join(__dirname, 'users.json');

const BACKENDS = {
  openclaw: { container: 'openclaw',  url: OPENCLAW_URL, healthPath: '/health',   port: 18789 },
  hermes:   { container: 'hermes',    url: HERMES_URL,   healthPath: '/health',   port: 8080  },
  ollama:   { container: 'ollama',    url: OLLAMA_URL,   healthPath: '/api/tags', port: 11434 },
};

for (const dir of [LOG_DIR, path.dirname(STATE_FILE)]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (_) { return { activeBackend: 'openclaw' }; }
}
function writeState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function getActiveBackend() { return readState().activeBackend || 'openclaw'; }

const metrics = { tokensToday: 0, errorsTotal: 0, requestsTotal: 0 };
const backendUp = { openclaw: 0, hermes: 0, ollama: 0 };
const backendUptime = { openclaw: 0, hermes: 0, ollama: 0 };
const TOKEN_RE = /tokens?[:\s]+(\d+)/i;
const lastState = { openclaw: null, hermes: null, ollama: null };

async function sendAlert(msg) {
  if (!ALERT_WEBHOOK_URL) return;
  try { await fetch(ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: msg, text: msg }) }); } catch (_) {}
}

async function getBackendStatus(name) {
  const cfg = BACKENDS[name];
  try {
    const container = docker.getContainer(cfg.container);
    const info = await container.inspect();
    const state = info.State;
    let healthy = false;
    if (state.Running) {
      try { const r = await fetch(`${cfg.url}${cfg.healthPath}`, { signal: AbortSignal.timeout(3000) }); healthy = r.ok; } catch (_) {}
    }
    const uptime = state.Running ? Math.floor((Date.now() - new Date(state.StartedAt)) / 1000) : 0;
    return { running: state.Running, status: state.Status, startedAt: state.StartedAt, healthy, uptime };
  } catch (_) { return { running: false, status: 'not_found', healthy: false, uptime: 0 }; }
}

setInterval(async () => {
  for (const [name, _] of Object.entries(BACKENDS)) {
    const s = await getBackendStatus(name);
    backendUp[name] = s.running ? 1 : 0;
    backendUptime[name] = s.uptime;
    const nowUp = s.running && s.healthy;
    if (lastState[name] !== null && lastState[name] !== nowUp) {
      if (nowUp) { sendAlert(`Beacon: ${name} is back online!`); db.addNotification('info', `${name} is back online`, `${name} container running`); }
      else { sendAlert(`Beacon: ${name} went offline!`); db.addNotification('alert', `${name} went offline`, `${name} container stopped`); }
    }
    lastState[name] = nowUp;
    db.upsertDailyMetrics(new Date().toISOString().slice(0, 10), name, { requests: 0 });
  }
}, 15000);

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const users = [{ username: 'admin', passwordHash: bcrypt.hashSync(PASSWORD, 10), role: 'admin' }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return users;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

function setCsrfCookie(req, res, next) {
  if (!(req.headers['cookie'] || '').includes('csrf-token=')) {
    res.setHeader('Set-Cookie', `csrf-token=${crypto.randomBytes(24).toString('hex')}; SameSite=Strict; Path=/`);
  }
  next();
}
function verifyCsrf(req, res, next) {
  const match = (req.headers['cookie'] || '').match(/csrf-token=([a-f0-9]+)/);
  const cookieToken = match ? match[1] : null;
  if (!cookieToken || cookieToken !== req.headers['x-csrf-token']) return res.status(403).json({ error: 'Invalid CSRF token' });
  next();
}

function jwtAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch (_) { res.status(401).json({ error: 'Invalid token' }); }
}
const basicAuthMiddleware = basicAuth({ users: { admin: PASSWORD }, challenge: true, realm: 'Beacon Dashboard' });
function auth(req, res, next) { return AUTH_MODE === 'jwt' ? jwtAuth(req, res, next) : basicAuthMiddleware(req, res, next); }

app.use(helmet({ contentSecurityPolicy: false }));
app.use(apiLimiter);
app.use(express.json());
app.use(setCsrfCookie);
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

app.get('/api/status', auth, async (req, res) => {
  metrics.requestsTotal++;
  const s = await getBackendStatus('openclaw');
  res.json({ ...s, tokensToday: metrics.tokensToday, errorsTotal: metrics.errorsTotal });
});

app.get('/api/backends', auth, async (req, res) => {
  const results = {};
  for (const name of Object.keys(BACKENDS)) results[name] = await getBackendStatus(name);
  res.json({ backends: results, activeBackend: getActiveBackend() });
});

app.get('/api/status/:backend', auth, async (req, res) => {
  const { backend } = req.params;
  if (!BACKENDS[backend]) return res.status(400).json({ error: 'Unknown backend' });
  res.json(await getBackendStatus(backend));
});

app.post('/api/backend/switch', auth, verifyCsrf, (req, res) => {
  const { backend } = req.body || {};
  if (!BACKENDS[backend]) return res.status(400).json({ error: 'Unknown backend: ' + backend });
  writeState({ activeBackend: backend });
  io.emit('backend-changed', { activeBackend: backend });
  res.json({ ok: true, activeBackend: backend });
});

app.post('/api/start',   auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').start();   res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/stop',    auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').stop();    res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/restart', auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').restart(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/metrics/by-model', auth, (req, res) => {
  const rows = db.getDb().prepare(
    `SELECT model, COUNT(*) as requests, SUM(tokens) as tokens FROM conversations WHERE model IS NOT NULL AND model != '' GROUP BY model ORDER BY tokens DESC`
  ).all();
  res.json(rows);
});

app.get('/api/metrics/history', auth, (req, res) => { res.json(db.getMetrics7Days()); });

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

app.get('/api/notifications', auth, (req, res) => {
  res.json({ notifications: db.getNotifications(), unread: db.getUnreadCount() });
});

app.post('/api/notifications/:id/read', auth, (req, res) => {
  if (req.params.id === 'all') db.markAllRead();
  else db.markRead(parseInt(req.params.id));
  res.json({ ok: true });
});

app.get('/api/audit', auth, (req, res) => {
  const { limit = '100', offset = '0' } = req.query;
  res.json(db.getAuditLog({ limit: parseInt(limit), offset: parseInt(offset) }));
});

app.get('/api/setup/status', (req, res) => {
  const s = readState();
  res.json({ complete: !!s.setup_complete, activeBackend: s.activeBackend || 'openclaw' });
});

app.post('/api/setup/complete', (req, res) => {
  const s = readState();
  if (s.setup_complete) return res.status(403).json({ error: 'Setup already complete' });
  const { password, backend } = req.body || {};
  if (password) {
    const users = loadUsers();
    const admin = users.find(u => u.username === 'admin');
    if (admin) { admin.passwordHash = bcrypt.hashSync(password, 10); fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
  }
  writeState({ ...s, setup_complete: true, activeBackend: backend || s.activeBackend || 'openclaw' });
  db.addAudit('setup', 'setup_complete', 'wizard', 'ok', req.ip);
  res.json({ ok: true });
});

app.get('/metrics', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  const lines = [
    '# HELP beacon_container_up Whether the backend container is running',
    '# TYPE beacon_container_up gauge',
    ...Object.entries(backendUp).map(([b, v]) => `beacon_container_up{backend="${b}"} ${v}`),
    '# HELP beacon_tokens_today Tokens used today',
    '# TYPE beacon_tokens_today counter',
    `beacon_tokens_today ${metrics.tokensToday}`,
  ];
  res.send(lines.join('\n'));
});

const pkg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'package.json'), 'utf8'));
let _latestCache = null, _latestFetchedAt = 0;
app.get('/api/version', auth, async (req, res) => {
  const current = pkg.version;
  const now = Date.now();
  if (!_latestCache || now - _latestFetchedAt > 3600_000) {
    try {
      const r = await fetch('https://api.github.com/repos/hbkdad/selfclawy/releases/latest', { headers: { 'User-Agent': 'beacon-dashboard' }, signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      _latestCache = (j.tag_name || '').replace(/^v/, '');
      _latestFetchedAt = now;
    } catch (_) { _latestCache = null; }
  }
  res.json({ current, latest: _latestCache, updateAvailable: _latestCache && _latestCache !== current });
});

httpServer.listen(PORT, () => console.log(`Beacon dashboard running at http://localhost:${PORT}`));
