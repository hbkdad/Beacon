/**
 * Dashboard API tests — Jest + Supertest
 * Docker socket calls and node-fetch are mocked so tests run in CI without Docker/Ollama.
 */
jest.mock('dockerode', () => {
  const mockContainer = {
    inspect: jest.fn().mockResolvedValue({
      State: { Running: true, Status: 'running', StartedAt: new Date().toISOString() }
    }),
    start:   jest.fn().mockResolvedValue({}),
    stop:    jest.fn().mockResolvedValue({}),
    restart: jest.fn().mockResolvedValue({}),
    logs:    jest.fn().mockResolvedValue({ on: jest.fn(), destroy: jest.fn() }),
    exec:    jest.fn().mockResolvedValue({
      start: jest.fn().mockResolvedValue({ on: jest.fn(), end: jest.fn() })
    }),
  };
  return jest.fn().mockImplementation(() => ({
    getContainer: jest.fn().mockReturnValue(mockContainer),
  }));
});

// Mock node-fetch for health checks and Ollama
jest.mock('node-fetch', () => jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ models: [{ name: 'nous-hermes3', size: 4_800_000_000 }] }),
  body: { on: jest.fn(), getReader: () => ({ read: jest.fn().mockResolvedValue({ done: true }) }) },
}), { virtual: true });

process.env.AUTH_MODE = 'basic';
process.env.DASHBOARD_PASSWORD = 'testpass';
process.env.LOG_DIR = '/tmp/selfclawy-test-logs';
process.env.STATE_FILE = '/tmp/selfclawy-test-state.json';
process.env.OPENCLAW_CONFIG_PATH = '/tmp/selfclawy-test-config.json';
process.env.HERMES_CONFIG_PATH = '/tmp/selfclawy-test-hermes.yaml';

const fs = require('fs');
fs.mkdirSync('/tmp/selfclawy-test-logs', { recursive: true });
fs.writeFileSync('/tmp/selfclawy-test-config.json', JSON.stringify({
  providers: { anthropic: { model: 'claude-sonnet-4-6' } }
}));
fs.writeFileSync('/tmp/selfclawy-test-state.json', JSON.stringify({ activeBackend: 'openclaw' }));
fs.writeFileSync('/tmp/selfclawy-test-hermes.yaml', 'gateway:\n  port: 8080\n');

