const express = require('express');
const basicAuth = require('express-basic-auth');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Docker = require('dockerode');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const PORT = process.env.DASHBOARD_PORT || 3001;
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const OPENCLAW_CONTAINER = 'openclaw';

app.use(basicAuth({ users: { admin: PASSWORD }, challenge: true, realm: 'SelfClawy Dashboard' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', async (req, res) => {
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
    res.json({ running: state.Running, status: state.Status, startedAt: state.StartedAt, healthy,
      uptime: state.Running ? Math.floor((Date.now() - new Date(state.StartedAt)) / 1000) : 0 });
  } catch (err) {
    res.json({ running: false, status: 'not_found', healthy: false, uptime: 0 });
  }
});

app.post('/api/start',   async (req, res) => { try { await docker.getContainer(OPENCLAW_CONTAINER).start();   res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/stop',    async (req, res) => { try { await docker.getContainer(OPENCLAW_CONTAINER).stop();    res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/restart', async (req, res) => { try { await docker.getContainer(OPENCLAW_CONTAINER).restart(); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

io.on('connection', (socket) => {
  let logStream = null;
  socket.on('subscribe-logs', async () => {
    try {
      const container = docker.getContainer(OPENCLAW_CONTAINER);
      logStream = await container.logs({ follow: true, stdout: true, stderr: true, tail: 100 });
      logStream.on('data', (chunk) => socket.emit('log', chunk.slice(8).toString('utf8')));
      logStream.on('end', () => socket.emit('log', '[stream ended]'));
    } catch (err) { socket.emit('log', `[error: ${err.message}]`); }
  });
  socket.on('disconnect', () => { if (logStream) logStream.destroy(); });
});

httpServer.listen(PORT, () => console.log(`SelfClawy dashboard running at http://localhost:${PORT}`));
