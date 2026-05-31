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

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.DASHBOARD_PORT || 3001;
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const HERMES_URL   = process.env.HERMES_URL   || 'http://localhost:8080';
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const STATE_FILE   = process.env.STATE_FILE   || '/data/state.json';
const LOG_DIR      = process.env.LOG_DIR      || '/data/logs';
const USERS_FILE   = process.env.USERS_FILE   || '/data/users.json';
const AUTH_MODE    = process.env.AUTH_MODE    || 'basic';
const JWT_SECRET   = process.env.JWT_SECRET   || crypto.randomBytes(32).toString('hex');
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';
const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || '/config/openclaw.json';

const BACKENDS = {
  openclaw: { url: OPENCLAW_URL, healthPath: '/health' },
  hermes:   { url: HERMES_URL,   healthPath: '/health' },
  ollama:   { url: OLLAMA_URL,   healthPath: '/api/tags' },
};

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ── Rate limiters ──────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/', apiLimiter);

// ── CSRF ──────────────────────────────────────────────────────────────────
function generateCsrf() {
  return crypto.randomBytes(24).toString('hex');
}
function verifyCsrf(req, res, next) {
  const header = req.headers['x-csrf-token'];
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('csrf_token='));
  const cookieVal = cookie ? cookie.split('=')[1] : null;
  if (!header || !cookieVal || header !== cookieVal) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

// ── State helpers ──────────────────────────────────────────────────────────
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { activeBackend: 'openclaw', setup_complete: false }; }
}
function writeState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch {}
}

// ── Users helpers ──────────────────────────────────────────────────────────
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return [{ username: 'admin', passwordHash: bcrypt.hashSync(process.env.DASHBOARD_PASSWORD || 'changeme', 10), role: 'admin' }]; }
}
function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Auth middleware ────────────────────────────────────────────────────────
function basicAuthMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) return res.status(401).set('WWW-Authenticate', 'Basic').json({ error: 'Unauthorized' });
  const [user, pass] = Buffer.from(header.slice(6), 'base64').toString().split(':');
  const users = loadUsers();
  const found = users.find(u => u.username === user && bcrypt.compareSync(pass, u.passwordHash));
  if (!found) return res.status(401).set('WWW-Authenticate', 'Basic').json({ error: 'Unauthorized' });
  req.user = found;
  next();
}
function jwtAuthMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
const auth = AUTH_MODE === 'jwt' ? jwtAuthMiddleware : basicAuthMiddleware;

// ── CSRF token endpoint (no auth required) ────────────────────────────────
app.get('/api/csrf-token', (req, res) => {
  const token = generateCsrf();
  res.cookie('csrf_token', token, { httpOnly: false, sameSite: 'strict' });
  res.json({ token });
});

// ── JWT login ─────────────────────────────────────────────────────────────
app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const user = users.find(u => u.username === username && bcrypt.compareSync(password, u.passwordHash));
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  db.addAudit(user.username, 'login', 'auth', 'ok', req.ip);
  res.json({ token });
});

// ── Setup wizard ───────────────────────────────────────────────────────────
app.get('/api/setup/status', (req, res) => {
  const s = readState();
  res.json({ complete: !!s.setup_complete });
});

app.post('/api/setup/complete', authLimiter, (req, res) => {
  const s = readState();
  if (s.setup_complete) return res.status(403).json({ error: 'Setup already complete' });
  const { password, backend } = req.body || {};
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

// ── Local AI scanner ───────────────────────────────────────────────────────
app.get('/api/scan/local-ai', auth, async (req, res) => {
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
      const r = await fetch(c.url + c.check, { signal: AbortSignal.timeout(1500) });
      return { ...c, online: r.ok || r.status < 500 };
    } catch {
      return { ...c, online: false };
    }
  }));
  res.json(results.filter(r => r.online));
});

// ── Version ────────────────────────────────────────────────────────────────
let versionCache = null;
let versionCacheAt = 0;
app.get('/api/version', async (req, res) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const current = pkg.version;
  const now = Date.now();
  if (!versionCache || now - versionCacheAt > 3_600_000) {
    try {
      const r = await fetch('https://api.github.com/repos/hbkdad/selfclawy/releases/latest',
        { headers: { 'User-Agent': 'beacon-dashboard' }, signal: AbortSignal.timeout(5000) });
      if (r.ok) { versionCache = (await r.json()).tag_name?.replace(/^v/, '') || current; }
    } catch { versionCache = current; }
    versionCacheAt = now;
  }
  res.json({ current, latest: versionCache, updateAvailable: versionCache !== current });
});

