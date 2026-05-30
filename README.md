# Beacon

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/hbkdad/selfclawy/actions/workflows/ci.yml/badge.svg)](https://github.com/hbkdad/selfclawy/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-49%20passing-brightgreen)](dashboard/tests/api.test.js)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20the%20project-10b981?logo=ko-fi&logoColor=white)](https://ko-fi.com/hbkcustomsinc)

> **One control plane for OpenClaw + Hermes Agent + Ollama. Self-hosted, zero subscriptions.**

AI that works for you, 24/7 — on your server, through your channels, on your terms. Setup wizard gets you live in under 5 minutes with zero SSH.

**[Landing Page](https://hbkdad.github.io/selfclawy/docs/)** · [Setup Guide](docs/SETUP.md) · [Issues](https://github.com/hbkdad/selfclawy/issues) · [☕ Ko-fi](https://ko-fi.com/hbkcustomsinc)

---

## One-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
```

Then open `http://YOUR_SERVER_IP:3001` — the setup wizard handles the rest. No SSH config editing required.

---

## What Beacon Manages

| Service | What It Does |
|---|---|
| **OpenClaw** (302K ⭐) | AI gateway — 50+ messaging channels (Telegram, WhatsApp, Discord, Signal, iMessage…) + 5,700+ ClawHub skills |
| **Hermes Agent** | Python self-improving agent with persistent memory, 23 platforms, cron scheduler |
| **Ollama** | Run AI models locally — zero API costs after model download |

Beacon is the **only tool** that manages all three from a single dashboard.

---

## Features

### Core
| Feature | Description |
|---|---|
| **Setup Wizard** | 5-step web wizard on first install — no SSH required |
| **Backend Switcher** | Switch between OpenClaw / Hermes / Ollama with one click |
| **Status Cards** | Running state, uptime, health, started time |
| **Model Switcher** | Change AI model (Claude / GPT / Gemini / local) without SSH |
| **Live Logs** | Real-time color-coded log stream per backend via WebSocket |
| **Container Controls** | Start / Stop / Restart with progress bar feedback |
| **Backup** | Download data volume as `.tar.gz` in one click |
| **Theme** | Dark and light mode |

### Advanced
| Feature | Description |
|---|---|
| **ClawHub Skills** | Browse, search, and install 5,700+ community skills from the UI |
| **Local AI Scanner** | Auto-detects Ollama, LM Studio, llama.cpp, Jan AI, vLLM on your network |
| **Conversation History** | Browse past conversations with search and delete (SQLite) |
| **7-Day Token Chart** | Canvas bar chart of token usage + cost estimates |
| **User Management** | Add/remove users with role-based access (JWT mode) |
| **MCP Server Management** | Add, test, and remove MCP servers from the UI |
| **Model Routing Rules** | Route requests by keyword / channel / token count |
| **Preset Personas** | One-click persona templates (Support Bot, Code Reviewer, etc.) |
| **Audit Log** | Full history of logins, config changes, user actions |
| **Notification Center** | Bell icon with service up/down alerts |
| **Prometheus Metrics** | `/metrics` endpoint — plug into Grafana |

---

## Quickstart

### Option A — One-liner (recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
```

### Option B — Docker Compose
```bash
git clone https://github.com/hbkdad/selfclawy.git
cd selfclawy
cp .env.example .env
# Edit .env — add your API key and admin password
docker compose up -d --build
```

### Option C — With Hermes + Ollama
```bash
# In .env:
COMPOSE_PROFILES=hermes,ollama
docker compose up -d --build
```

### Update existing install
```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/deploy.sh | bash
```

---

## Environment Variables

### Core
| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key (`sk-ant-…`) |
| `OPENAI_API_KEY` | — | OpenAI key (optional) |
| `GEMINI_API_KEY` | — | Gemini key (optional) |
| `OPENCLAW_PORT` | `18789` | OpenClaw gateway port |
| `OPENCLAW_SECRET` | — | Session secret — `openssl rand -hex 32` |

### Dashboard
| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | `3001` | Dashboard port |
| `DASHBOARD_PASSWORD` | `changeme` | Admin password |
| `AUTH_MODE` | `basic` | `basic` (shared) or `jwt` (multi-user) |
| `JWT_SECRET` | auto | Required when `AUTH_MODE=jwt` |
| `ALERT_WEBHOOK_URL` | — | Discord/Telegram webhook for alerts |

### Optional Backends
| Variable | Default | Description |
|---|---|---|
| `COMPOSE_PROFILES` | — | `hermes`, `ollama`, `autoupdate` |
| `HERMES_PORT` | `8080` | Hermes Agent port |
| `OLLAMA_PORT` | `11434` | Ollama API port |
| `TELEGRAM_TOKEN` | — | Bot token from @BotFather |
| `DISCORD_TOKEN` | — | Discord bot token |

---

## How It Compares

| Feature | LibreChat (34K ⭐) | Open WebUI (139K ⭐) | Dify (131K ⭐) | **Beacon** |
|---|---|---|---|---|
| Setup wizard | ❌ | ❌ | ✅ | ✅ |
| Container management | ❌ | ❌ | ❌ | ✅ |
| Messaging channels | ❌ | ❌ | limited | **50+** |
| MCP management UI | ✅ | ❌ | ✅ | ✅ |
| Local AI scanner | ❌ | ❌ | ❌ | ✅ |
| Conversation history | ✅ | ✅ | ✅ | ✅ |
| ClawHub skills (5,700+) | ❌ | ❌ | ❌ | ✅ |
| Hermes Agent support | ❌ | ❌ | ❌ | ✅ |
| Routing rules | ❌ | ❌ | ✅ | ✅ |
| Prometheus metrics | ❌ | ❌ | ❌ | ✅ |
| Price | Free | Free | Free/Paid | **Free forever** |

---

## Prometheus Metrics

```
GET http://YOUR_SERVER_IP:3001/metrics
```

```
beacon_container_up{backend="openclaw"} 1
beacon_uptime_seconds{backend="openclaw"} 3721
beacon_tokens_today 8450
beacon_errors_total 2
```

---

## Requirements

| | Minimum | With Ollama |
|---|---|---|
| OS | Ubuntu 20.04+ / any Linux | Same |
| RAM | 512 MB | 8+ GB |
| Docker | 20.10+ | Same |
| API Key | Anthropic / OpenAI / Gemini | Optional |

---

## Contributing

PRs, issues, and stars are welcome.

- `cd dashboard && npm test` — 49 tests
- `npm run lint` — eslint
- [Open an issue](https://github.com/hbkdad/selfclawy/issues/new/choose)

---

## Support

Beacon is free and MIT licensed.

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/hbkcustomsinc)

---

## License

MIT — built on [OpenClaw](https://github.com/openclaw/openclaw) (MIT) and [Hermes Agent](https://github.com/NousResearch/hermes-agent) (MIT).
