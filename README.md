# SelfClawy 🦞

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/hbkdad/selfclawy/actions/workflows/ci.yml/badge.svg)](https://github.com/hbkdad/selfclawy/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-31%20passing-brightgreen)](dashboard/tests/api.test.js)
[![GitHub Stars](https://img.shields.io/github/stars/hbkdad/selfclawy?style=flat)](https://github.com/hbkdad/selfclawy/stargazers)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20the%20project-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/hbkcustomsinc)

> **The only free self-hosted dashboard that unifies OpenClaw + Hermes Agent + Ollama in one place.**

Deploy your own 24/7 AI ecosystem on any server — no SaaS fees, no lock-in, full data ownership. Setup wizard gets you live in under 2 minutes with zero SSH.

**[Landing Page](https://hbkdad.github.io/selfclawy/docs/)** · [Setup Guide](docs/SETUP.md) · [Issues](https://github.com/hbkdad/selfclawy/issues) · [☕ Ko-fi](https://ko-fi.com/hbkcustomsinc)

---

## One-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
```

Then open `http://YOUR_SERVER_IP:3001` — a **web setup wizard** walks you through the rest. No more SSH config editing.

Need help? → **[Full Setup Guide](docs/SETUP.md)**

---

## What is SelfClawy?

[Clawy](https://useclawy.com) sells managed cloud hosting for AI assistant instances. SelfClawy is the free alternative — your hardware, your data, zero subscription.

**The ecosystem it manages:**

| Service | What It Does |
|---|---|
| **OpenClaw** (302K ⭐) | AI gateway for 50+ messaging channels (Telegram, WhatsApp, Discord, Signal, iMessage…) + 5,700+ community skills via ClawHub |
| **Hermes Agent** | Python self-improving agent with persistent memory, 23 platforms, cron scheduler, 19,932 hub skills |
| **Ollama** | Run AI models locally — zero API costs after model download |

SelfClawy is the **only tool** that manages all three from a single dashboard.

---

## Dashboard Features

### Core
| Feature | Description |
|---|---|
| **Setup Wizard** | 5-step web wizard on first install — no SSH required |
| **Backend Switcher** | Switch between OpenClaw / Hermes / Ollama with one click |
| **Status Cards** | Running state (✓/✗/⟳), uptime, health, started time |
| **Model Switcher** | Change AI model (Claude / GPT / Gemini / local) without SSH |
| **Live Logs** | Real-time color-coded log stream per backend via WebSocket |
| **Container Controls** | Start / Stop / Restart with progress bar feedback |
| **Backup** | Download data volume as `.tar.gz` in one click |
| **Theme** | Dark and light mode, respects system preference |

### Advanced
| Feature | Description |
|---|---|
| **Local AI Scanner** | Auto-detects Ollama, LM Studio, llama.cpp, Jan AI, vLLM on your network |
| **Conversation History** | Browse past conversations with search and delete (SQLite) |
| **7-Day Token Chart** | Canvas-based bar chart of token usage + cost estimates |
| **User Management** | Add/remove users with role-based access (JWT mode) |
| **MCP Server Management** | Add, test, and remove MCP servers from the UI |
| **Model Routing Rules** | Route requests by keyword / channel / token count |
| **Preset Personas** | One-click persona templates (Support Bot, Code Reviewer, etc.) |
| **Audit Log** | Full history of logins, config changes, user actions |
| **Notification Center** | Bell icon with service up/down and alert notifications |
| **Prometheus Metrics** | `/metrics` endpoint — plug into Grafana for free dashboards |

---

## Quickstart Options

### Option A — One-liner (recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
```

### Option B — Docker Compose
```bash
git clone https://github.com/hbkdad/selfclawy.git
cd selfclawy
cp .env.example .env
# Edit .env with your API key + password
docker compose up -d --build
```

### Option C — With Hermes + Ollama
```bash
# In .env set:
COMPOSE_PROFILES=hermes,ollama
# Then:
docker compose up -d --build
```

### Update an existing install
```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/deploy.sh | bash
```

---

## Environment Variables

### Core

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key (`sk-ant-…`) |
| `OPENAI_API_KEY` | — | OpenAI API key (optional) |
| `GEMINI_API_KEY` | — | Google Gemini API key (optional) |
| `OPENCLAW_PORT` | `18789` | OpenClaw gateway port |
| `OPENCLAW_SECRET` | — | Session secret — `openssl rand -hex 32` |
| `OPENCLAW_ALLOW_FROM` | — | Allowed phone numbers (E.164 comma-separated) |

### Dashboard

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | `3001` | Dashboard port |
| `DASHBOARD_PASSWORD` | `changeme` | Admin password |
| `AUTH_MODE` | `basic` | `basic` = shared password · `jwt` = multi-user |
| `JWT_SECRET` | auto | Required when `AUTH_MODE=jwt` |
| `ALERT_WEBHOOK_URL` | — | Discord/Telegram webhook for up/down alerts |

### Optional Backends

| Variable | Default | Description |
|---|---|---|
| `COMPOSE_PROFILES` | — | `hermes`, `ollama`, `autoupdate` (comma-separated) |
| `HERMES_PORT` | `8080` | Hermes Agent UI port |
| `HERMES_SECRET` | — | Hermes auth secret |
| `OLLAMA_PORT` | `11434` | Ollama API port |
| `OLLAMA_BASE_URL` | — | Set to `http://ollama:11434` to use Ollama in Hermes |

### Channel Tokens

| Variable | Description |
|---|---|
| `TELEGRAM_TOKEN` | Bot token from @BotFather |
| `DISCORD_TOKEN` | Discord bot token |

WhatsApp and Signal link via QR code on first run — no token needed.

---

## Authentication

### Basic Auth (default)
Single admin account. Browser shows native password dialog. Best for personal use.

### JWT Multi-user
Set `AUTH_MODE=jwt`. Enables the login screen + user management UI. Create users via the Team tab in the dashboard. Tokens expire after 24 hours.

---

## Supported Channels

Telegram · WhatsApp · Discord · Signal · iMessage · Slack · Facebook Messenger · Instagram · Twitter/X · LINE · Viber · WeChat · SMS (Twilio) · Email · Slack · Microsoft Teams · Zoom · Google Chat · Reddit · IRC · Matrix · Nostr · Voice (calls)

---

## How It Compares

| Feature | LibreChat (34K ⭐) | Open WebUI (139K ⭐) | Dify (131K ⭐) | **SelfClawy** |
|---|---|---|---|---|
| Setup wizard | ❌ | ❌ | ✅ | ✅ |
| Container management | ❌ | ❌ | ❌ | ✅ |
| Messaging channels | ❌ | ❌ | limited | **50+ channels** |
| MCP management UI | ✅ | ❌ | ✅ | ✅ |
| Local AI scanner | ❌ | ❌ | ❌ | ✅ |
| Conversation history | ✅ | ✅ | ✅ | ✅ |
| User management | roadmap | ✅ | ✅ | ✅ |
| Cost tracking charts | ✅ | ✅ | ✅ | ✅ |
| Preset personas | ✅ | partial | ✅ | ✅ |
| Audit log | roadmap | ✅ | ✅ | ✅ |
| Routing rules | ❌ | ❌ | ✅ | ✅ |
| OpenClaw skills (5,700+) | ❌ | ❌ | ❌ | ✅ |
| Hermes Agent (self-improving) | ❌ | ❌ | ❌ | ✅ |
| Prometheus metrics | ❌ | ❌ | ❌ | ✅ |
| Mobile responsive | partial | ✅ | ✅ | ✅ |
| Price | Free | Free | Free/Paid | **Free forever** |

---

## Metrics & Monitoring

```
GET http://YOUR_SERVER_IP:3001/metrics
```

```
selfclawy_container_up{backend="openclaw"} 1
selfclawy_container_up{backend="hermes"} 1
selfclawy_uptime_seconds{backend="openclaw"} 3721
selfclawy_tokens_today 8450
selfclawy_errors_total 2
```

Connect Grafana + Prometheus for free dashboards. Also available as JSON at `/api/metrics`.

---

## Backup & Restore

**Backup:** Click ⬇ Backup in the dashboard — downloads your data volume as `.tar.gz`.

**Restore on new server:**
```bash
docker run --rm \
  -v openclaw_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/openclaw-backup-YYYY-MM-DD.tar.gz -C /data
```

---

## Auto-Updates

```bash
# In .env:
COMPOSE_PROFILES=autoupdate
docker compose up -d
```

Watchtower checks for new image versions every 24 hours.

---

## Requirements

| | Minimum | With Ollama |
|---|---|---|
| OS | Ubuntu 20.04+ / any Linux | Same |
| RAM | 512 MB | 8+ GB |
| Disk | 2 GB | +20 GB/model |
| Docker | 20.10+ | Same |
| API Key | Anthropic / OpenAI / Gemini | Optional (use local) |

---

## Contributing

PRs, issues, and stars are always welcome!

- [Open an issue](https://github.com/hbkdad/selfclawy/issues/new/choose)
- [Full setup guide](docs/SETUP.md)
- Dev commands: `cd dashboard && npm test` (31 tests)

---

## Support

SelfClawy is free and MIT licensed. If it saves you money:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/hbkcustomsinc)

---

## License

MIT — same as OpenClaw and Hermes Agent.

**Credits:** Built on [OpenClaw](https://github.com/openclaw/openclaw) (MIT) and [Hermes Agent](https://github.com/NousResearch/hermes-agent) (MIT). Not affiliated with useclawy.com.
