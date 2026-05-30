const express = require('express');
const basicAuth = require('express-basic-auth');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const PORT = process.env.DASHBOARD_PORT || 3001;
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const OPENCLAW_CONTAINER = 'openclaw';
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';
const AUTH_MODE = process.env.AUTH_MODE || 'basic';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || '/config/openclaw.json';
const LOG_DIR = process.env.LOG_DIR || '/data/logs';
const USERS_FILE = path.join(__dirname, 'users.json');

// ── Persistent log dir ──────────────────────────────────────────────────────
if (!fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}
}

function getLogStream() {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `openclaw-${date}.log`);
  return fs.createWriteStream(file, { flags: 'a' });
}

// ── In-memory metrics ────────────────────────────────────────────────────────
const metrics = { tokensToday: 0, errorsTotal: 0, requestsTotal: 0, containerUp: 0, uptimeSeconds: 0 };
const TOKEN_RE = /tokens?[:\s]+(\d+)/i;

// ── Webhook alerting ─────────────────────────────────────────────────────────
let lastContainerState = null;

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

// ── User store (JWT mode) ────────────────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const hash = bcrypt.hashSync(PASSWORD, 10);
    const users = [{ username: 'admin', passwordHash: hash, role: 'admin' }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return users;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

// ── Rate limiters ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// ── CSRF (double-submit cookie) ───────────────────────────────────────────────
function setCsrfCookie(req, res, next) {
  if (!req.cookies || !req.cookies['csrf-token']) {
    const token = crypto.randomBytes(24).toString('hex');
    res.setHeader('Set-Cookie', `csrf-token=${token}; SameSite=Strict; Path=/`);
  }
  next();
}

function verifyCsrf(req, res, next) {
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/csrf-token=([a-f0-9]+)/);
  const cookieToken = match ? match[1] : null;
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function jwtAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

const basicAuthMiddleware = basicAuth({ users: { admin: PASSWORD }, challenge: true, realm: 'SelfClawy Dashboard' });

function auth(req, res, next) {
  if (AUTH_MODE === 'jwt') return jwtAuth(req, res, next);
  return basicAuthMiddleware(req, res, next);
}

// ── Middleware stack ──────────────────────────────────────────────────────────
app.use(apiLimiter);
app.use(express.json());
app.use(setCsrfCookie);
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes (public) ──────────────────────────────────────────────────────
app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// ── Protected API routes ──────────────────────────────────────────────────────
app.get('/api/status', auth, async (req, res) => {
  metrics.requestsTotal++;
  try {
    const container = docker.getContainer(OPENCLAW_CONTAINER);
    const info = await container.inspect();
    const state = info.State;
    let healthy = false;
    try {
      const fetch = (await import('node-fetch')).default;
      const r = await fetch(`${OPENCLAW_URL}/health`, { timeout: 3000 });
      healthy = r.ok;
    } catch (_) {}
    const uptime = state.Running ? Math.floor((Date.now() - new Date(state.StartedAt)) / 1000) : 0;
    metrics.containerUp = state.Running ? 1 : 0;
    metrics.uptimeSeconds = uptime;

    const nowRunning = state.Running && healthy;
    if (lastContainerState !== null && lastContainerState !== nowRunning) {
      sendAlert(nowRunning
        ? '🟢 SelfClawy: OpenClaw is back online!'
        : '🔴 SelfClawy: OpenClaw went offline!');
    }
    lastContainerState = nowRunning;

    res.json({ running: state.Running, status: state.Status, startedAt: state.StartedAt, healthy, uptime,
      tokensToday: metrics.tokensToday, errorsTotal: metrics.errorsTotal });
  } catch (err) {
    metrics.containerUp = 0;
    res.json({ running: false, status: 'not_found', healthy: false, uptime: 0,
      tokensToday: metrics.tokensToday, errorsTotal: metrics.errorsTotal });
  }
});

app.post('/api/start',   auth, verifyCsrf, async (req, res) => { try { await docker.getContainer(OPENCLAW_CONTAINER).start();   res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/stop',    auth, verifyCsrf, async (req, res) => { try { await docker.getContainer(OPENCLAW_CONTAINER).stop();    res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/restart', auth, verifyCsrf, async (req, res) => { try { await docker.getContainer(OPENCLAW_CONTAINER).restart(); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ── Config routes (model switcher) ────────────────────────────────────────────
app.get('/api/config', auth, (req, res) => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'Cannot read config: ' + err.message });
  }
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
  } catch (err) {
    res.status(500).json({ error: 'Cannot write config: ' + err.message });
  }
});

// ── Metrics endpoints ─────────────────────────────────────────────────────────
app.get('/api/metrics', auth, (req, res) => {
  res.json(metrics);
});

app.get('/metrics', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send([
    `# HELP selfclawy_container_up Whether the openclaw container is running`,
    `# TYPE selfclawy_container_up gauge`,
    `selfclawy_container_up ${metrics.containerUp}`,
    `# HELP selfclawy_uptime_seconds Container uptime in seconds`,
    `# TYPE selfclawy_uptime_seconds gauge`,
    `selfclawy_uptime_seconds ${metrics.uptimeSeconds}`,
    `# HELP selfclawy_tokens_today Tokens used today (parsed from logs)`,
    `# TYPE selfclawy_tokens_today counter`,
    `selfclawy_tokens_today ${metrics.tokensToday}`,
    `# HELP selfclawy_errors_total Log error lines counted`,
    `# TYPE selfclawy_errors_total counter`,
    `selfclawy_errors_total ${metrics.errorsTotal}`,
    `# HELP selfclawy_requests_total Dashboard API requests`,
    `# TYPE selfclawy_requests_total counter`,
    `selfclawy_requests_total ${metrics.requestsTotal}`,
  ].join('\n'));
});

// ── Backup route ──────────────────────────────────────────────────────────────
app.post('/api/backup', auth, verifyCsrf, (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `openclaw-backup-${date}.tar.gz`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/gzip');
  const child = exec(
    `docker run --rm -v openclaw_data:/data alpine tar czf - -C /data .`,
    { encoding: 'buffer' }
  );
  child.stdout.pipe(res);
  child.stderr.on('data', () => {});
  child.on('error', (err) => res.status(500).end(err.message));
});

// ── Socket.io — live logs + log persistence ───────────────────────────────────
io.on('connection', (socket) => {
  let logStream = null;
  let fileStream = null;

  socket.on('subscribe-logs', async () => {
    try {
      fileStream = getLogStream();
      const container = docker.getContainer(OPENCLAW_CONTAINER);
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
  });

  socket.on('disconnect', () => {
    if (logStream) logStream.destroy();
    if (fileStream) fileStream.end();
  });
});

httpServer.listen(PORT, () => console.log(`SelfClawy dashboard running at http://localhost:${PORT}`));
