# SelfClawy 🦞

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/hbkdad/selfclawy/actions/workflows/ci.yml/badge.svg)](https://github.com/hbkdad/selfclawy/actions/workflows/ci.yml)
[![GitHub Stars](https://img.shields.io/github/stars/hbkdad/selfclawy?style=flat)](https://github.com/hbkdad/selfclawy/stargazers)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20the%20project-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/hbkcustomsinc)

> **The free, self-hosted alternative to Clawy (useclawy.com)**

Deploy your own 24/7 OpenClaw AI assistant on any server or VPS — no SaaS fees, no lock-in, full data ownership.

**[Landing Page](https://hbkdad.github.io/selfclawy/docs/)** · [Issues](https://github.com/hbkdad/selfclawy/issues) · [Contributing](CONTRIBUTING.md) · [☕ Ko-fi](https://ko-fi.com/hbkcustomsinc)

---

## What is SelfClawy?

[Clawy](https://useclawy.com) sells managed cloud hosting for [OpenClaw](https://github.com/openclaw/openclaw) AI assistant instances. SelfClawy gives you the same one-command setup experience on your own hardware — for free, forever.

**OpenClaw** is an MIT-licensed open-source AI assistant that connects to WhatsApp, Telegram, Discord, Signal, iMessage and 20+ other platforms and can take real actions: shell commands, email, calendar, browser automation, and file management.

---

## Quickstart

### Option A — One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
```

Follow the interactive prompts. OpenClaw will be live at `http://YOUR_SERVER_IP:18789` in under 2 minutes.

### Option B — Docker Compose

```bash
git clone https://github.com/hbkdad/selfclawy.git
cd selfclawy
cp .env.example .env
nano .env          # fill in your API key + channel tokens
docker compose up -d --build
```

---

## Dashboard

The management dashboard runs at `http://YOUR_SERVER_IP:3001` (default password: set during install).

**Dashboard features:**

| Feature | Description |
|---|---|
| Status cards | Running state, uptime, gateway health, started time |
| Token tracking | Live count of tokens used today (parsed from logs) |
| Error counter | Number of error-level log lines since last restart |
| Model switcher | Change AI model (Claude / GPT / Gemini) without SSH |
| Live log viewer | Real-time color-coded log stream via WebSocket |
| Backup | Download your OpenClaw data as a `.tar.gz` in one click |
| Start / Stop / Restart | Container lifecycle controls |
| Theme toggle | Light and dark mode, respects system preference |
| Prometheus metrics | `/metrics` endpoint — plug in Grafana for free dashboards |

### Dashboard screenshots

> **Dark mode** (default)
>
> ![Dashboard dark mode](docs/screenshots/dashboard-dark.png)

> **Light mode**
>
> ![Dashboard light mode](docs/screenshots/dashboard-light.png)

> **Model switcher**
>
> ![Model switcher dropdown](docs/screenshots/model-switcher.png)

---

## Requirements

- Linux server / VPS (Ubuntu 22.04+ recommended, 1 GB RAM minimum)
- An API key for at least one provider: Anthropic (Claude), OpenAI, or Google Gemini
- Docker + Docker Compose (auto-installed by the installer if missing)

---

## Environment variables

### Core

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key (`sk-ant-…`) |
| `OPENAI_API_KEY` | — | OpenAI API key (optional) |
| `GEMINI_API_KEY` | — | Google Gemini API key (optional) |
| `OPENCLAW_PORT` | `18789` | Port for the OpenClaw gateway |
| `OPENCLAW_SECRET` | — | Session secret — run `openssl rand -hex 32` |
| `OPENCLAW_ALLOW_FROM` | — | Comma-separated allowed phone numbers (E.164) |

### Dashboard

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | `3001` | Port for the SelfClawy dashboard |
| `DASHBOARD_PASSWORD` | `changeme` | Password for the `admin` account |
| `AUTH_MODE` | `basic` | `basic` = single shared password · `jwt` = multi-user JWT |
| `JWT_SECRET` | auto-generated | Secret for signing JWT tokens (required when `AUTH_MODE=jwt`) |

### Alerting

| Variable | Default | Description |
|---|---|---|
| `ALERT_WEBHOOK_URL` | — | Discord webhook URL or Telegram bot URL — sends a message when OpenClaw goes online or offline |

### Channel tokens

| Variable | Description |
|---|---|
| `TELEGRAM_TOKEN` | Telegram bot token from @BotFather |
| `DISCORD_TOKEN` | Discord bot token |

WhatsApp and Signal are linked via QR code on first run — no token needed.

---

## Authentication modes

### Basic Auth (default)
Single admin account using `DASHBOARD_PASSWORD`. The browser shows a native password dialog. Simplest for personal use.

### JWT Multi-user (recommended for teams)
Set `AUTH_MODE=jwt` and `JWT_SECRET` in your `.env`. A login screen replaces the browser dialog. You can add users by editing `dashboard/users.json` (passwords stored as bcrypt hashes). Tokens expire after 24 hours.

To generate a secure secret:
```bash
openssl rand -hex 32
```

---

## Alerting

Set `ALERT_WEBHOOK_URL` to receive a notification whenever OpenClaw goes offline or comes back online.

**Discord webhook:**
1. Server Settings → Integrations → Webhooks → New Webhook → Copy URL
2. Paste into `.env` as `ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/…`

**Telegram bot:**
Use `https://api.telegram.org/bot<TOKEN>/sendMessage` formatted as a webhook.

---

## Metrics & Monitoring

The dashboard exposes a Prometheus-compatible `/metrics` endpoint:

```
GET http://YOUR_SERVER_IP:3001/metrics
```

Example output:
```
selfclawy_container_up 1
selfclawy_uptime_seconds 3721
selfclawy_tokens_today 8450
selfclawy_errors_total 2
selfclawy_requests_total 147
```

Connect a free [Grafana](https://grafana.com/oss/grafana/) + [Prometheus](https://prometheus.io/) stack to get a full observability dashboard.

---

## Model switcher

Change your AI model directly from the dashboard — no SSH required. Select from the dropdown and click Restart to apply:

- **Claude**: Sonnet 4.6 (default), Opus 4.8, Haiku 4.5
- **OpenAI**: GPT-4o, GPT-4o mini
- **Google**: Gemini 2.0 Flash

The change writes to `config/openclaw.json` (mounted into the OpenClaw container).

---

## Backup & restore

Click **⬇ Backup** in the dashboard to download your complete OpenClaw data volume (memory, sessions, config) as a `.tar.gz` archive.

To restore on a new server:
```bash
# Extract into the Docker volume
docker run --rm -v openclaw_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/openclaw-backup-YYYY-MM-DD.tar.gz -C /data
```

---

## Supported channels

| Channel | Status |
|---|---|
| Telegram | ✅ Ready |
| WhatsApp | ✅ Ready |
| Discord | ✅ Ready |
| Signal | ✅ Ready |
| iMessage | ✅ Ready |
| Slack | ✅ Ready |
| Microsoft Teams | 🔌 Planned |
| Matrix | 🔌 Planned |
| Google Chat | 🔌 Planned |
| Nostr | 🔌 Planned |
| IRC | 🔌 Planned |

---

## Comparison

| Feature | Clawy (useclawy.com) | SelfClawy |
|---|---|---|
| Price | Paid subscription | **Free forever** |
| Data ownership | Their servers | **Your server** |
| Open source | No | **MIT license** |
| Customizable | Limited | **Full control** |
| AI model | Limited | **Claude, GPT, Gemini, local** |
| Management dashboard | Yes | **Yes** |
| Model switching UI | Yes | **Yes** |
| Alerting / webhooks | Yes | **Yes (Discord/Telegram)** |
| Prometheus metrics | Yes | **Yes** |
| Multi-user login | Yes | **Yes (JWT mode)** |
| Backup / restore | Yes | **Yes (one-click)** |
| Uptime SLA | Yes | You own the server |

---

## Auto-updates (optional)

Enable Watchtower to automatically pull new OpenClaw releases:

```bash
docker compose --profile autoupdate up -d
```

---

## Logs

Persistent logs are written daily to the `logs_data` Docker volume:

```
/data/logs/openclaw-YYYY-MM-DD.log
```

To read them from the host:
```bash
docker run --rm -v selfclawy_logs_data:/logs alpine cat /logs/openclaw-$(date +%F).log
```

---

## Contributing

PRs, bug reports, and feature requests are welcome!

- [Open an issue](https://github.com/hbkdad/selfclawy/issues/new/choose)
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup guide

---

## Support the project

SelfClawy is free and MIT licensed. If it saves you money or time, a coffee goes a long way:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/hbkcustomsinc)

---

## License

MIT — same as OpenClaw.

## Credits

Built on [OpenClaw](https://github.com/openclaw/openclaw) (MIT). Not affiliated with useclawy.com or Clawy.
