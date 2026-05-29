# Changelog

All notable changes to SelfClawy will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

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
