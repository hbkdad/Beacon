const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || '/data/selfclawy.db';
try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch (_) {}

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backend TEXT NOT NULL,
        channel TEXT,
        user TEXT,
        message TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        timestamp INTEGER NOT NULL,
        tokens INTEGER DEFAULT 0,
        model TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conv_ts ON conversations(timestamp DESC);
      CREATE TABLE IF NOT EXISTS daily_metrics (
        date TEXT NOT NULL,
        backend TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        requests INTEGER DEFAULT 0,
        PRIMARY KEY (date, backend)
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        action TEXT NOT NULL,
        target TEXT,
        result TEXT,
        timestamp INTEGER NOT NULL,
        ip TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp DESC);
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        read INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        auth_token TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS routing_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        condition_type TEXT NOT NULL,
        condition_value TEXT NOT NULL,
        target_model TEXT NOT NULL,
        target_backend TEXT,
        priority INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        system_prompt TEXT,
        model TEXT,
        channel TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  }
  return _db;
}

function insertConversation(data) {
  return getDb().prepare(
    `INSERT INTO conversations (backend,channel,user,message,role,timestamp,tokens,model)
     VALUES (@backend,@channel,@user,@message,@role,@timestamp,@tokens,@model)`
  ).run({ tokens: 0, model: null, channel: null, user: null, role: 'user', timestamp: Date.now(), ...data });
}

function getConversations({ backend, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  if (backend) return db.prepare(`SELECT * FROM conversations WHERE backend=? ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(backend, limit, offset);
  return db.prepare(`SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(limit, offset);
}

function getConversation(id) { return getDb().prepare(`SELECT * FROM conversations WHERE id=?`).get(id); }
function deleteConversation(id) { return getDb().prepare(`DELETE FROM conversations WHERE id=?`).run(id); }

function upsertDailyMetrics(date, backend, { tokens = 0, errors = 0, requests = 0 } = {}) {
  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM daily_metrics WHERE date=? AND backend=?`).get(date, backend);
  if (exists) {
    db.prepare(`UPDATE daily_metrics SET tokens=tokens+?,errors=errors+?,requests=requests+? WHERE date=? AND backend=?`).run(tokens, errors, requests, date, backend);
  } else {
    db.prepare(`INSERT INTO daily_metrics (date,backend,tokens,errors,requests) VALUES (?,?,?,?,?)`).run(date, backend, tokens, errors, requests);
  }
}

function getMetrics7Days() {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const rows = getDb().prepare(`SELECT * FROM daily_metrics WHERE date>=? ORDER BY date,backend`).all(days[0]);
  return { days, rows };
}

function addAudit(user, action, target, result, ip = '') {
  return getDb().prepare(`INSERT INTO audit_log (user,action,target,result,timestamp,ip) VALUES (?,?,?,?,?,?)`)
    .run(user, action, target, result, Date.now(), ip);
}

function getAuditLog({ limit = 100, offset = 0 } = {}) {
  return getDb().prepare(`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(limit, offset);
}

function addNotification(type, title, body = '') {
  return getDb().prepare(`INSERT INTO notifications (type,title,body,timestamp) VALUES (?,?,?,?)`).run(type, title, body, Date.now());
}

function getNotifications() { return getDb().prepare(`SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 50`).all(); }
function getUnreadCount() { return getDb().prepare(`SELECT COUNT(*) as n FROM notifications WHERE read=0`).get().n; }
function markRead(id) { return getDb().prepare(`UPDATE notifications SET read=1 WHERE id=?`).run(id); }
function markAllRead() { return getDb().prepare(`UPDATE notifications SET read=1`).run(); }

function getMcpServers() { return getDb().prepare(`SELECT * FROM mcp_servers ORDER BY created_at DESC`).all(); }
function addMcpServer(name, url, auth_token) { return getDb().prepare(`INSERT INTO mcp_servers (name,url,auth_token,created_at) VALUES (?,?,?,?)`).run(name, url, auth_token || null, Date.now()); }
function deleteMcpServer(id) { return getDb().prepare(`DELETE FROM mcp_servers WHERE id=?`).run(id); }
function toggleMcpServer(id, enabled) { return getDb().prepare(`UPDATE mcp_servers SET enabled=? WHERE id=?`).run(enabled ? 1 : 0, id); }

function getRoutingRules() { return getDb().prepare(`SELECT * FROM routing_rules ORDER BY priority DESC`).all(); }
function addRoutingRule(condition_type, condition_value, target_model, target_backend, priority = 0) {
  return getDb().prepare(`INSERT INTO routing_rules (condition_type,condition_value,target_model,target_backend,priority) VALUES (?,?,?,?,?)`).run(condition_type, condition_value, target_model, target_backend || null, priority);
}
function deleteRoutingRule(id) { return getDb().prepare(`DELETE FROM routing_rules WHERE id=?`).run(id); }
function toggleRoutingRule(id, enabled) { return getDb().prepare(`UPDATE routing_rules SET enabled=? WHERE id=?`).run(enabled ? 1 : 0, id); }

function getPresets() { return getDb().prepare(`SELECT * FROM presets ORDER BY created_at DESC`).all(); }
function addPreset(name, system_prompt, model, channel) { return getDb().prepare(`INSERT INTO presets (name,system_prompt,model,channel,created_at) VALUES (?,?,?,?,?)`).run(name, system_prompt || null, model || null, channel || null, Date.now()); }
function deletePreset(id) { return getDb().prepare(`DELETE FROM presets WHERE id=?`).run(id); }

module.exports = {
  getDb, insertConversation, getConversations, getConversation, deleteConversation,
  upsertDailyMetrics, getMetrics7Days,
  addAudit, getAuditLog,
  addNotification, getNotifications, getUnreadCount, markRead, markAllRead,
  getMcpServers, addMcpServer, deleteMcpServer, toggleMcpServer,
  getRoutingRules, addRoutingRule, deleteRoutingRule, toggleRoutingRule,
  getPresets, addPreset, deletePreset,
};