// ── Backends status ────────────────────────────────────────────────────────
async function checkBackend(name) {
  const b = BACKENDS[name];
  if (!b) return { online: false };
  try {
    const r = await fetch(b.url + b.healthPath, { signal: AbortSignal.timeout(3000) });
    return { online: r.ok || r.status < 500, status: r.status };
  } catch {
    return { online: false };
  }
}

app.get('/api/status', auth, async (req, res) => {
  const s = await checkBackend('openclaw');
  res.json(s);
});

app.get('/api/backends', auth, async (req, res) => {
  const state = readState();
  const results = await Promise.all(Object.keys(BACKENDS).map(async n => {
    const s = await checkBackend(n);
    return [n, s];
  }));
  res.json({ backends: Object.fromEntries(results), activeBackend: state.activeBackend || 'openclaw' });
});

app.get('/api/status/:backend', auth, async (req, res) => {
  const { backend } = req.params;
  if (!BACKENDS[backend]) return res.status(404).json({ error: 'Unknown backend' });
  res.json(await checkBackend(backend));
});

app.post('/api/backend/switch', auth, verifyCsrf, (req, res) => {
  const { backend } = req.body || {};
  if (!BACKENDS[backend]) return res.status(400).json({ error: 'Unknown backend' });
  const s = readState();
  writeState({ ...s, activeBackend: backend });
  db.addAudit(req.user?.username || 'unknown', 'backend_switch', backend, 'ok', req.ip);
  res.json({ ok: true, activeBackend: backend });
});

// ── Container controls ─────────────────────────────────────────────────────
async function containerAction(name, action) {
  const c = docker.getContainer(name);
  switch (action) {
    case 'start':   await c.start();   break;
    case 'stop':    await c.stop();    break;
    case 'restart': await c.restart(); break;
    default: throw new Error('Unknown action');
  }
}

const CONTAINER_MAP = { openclaw: 'openclaw', hermes: 'hermes', ollama: 'ollama' };

