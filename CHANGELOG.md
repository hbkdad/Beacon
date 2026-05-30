# Changelog

All notable changes to SelfClawy will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [0.3.0] — 2026-05-30

### Added
- **Setup wizard** (`/setup`) — 5-step web wizard on first install: admin password, AI provider + API key test, channel connection, backend selection, done screen. Replaces SSH config editing.
- **SQLite data layer** (`db.js`) — conversation history, daily metrics, audit log, notifications, MCP servers, routing rules, presets (better-sqlite3)
- **Conversation history tab** — browse, search and delete past conversations via `GET /api/history`
- **Team / User management tab** — add/remove users with role selector (admin/operator/viewer) in JWT mode
- **MCP server management** — add, test, and remove MCP servers from the Settings tab; quick-add buttons for filesystem, web search, GitHub, SQLite
- **Model routing rules** — route requests by keyword, token count, channel, or time of day to specific models
- **Preset personas** — one-click templates (Customer Support, Code Reviewer, Personal Assistant, Custom) + save your own
- **Audit log** — full history of logins, config changes, user actions, and container controls with timestamp and IP
- **Notification center** — bell icon in header with unread badge; service up/down events stored in SQLite
- **7-day token chart** — Canvas-based bar chart of daily token usage in the Dashboard tab
- **Local AI scanner** (`GET /api/scan/local-ai`) — scans 10 common ports for Ollama, LM Studio, llama.cpp, Jan AI, GPT4All, TabbyML, vLLM, OpenClaw, Hermes
- **Persistent progress bar** — sticky bottom bar shows operation status (starting/stopping/pulling); spinner + auto-dismiss on completion
- **Tabbed navigation** — Dashboard / History / Team / Settings tabs (desktop top nav + mobile bottom nav)
- **Mobile-responsive layout** — 640px breakpoint, bottom navigation, 48px touch targets, horizontal log scroll
- **Improved status cards** — icons alongside values (✓/✗/⟳), actionable errors with "Restart" and "View log" links
- **`deploy.sh`** — one-liner update script for existing installs
- **`docs/SETUP.md`** — comprehensive setup guide covering all options, channels, firewall, GPU, troubleshooting
- **`CLAUDE.md`** — project memory file for efficient future Claude Code sessions
- **`.claude/commands/`** — custom slash commands: `/test`, `/add-route`, `/status`, `/release`, `/update-readme`
- Tests expanded from 18 to 31 (new suites: scan, history, users, MCP, routing, presets, audit, notifications, metrics/history, setup)

### Changed
- `server.js` expanded from 380 to 600+ lines with all new routes
- `index.html` fully redesigned: tabbed layout, mobile nav, improved status indicators, all new panels
- `package.json` updated to v1.2.0, added `better-sqlite3`
- `README.md` updated with full v0.3.0 feature list, comparison table, and setup options
- Backend polling interval now also writes daily metrics to SQLite and fires notification events

---

## [0.2.0] — 2026-05-30

### Added
- **Rate limiting** — 100 req/15 min on API routes, 20 req/15 min on auth endpoints (express-rate-limit)
- **CSRF protection** — double-submit cookie pattern on all mutating POST routes
- **Persistent log files** — Docker logs written daily to `/data/logs/openclaw-YYYY-MM-DD.log` (new `logs_data` volume)
- **Webhook alerting** — `ALERT_WEBHOOK_URL` env var; posts to Discord/Telegram when OpenClaw goes online or offline
- **Token usage tracking** — parses logs for token counts; surfaces as "Tokens Today" stat card in dashboard
- **Prometheus `/metrics` endpoint** — 5 gauges/counters for Grafana integration
- **Model switcher UI** — dropdown in dashboard reads/writes `openclaw.json`; supports Claude, GPT-4o, Gemini
- **Light/dark theme toggle** — button in header; respects `prefers-color-scheme`, persists via `localStorage`
- **Backup endpoint** — "⬇ Backup" button downloads `openclaw_data` volume as `.tar.gz`
- **JWT multi-user auth** — `AUTH_MODE=jwt` shows a login screen; user store in `users.json` with bcrypt hashes
- **Automated test suite** — Jest + Supertest; 10 tests covering all API routes (Docker mocked)
- **GitHub Actions CI** — lint + test on every push and pull request
- **Installer prompts** — new interactive prompts for JWT mode, webhook URL, and auto-generated JWT secret
- **Token + error stat cards** — two new stat cards in the dashboard grid

### Changed
- `dashboard/server.js` rewritten from 57 lines to fully-featured with all new routes
- `dashboard/public/index.html` — added login screen, theme toggle, model switcher, backup button, new stat cards
- `docker-compose.yml` — added `logs_data` volume and new env vars for dashboard service
- `.env.example` — documented `AUTH_MODE`, `JWT_SECRET`, `ALERT_WEBHOOK_URL`
- README fully rewritten with feature documentation, comparison table, and configuration reference

---

## [0.1.0] — 2026-05-29

### Added
- One-liner installer (`scripts/install.sh`) with interactive prompts
- Docker Compose stack: OpenClaw gateway + SelfClawy dashboard
- Dark-mode management dashboard with live log streaming via Socket.io
- Start / Stop / Restart controls via Docker API (Dockerode)
- Gateway health check polling every 10 seconds
- Anthropic, OpenAI, and Gemini provider support via `.env`
- Optional Watchtower auto-updater (Docker Compose profile)
- Channel config template for Telegram, WhatsApp, Discord
- GitHub issue templates (bug report, feature request)
- CONTRIBUTING.md and PR template
- Ko-fi donation support
- Landing page on GitHub Pages (`docs/index.html`)