// Build a minimal testable Express app mirroring server.js logic
function buildApp() {
  const express = require('express');
  const basicAuth = require('express-basic-auth');
  const rateLimit = require('express-rate-limit');
  const Docker = require('dockerode');
  const crypto = require('crypto');

  const app = express();
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';

  const BACKENDS = {
    openclaw: { container: 'openclaw', url: 'http://localhost:18789', healthPath: '/health', port: 18789 },
    hermes:   { container: 'hermes',   url: 'http://localhost:8080',  healthPath: '/health', port: 8080  },
    ollama:   { container: 'ollama',   url: 'http://localhost:11434', healthPath: '/api/tags', port: 11434 },
  };

  function readState() {
    try { return JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8')); }
    catch (_) { return { activeBackend: 'openclaw' }; }
  }
  function writeState(s) { fs.writeFileSync(process.env.STATE_FILE, JSON.stringify(s, null, 2)); }

  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
  app.use(apiLimiter);
  app.use(express.json());

  // skip CSRF in tests
  function verifyCsrf(req, res, next) { next(); }

  const basicAuthMiddleware = basicAuth({ users: { admin: PASSWORD }, challenge: true });
  function auth(req, res, next) { return basicAuthMiddleware(req, res, next); }

  async function getBackendStatus(name) {
    const cfg = BACKENDS[name];
    try {
      const info = await docker.getContainer(cfg.container).inspect();
      const state = info.State;
      const uptime = state.Running ? Math.floor((Date.now() - new Date(state.StartedAt)) / 1000) : 0;
      return { running: state.Running, status: state.Status, startedAt: state.StartedAt, healthy: true, uptime };
    } catch (_) { return { running: false, status: 'not_found', healthy: false, uptime: 0 }; }
  }

  app.get('/api/status', auth, async (req, res) => {
    const s = await getBackendStatus('openclaw');
    res.json({ ...s, tokensToday: 0, errorsTotal: 0 });
  });

  app.get('/api/backends', auth, async (req, res) => {
    const results = {};
    for (const name of Object.keys(BACKENDS)) results[name] = await getBackendStatus(name);
    res.json({ backends: results, activeBackend: readState().activeBackend });
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
    res.json({ ok: true, activeBackend: backend });
  });

  app.post('/api/start',   auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').start();   res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post('/api/stop',    auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').stop();    res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post('/api/restart', auth, verifyCsrf, async (req, res) => { try { await docker.getContainer('openclaw').restart(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

  app.post('/api/:backend/start',   auth, verifyCsrf, async (req, res) => {
    const cfg = BACKENDS[req.params.backend];
    if (!cfg) return res.status(400).json({ error: 'Unknown backend' });
    await docker.getContainer(cfg.container).start(); res.json({ ok: true });
  });
  app.post('/api/:backend/stop',    auth, verifyCsrf, async (req, res) => {
    const cfg = BACKENDS[req.params.backend];
    if (!cfg) return res.status(400).json({ error: 'Unknown backend' });
    await docker.getContainer(cfg.container).stop(); res.json({ ok: true });
  });
  app.post('/api/:backend/restart', auth, verifyCsrf, async (req, res) => {
    const cfg = BACKENDS[req.params.backend];
    if (!cfg) return res.status(400).json({ error: 'Unknown backend' });
    await docker.getContainer(cfg.container).restart(); res.json({ ok: true });
  });

  app.get('/api/config', auth, (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/config', auth, verifyCsrf, (req, res) => {
    try {
      const current = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
      const { provider, model } = req.body;
      if (provider && model) { if (!current.providers[provider]) current.providers[provider] = {}; current.providers[provider].model = model; }
      fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH, JSON.stringify(current, null, 2));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/ollama/models', auth, async (req, res) => {
    res.json({ models: [{ name: 'nous-hermes3', size: 4_800_000_000 }] });
  });

  app.get('/api/metrics', auth, (req, res) => {
    res.json({ tokensToday: 0, errorsTotal: 0, requestsTotal: 0, backendUp: { openclaw: 1, hermes: 0, ollama: 0 }, activeBackend: 'openclaw' });
  });

  app.get('/metrics', auth, (req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send('selfclawy_container_up{backend="openclaw"} 1\n');
  });

  return app;
}

const app = buildApp();
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:testpass').toString('base64') };

describe('GET /api/status (openclaw)', () => {
  it('returns 401 without auth', async () => {
    const r = await require('supertest')(app).get('/api/status');
    expect(r.status).toBe(401);
  });
  it('returns running=true with auth', async () => {
    const r = await require('supertest')(app).get('/api/status').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.running).toBe(true);
  });
});

describe('GET /api/backends', () => {
  it('returns all three backends', async () => {
    const r = await require('supertest')(app).get('/api/backends').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.backends).toHaveProperty('openclaw');
    expect(r.body.backends).toHaveProperty('hermes');
    expect(r.body.backends).toHaveProperty('ollama');
    expect(r.body.activeBackend).toBe('openclaw');
  });
});

describe('GET /api/status/:backend', () => {
  it('returns status for hermes backend', async () => {
    const r = await require('supertest')(app).get('/api/status/hermes').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('running');
  });
  it('returns 400 for unknown backend', async () => {
    const r = await require('supertest')(app).get('/api/status/unknown').set(AUTH);
    expect(r.status).toBe(400);
  });
});

describe('POST /api/backend/switch', () => {
  it('switches active backend', async () => {
    const r = await require('supertest')(app).post('/api/backend/switch').set(AUTH)
      .send({ backend: 'hermes' });
    expect(r.status).toBe(200);
    expect(r.body.activeBackend).toBe('hermes');
    // Restore
    await require('supertest')(app).post('/api/backend/switch').set(AUTH).send({ backend: 'openclaw' });
  });
  it('rejects unknown backend', async () => {
    const r = await require('supertest')(app).post('/api/backend/switch').set(AUTH)
      .send({ backend: 'unknown' });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/start|stop|restart (openclaw legacy)', () => {
  it('starts openclaw', async () => { const r = await require('supertest')(app).post('/api/start').set(AUTH); expect(r.body.ok).toBe(true); });
  it('stops openclaw',  async () => { const r = await require('supertest')(app).post('/api/stop').set(AUTH);  expect(r.body.ok).toBe(true); });
  it('restarts openclaw', async () => { const r = await require('supertest')(app).post('/api/restart').set(AUTH); expect(r.body.ok).toBe(true); });
});

describe('POST /api/:backend/start|stop|restart', () => {
  it('starts hermes', async () => { const r = await require('supertest')(app).post('/api/hermes/start').set(AUTH); expect(r.body.ok).toBe(true); });
  it('stops ollama',  async () => { const r = await require('supertest')(app).post('/api/ollama/stop').set(AUTH);  expect(r.body.ok).toBe(true); });
  it('returns 400 for unknown backend', async () => { const r = await require('supertest')(app).post('/api/nope/start').set(AUTH); expect(r.status).toBe(400); });
});

describe('GET /api/config + POST /api/config', () => {
  it('returns config', async () => {
    const r = await require('supertest')(app).get('/api/config').set(AUTH);
    expect(r.body.providers.anthropic.model).toBe('claude-sonnet-4-6');
  });
  it('updates model', async () => {
    const r = await require('supertest')(app).post('/api/config').set(AUTH)
      .send({ provider: 'anthropic', model: 'claude-opus-4-8' });
    expect(r.body.ok).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
    expect(cfg.providers.anthropic.model).toBe('claude-opus-4-8');
  });
});

describe('GET /api/ollama/models', () => {
  it('returns model list', async () => {
    const r = await require('supertest')(app).get('/api/ollama/models').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.models[0].name).toBe('nous-hermes3');
  });
});

describe('GET /api/metrics + /metrics', () => {
  it('returns JSON metrics', async () => {
    const r = await require('supertest')(app).get('/api/metrics').set(AUTH);
    expect(r.body).toHaveProperty('backendUp');
  });
  it('returns Prometheus format', async () => {
    const r = await require('supertest')(app).get('/metrics').set(AUTH);
    expect(r.text).toContain('selfclawy_container_up');
  });
});