['start', 'stop', 'restart'].forEach(action => {
  app.post(`/api/${action}`, auth, verifyCsrf, async (req, res) => {
    try {
      await containerAction('openclaw', action);
      db.addAudit(req.user?.username || 'unknown', action, 'openclaw', 'ok', req.ip);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post(`/api/:backend/${action}`, auth, verifyCsrf, async (req, res) => {
    const { backend } = req.params;
    const container = CONTAINER_MAP[backend];
    if (!container) return res.status(404).json({ error: 'Unknown backend' });
    try {
      await containerAction(container, action);
      db.addAudit(req.user?.username || 'unknown', action, backend, 'ok', req.ip);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// ── Logs via Socket.io ─────────────────────────────────────────────────────
io.use((socket, next) => {
  const { authorization } = socket.handshake.headers;
  if (AUTH_MODE === 'jwt') {
    if (!authorization?.startsWith('Bearer ')) return next(new Error('Unauthorized'));
    try { socket.user = jwt.verify(authorization.slice(7), JWT_SECRET); next(); }
    catch { next(new Error('Invalid token')); }
  } else {
    if (!authorization?.startsWith('Basic ')) return next(new Error('Unauthorized'));
    const [user, pass] = Buffer.from(authorization.slice(6), 'base64').toString().split(':');
    const users = loadUsers();
    const found = users.find(u => u.username === user && bcrypt.compareSync(pass, u.passwordHash));
    if (!found) return next(new Error('Unauthorized'));
    socket.user = found;
    next();
  }
});

io.on('connection', (socket) => {
  socket.on('subscribe_logs', async ({ backend = 'openclaw' } = {}) => {
    const container = CONTAINER_MAP[backend] || 'openclaw';
    try {
      const c = docker.getContainer(container);
      const stream = await c.logs({ stdout: true, stderr: true, tail: 100, follow: true });
      stream.on('data', chunk => socket.emit('log', { backend, line: chunk.toString('utf8') }));
      stream.on('end', () => socket.emit('log_end', { backend }));
      socket.on('disconnect', () => stream.destroy());
    } catch (e) {
      socket.emit('log_error', { backend, error: e.message });
    }
  });
});

// ── Config ─────────────────────────────────────────────────────────────────
app.get('/api/config', auth, (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', auth, verifyCsrf, (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    if (req.body.model) config.model = req.body.model;
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
    db.addAudit(req.user?.username || 'unknown', 'config_update', 'openclaw', 'ok', req.ip);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Ollama models ──────────────────────────────────────────────────────────
app.get('/api/ollama/models', auth, async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(r.status).json({ error: 'Ollama error' });
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.post('/api/ollama/pull', auth, verifyCsrf, async (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  try {
    const r = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST', body: JSON.stringify({ name: model }), signal: AbortSignal.timeout(300_000),
      headers: { 'Content-Type': 'application/json' },
    });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(`data: ${dec.decode(value)}\n\n`);
    }
    res.end();
  } catch (e) { res.write(`data: {"error":"${e.message}"}\n\n`); res.end(); }
});

// ── Hermes migrate ─────────────────────────────────────────────────────────
app.post('/api/hermes/migrate', auth, verifyCsrf, async (req, res) => {
  try {
    const c = docker.getContainer('hermes');
    const exec = await c.exec({ Cmd: ['hermes', 'claw', 'migrate'], AttachStdout: true, AttachStderr: true });
    const stream = await exec.start();
    let out = '';
    stream.on('data', chunk => { out += chunk.toString('utf8'); });
    stream.on('end', () => res.json({ ok: true, output: out }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Skills ─────────────────────────────────────────────────────────────────
const SKILL_FALLBACK = [
  { name: 'web-search',     description: 'Search the web',                   category: 'utility',     installs: 95000 },
  { name: 'github',         description: 'Interact with GitHub repos',        category: 'dev',         installs: 80000 },
  { name: 'filesystem',     description: 'Read and write local files',        category: 'utility',     installs: 75000 },
  { name: 'sqlite',         description: 'Query SQLite databases',            category: 'data',        installs: 42000 },
  { name: 'code-review',    description: 'Review code for issues and style',  category: 'dev',         installs: 38000 },
  { name: 'summarize',      description: 'Summarize long documents',          category: 'productivity',installs: 30000 },
  { name: 'translate',      description: 'Translate text to any language',    category: 'utility',     installs: 28000 },
  { name: 'image-gen',      description: 'Generate images with Stable Diffusion', category: 'creative', installs: 22000 },
  { name: 'calendar',       description: 'Manage calendar events',            category: 'productivity',installs: 18000 },
  { name: 'email',          description: 'Read and send emails',              category: 'productivity',installs: 15000 },
];

app.get('/api/skills', auth, async (req, res) => {
  const { q, category } = req.query;
  let skills = SKILL_FALLBACK;
  if (category) skills = skills.filter(s => s.category === category);
  if (q) skills = skills.filter(s => s.name.includes(q) || s.description.toLowerCase().includes(q.toLowerCase()));
  res.json(skills);
});

app.get('/api/skills/installed', auth, async (req, res) => {
  try {
    const c = docker.getContainer('openclaw');
    const exec = await c.exec({ Cmd: ['openclaw', 'skill', 'list', '--json'], AttachStdout: true, AttachStderr: true });
    const stream = await exec.start();
    let out = '';
    stream.on('data', chunk => { out += chunk.toString('utf8'); });
    stream.on('end', () => {
      try { res.json(JSON.parse(out)); }
      catch { res.json([]); }
    });
  } catch { res.json([]); }
});

app.post('/api/skills/install', auth, verifyCsrf, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const c = docker.getContainer('openclaw');
    const execObj = await c.exec({ Cmd: ['openclaw', 'skill', 'install', name], AttachStdout: true, AttachStderr: true });
    const stream = await execObj.start();
    let out = '';
    stream.on('data', chunk => { out += chunk.toString('utf8'); });
    stream.on('end', () => {
      db.addAudit(req.user?.username || 'unknown', 'skill_install', name, 'ok', req.ip);
      res.json({ ok: true, output: out });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Conversation history ───────────────────────────────────────────────────
app.get('/api/history', auth, (req, res) => {
  const { backend, limit = 50, offset = 0 } = req.query;
  res.json(db.getHistory({ backend, limit: +limit, offset: +offset }));
});

app.get('/api/history/:id', auth, (req, res) => {
  const row = db.getHistoryById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.delete('/api/history/:id', auth, verifyCsrf, (req, res) => {
  db.deleteHistory(req.params.id);
  db.addAudit(req.user?.username || 'unknown', 'history_delete', req.params.id, 'ok', req.ip);
  res.json({ ok: true });
});

// ── Users ──────────────────────────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  const users = loadUsers().map(({ username, role }) => ({ username, role }));
  res.json(users);
});

app.post('/api/users', auth, verifyCsrf, (req, res) => {
  if (AUTH_MODE !== 'jwt') return res.status(403).json({ error: 'JWT mode only' });
  const { username, password, role = 'viewer' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = loadUsers();
  if (users.find(u => u.username === username)) return res.status(409).json({ error: 'User exists' });
  users.push({ username, passwordHash: bcrypt.hashSync(password, 10), role });
  saveUsers(users);
  db.addAudit(req.user?.username || 'unknown', 'user_create', username, 'ok', req.ip);
  res.json({ ok: true });
});

app.patch('/api/users/:username', auth, verifyCsrf, (req, res) => {
  const users = loadUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (req.body.password) user.passwordHash = bcrypt.hashSync(req.body.password, 10);
  if (req.body.role) user.role = req.body.role;
  saveUsers(users);
  db.addAudit(req.user?.username || 'unknown', 'user_update', req.params.username, 'ok', req.ip);
  res.json({ ok: true });
});

app.delete('/api/users/:username', auth, verifyCsrf, (req, res) => {
  let users = loadUsers();
  if (!users.find(u => u.username === req.params.username)) return res.status(404).json({ error: 'Not found' });
  users = users.filter(u => u.username !== req.params.username);
  saveUsers(users);
  db.addAudit(req.user?.username || 'unknown', 'user_delete', req.params.username, 'ok', req.ip);
  res.json({ ok: true });
});

// ── MCP servers ────────────────────────────────────────────────────────────
const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::1$/,
  /^localhost$/i,
];
function isPrivateUrl(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    return PRIVATE_RANGES.some(re => re.test(hostname));
  } catch { return true; }
}

app.get('/api/mcp/servers', auth, (req, res) => res.json(db.getMcpServers()));

app.post('/api/mcp/servers', auth, verifyCsrf, (req, res) => {
  const { name, url, auth_token } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  if (isPrivateUrl(url)) return res.status(400).json({ error: 'Private/loopback URLs not allowed' });
  const id = db.addMcpServer({ name, url, auth_token });
  db.addAudit(req.user?.username || 'unknown', 'mcp_add', name, 'ok', req.ip);
  res.json({ ok: true, id });
});

app.delete('/api/mcp/servers/:id', auth, verifyCsrf, (req, res) => {
  db.deleteMcpServer(req.params.id);
  db.addAudit(req.user?.username || 'unknown', 'mcp_delete', req.params.id, 'ok', req.ip);
  res.json({ ok: true });
});

app.post('/api/mcp/servers/:id/test', auth, verifyCsrf, async (req, res) => {
  const servers = db.getMcpServers();
  const server = servers.find(s => String(s.id) === req.params.id);
  if (!server) return res.status(404).json({ error: 'Not found' });
  if (isPrivateUrl(server.url)) return res.status(400).json({ error: 'Private/loopback URLs not allowed' });
  try {
    const r = await fetch(server.url, { signal: AbortSignal.timeout(5000) });
    res.json({ ok: true, status: r.status });
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

// ── Routing rules ──────────────────────────────────────────────────────────
app.get('/api/routing', auth, (req, res) => res.json(db.getRoutingRules()));

app.post('/api/routing', auth, verifyCsrf, (req, res) => {
  const { condition_type, condition_value, target_model, target_backend, priority = 0 } = req.body || {};
  if (!condition_type || !target_model) return res.status(400).json({ error: 'condition_type and target_model required' });
  const id = db.addRoutingRule({ condition_type, condition_value, target_model, target_backend, priority });
  db.addAudit(req.user?.username || 'unknown', 'routing_add', condition_type, 'ok', req.ip);
  res.json({ ok: true, id });
});

app.delete('/api/routing/:id', auth, verifyCsrf, (req, res) => {
  db.deleteRoutingRule(req.params.id);
  db.addAudit(req.user?.username || 'unknown', 'routing_delete', req.params.id, 'ok', req.ip);
  res.json({ ok: true });
});

// ── Presets ────────────────────────────────────────────────────────────────
app.get('/api/presets', auth, (req, res) => res.json(db.getPresets()));

app.post('/api/presets', auth, verifyCsrf, (req, res) => {
  const { name, system_prompt, model, channel } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = db.addPreset({ name, system_prompt, model, channel });
  db.addAudit(req.user?.username || 'unknown', 'preset_add', name, 'ok', req.ip);
  res.json({ ok: true, id });
});

app.delete('/api/presets/:id', auth, verifyCsrf, (req, res) => {
  db.deletePreset(req.params.id);
  db.addAudit(req.user?.username || 'unknown', 'preset_delete', req.params.id, 'ok', req.ip);
  res.json({ ok: true });
});

// ── Audit log ──────────────────────────────────────────────────────────────
app.get('/api/audit', auth, (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  res.json(db.getAuditLog({ limit: +limit, offset: +offset }));
});

// ── Notifications ──────────────────────────────────────────────────────────
app.get('/api/notifications', auth, (req, res) => res.json(db.getNotifications()));

app.post('/api/notifications/:id/read', auth, verifyCsrf, (req, res) => {
  db.markNotificationRead(req.params.id);
  res.json({ ok: true });
});

// ── Metrics ────────────────────────────────────────────────────────────────
let metrics = { tokens: 0, errors: 0, requests: 0 };

app.get('/api/metrics', auth, (req, res) => res.json(metrics));

app.get('/api/metrics/history', auth, (req, res) => {
  const { days = 7 } = req.query;
  res.json(db.getMetricsHistory(+days));
});

app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(
    `beacon_tokens_total ${metrics.tokens}\n` +
    `beacon_errors_total ${metrics.errors}\n` +
    `beacon_requests_total ${metrics.requests}\n`
  );
});

// ── Backup ─────────────────────────────────────────────────────────────────
app.post('/api/backup', auth, verifyCsrf, async (req, res) => {
  const { backend = 'openclaw' } = req.body || {};
  const volume = backend === 'openclaw' ? 'openclaw_data' : `${backend}_data`;
  const filename = `beacon-backup-${backend}-${Date.now()}.tar.gz`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/gzip');
  try {
    const container = await docker.createContainer({
      Image: 'alpine', Cmd: ['tar', 'czf', '-', '-C', '/data', '.'],
      HostConfig: { Binds: [`${volume}:/data:ro`], AutoRemove: true },
    });
    const stream = await container.attach({ stream: true, stdout: true, stderr: false });
    await container.start();
    stream.pipe(res);
    stream.on('end', () => res.end());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Polling: metrics + webhook alerts ─────────────────────────────────────
let lastBackendStatus = {};
setInterval(async () => {
  const state = readState();
  const active = state.activeBackend || 'openclaw';
  const s = await checkBackend(active);
  const wasOnline = lastBackendStatus[active];
  lastBackendStatus[active] = s.online;

  if (s.online) metrics.requests++;
  else metrics.errors++;

  db.upsertDailyMetrics(new Date().toISOString().slice(0, 10), active, {
    tokens: metrics.tokens,
    errors: s.online ? 0 : 1,
    requests: s.online ? 1 : 0,
  });

  if (wasOnline !== undefined && wasOnline !== s.online && ALERT_WEBHOOK_URL) {
    const msg = s.online ? `✅ ${active} is back online` : `🚨 ${active} went offline`;
    db.addNotification({ type: s.online ? 'up' : 'down', title: msg, body: '' });
    fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg, content: msg }),
    }).catch(() => {});
  }
}, 15_000);

// ── Start ──────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`Beacon dashboard listening on port ${PORT}`);
  db.init();
});

module.exports = app;
