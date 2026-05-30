# Changelog

All notable changes to SelfClawy will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

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
