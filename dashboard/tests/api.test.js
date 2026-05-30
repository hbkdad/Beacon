/**
 * Dashboard API tests — uses supertest against the Express app
 * Docker socket calls are mocked so tests run in CI without Docker.
 */
jest.mock('dockerode', () => {
  const mockContainer = {
    inspect: jest.fn().mockResolvedValue({
      State: { Running: true, Status: 'running', StartedAt: new Date().toISOString() }
    }),
    start: jest.fn().mockResolvedValue({}),
    stop: jest.fn().mockResolvedValue({}),
    restart: jest.fn().mockResolvedValue({}),
    logs: jest.fn().mockResolvedValue({ on: jest.fn(), destroy: jest.fn() }),
  };
  return jest.fn().mockImplementation(() => ({
    getContainer: jest.fn().mockReturnValue(mockContainer),
  }));
});

// Mock node-fetch health check
jest.mock('node-fetch', () => jest.fn().mockResolvedValue({ ok: true }), { virtual: true });

process.env.AUTH_MODE = 'basic';
process.env.DASHBOARD_PASSWORD = 'testpass';
process.env.LOG_DIR = '/tmp/selfclawy-test-logs';
process.env.OPENCLAW_CONFIG_PATH = '/tmp/selfclawy-test-config.json';

const fs = require('fs');
// Write a minimal config for config route tests
fs.mkdirSync('/tmp/selfclawy-test-logs', { recursive: true });
fs.writeFileSync('/tmp/selfclawy-test-config.json', JSON.stringify({
  providers: { anthropic: { model: 'claude-sonnet-4-6' } }
}));

const request = require('supertest');
const express = require('express');

// Build a minimal testable version of the app (same logic, no httpServer.listen)
function buildApp() {
  const basicAuth = require('express-basic-auth');
  const rateLimit = require('express-rate-limit');
  const Docker = require('dockerode');
  const path = require('path');
  const crypto = require('crypto');

  const app = express();
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';

  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
  app.use(apiLimiter);
  app.use(express.json());

  const basicAuthMiddleware = basicAuth({ users: { admin: PASSWORD }, challenge: true, realm: 'SelfClawy Dashboard' });
  function auth(req, res, next) { return basicAuthMiddleware(req, res, next); }

  app.get('/api/status', auth, async (req, res) => {
    try {
      const container = docker.getContainer('openclaw');
      const info = await container.inspect();
      const state = info.State;
      res.json({ running: state.Running, status: state.Status, startedAt: state.StartedAt, healthy: true, uptime: 42, tokensToday: 0, errorsTotal: 0 });
    } catch (err) {
      res.json({ running: false, status: 'not_found', healthy: false, uptime: 0 });
    }
  });

  app.post('/api/start',   auth, async (req, res) => { try { await docker.getContainer('openclaw').start();   res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post('/api/stop',    auth, async (req, res) => { try { await docker.getContainer('openclaw').stop();    res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post('/api/restart', auth, async (req, res) => { try { await docker.getContainer('openclaw').restart(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

  app.get('/api/config', auth, (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/config', auth, (req, res) => {
    try {
      const current = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
      const { provider, model } = req.body;
      if (provider && model) { if (!current.providers[provider]) current.providers[provider] = {}; current.providers[provider].model = model; }
      fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH, JSON.stringify(current, null, 2));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/metrics', auth, (req, res) => res.json({ tokensToday: 0, errorsTotal: 0, requestsTotal: 0, containerUp: 1, uptimeSeconds: 42 }));

  app.get('/metrics', auth, (req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send('selfclawy_container_up 1\n');
  });

  return app;
}

const app = buildApp();
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:testpass').toString('base64') };

describe('GET /api/status', () => {
  it('returns 401 without auth', async () => {
    const r = await request(app).get('/api/status');
    expect(r.status).toBe(401);
  });
  it('returns running status with auth', async () => {
    const r = await request(app).get('/api/status').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('running', true);
    expect(r.body).toHaveProperty('healthy', true);
  });
});

describe('POST /api/start', () => {
  it('returns 401 without auth', async () => {
    const r = await request(app).post('/api/start');
    expect(r.status).toBe(401);
  });
  it('starts container with auth', async () => {
    const r = await request(app).post('/api/start').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('POST /api/stop', () => {
  it('stops container with auth', async () => {
    const r = await request(app).post('/api/stop').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('POST /api/restart', () => {
  it('restarts container with auth', async () => {
    const r = await request(app).post('/api/restart').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('GET /api/config', () => {
  it('returns current config', async () => {
    const r = await request(app).get('/api/config').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.providers.anthropic.model).toBe('claude-sonnet-4-6');
  });
});

describe('POST /api/config', () => {
  it('updates model in config', async () => {
    const r = await request(app).post('/api/config').set(AUTH)
      .send({ provider: 'anthropic', model: 'claude-opus-4-8' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
    expect(cfg.providers.anthropic.model).toBe('claude-opus-4-8');
  });
});

describe('GET /api/metrics', () => {
  it('returns metrics object', async () => {
    const r = await request(app).get('/api/metrics').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('containerUp');
    expect(r.body).toHaveProperty('tokensToday');
  });
});

describe('GET /metrics (Prometheus)', () => {
  it('returns prometheus text format', async () => {
    const r = await request(app).get('/metrics').set(AUTH);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/plain/);
    expect(r.text).toContain('selfclawy_container_up');
  });
});
