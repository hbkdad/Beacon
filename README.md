# SelfClawy 🦞

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/hbkdad/selfclawy?style=flat)](https://github.com/hbkdad/selfclawy/stargazers)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20the%20project-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/hbkcustomsinc)

> **The free, self-hosted alternative to Clawy (useclawy.com)**

Deploy your own 24/7 OpenClaw AI assistant on any server or VPS — no SaaS fees, no lock-in, full control.

**[Landing Page](https://hbkdad.github.io/selfclawy/docs/)** · [Issues](https://github.com/hbkdad/selfclawy/issues) · [Contributing](CONTRIBUTING.md) · [☕ Ko-fi](https://ko-fi.com/hbkcustomsinc)

---

## What is this?

[Clawy](https://useclawy.com) sells managed cloud hosting for [OpenClaw](https://github.com/openclaw/openclaw) instances. SelfClawy gives you the same one-command setup experience on your own hardware.

**OpenClaw** is an MIT-licensed open-source AI assistant that connects to WhatsApp, Telegram, Discord, Signal, iMessage and 20+ other platforms and can take real actions — shell commands, email, calendar, browser automation, file management.

---

## Quickstart

### Option A — One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
```

Follow the prompts. Your OpenClaw instance will be running at `http://YOUR_SERVER_IP:18789` in under 2 minutes.

### Option B — Docker Compose

```bash
git clone https://github.com/hbkdad/selfclawy.git
cd selfclawy
cp .env.example .env
nano .env
docker compose up -d
```

---

## Requirements

- Linux server / VPS (Ubuntu 22.04+ recommended, 1 GB RAM minimum)
- An API key: Claude (Anthropic), OpenAI, Gemini, or any OpenAI-compatible provider
- Docker + Docker Compose (auto-installed by the script if missing)

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key (optional) |
| `TELEGRAM_TOKEN` | Telegram bot token from @BotFather |
| `DISCORD_TOKEN` | Discord bot token |
| `OPENCLAW_ALLOW_FROM` | Allowed phone numbers e.g. `+15555550123` |
| `OPENCLAW_PORT` | Dashboard port (default: `18789`) |
| `OPENCLAW_SECRET` | Session secret — run `openssl rand -hex 32` |

---

## Supported channels

Telegram ✅ · WhatsApp ✅ · Discord ✅ · Signal ✅ · iMessage ✅ · Slack ✅ · Teams 🔌 · Matrix 🔌 · Google Chat 🔌 · Nostr 🔌 · IRC 🔌

---

## Management Dashboard

Runs at `http://localhost:3001` — start/stop/restart OpenClaw, live log streaming, health monitoring.

---

## Comparison

| Feature | Clawy (useclawy.com) | SelfClawy |
|---|---|---|
| Price | Paid subscription | Free |
| Data ownership | Their servers | Your server |
| Open source | No | MIT |
| Customizable | Limited | Full |
| Any AI model | Limited | Claude, GPT, Gemini, local |

---

## Contributing

PRs, bug reports, and feature requests are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support the project

SelfClawy is free and MIT licensed. If it saves you money or helps you, a coffee is appreciated:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/hbkcustomsinc)

## License

MIT — same as OpenClaw.

## Credits

Built on [OpenClaw](https://github.com/openclaw/openclaw) (MIT). Not affiliated with useclawy.com or Clawy.
