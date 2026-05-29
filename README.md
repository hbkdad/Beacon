# SelfClawy 🦞

> **The free, self-hosted alternative to Clawy (useclawy.com)**

Deploy your own 24/7 OpenClaw AI assistant on any server or VPS — no SaaS fees, no lock-in, full control.

---

## What is this?

[Clawy](https://useclawy.com) sells managed cloud hosting for [OpenClaw](https://github.com/openclaw/openclaw) instances. SelfClawy gives you the same one-command setup experience on your own hardware.

**OpenClaw** is an MIT-licensed open-source AI assistant that connects to WhatsApp, Telegram, Discord, Signal, iMessage and 20+ other platforms and can take real actions — shell commands, email, calendar, browser automation, file management.

---

## Requirements

- A Linux server / VPS (Ubuntu 22.04+ recommended, 1 GB RAM minimum)
- Docker + Docker Compose (auto-installed by the script if missing)
- An API key: Claude (Anthropic), OpenAI, Gemini, or any OpenAI-compatible provider

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
# Edit .env with your API key and channel tokens
nano .env
docker compose up -d
```

### Option C — npm (local machine)

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
openclaw dashboard
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (get one at console.anthropic.com) |
| `OPENAI_API_KEY` | OpenAI API key (optional) |
| `TELEGRAM_TOKEN` | Telegram bot token from @BotFather |
| `DISCORD_TOKEN` | Discord bot token |
| `OPENCLAW_ALLOW_FROM` | Comma-separated phone numbers allowed to message (e.g. `+15555550123`) |
| `OPENCLAW_PORT` | Dashboard port (default: `18789`) |
| `OPENCLAW_SECRET` | Random secret for session auth — run `openssl rand -hex 32` |

---

## Supported channels

| Channel | Status |
|---|---|
| Telegram | ✅ Built-in |
| WhatsApp | ✅ Built-in |
| Discord | ✅ Built-in |
| Signal | ✅ Built-in |
| iMessage (macOS) | ✅ Built-in |
| Slack | ✅ Built-in |
| Microsoft Teams | ✅ Plugin |
| Matrix | ✅ Plugin |
| Google Chat | ✅ Plugin |
| Nostr / IRC / Twitch | ✅ Plugin |

---

## Management Dashboard

The SelfClawy dashboard runs at `http://localhost:3001` (or your server's IP) and lets you:

- Start / stop / restart the OpenClaw gateway
- View live logs
- Manage environment variables without touching the CLI
- Monitor uptime and memory

To launch it separately:

```bash
cd selfclawy/dashboard
npm install
npm start
```

---

## Enabling HTTPS (recommended for remote access)

Use Caddy for automatic TLS:

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile
YOUR_DOMAIN.COM {
    reverse_proxy localhost:18789
}
```

---

## Updating OpenClaw

```bash
docker compose pull && docker compose up -d
```

---

## Comparison

| Feature | Clawy (useclawy.com) | SelfClawy |
|---|---|---|
| Price | Paid subscription | Free |
| Setup time | 1 minute | 2–5 minutes |
| Data ownership | Their servers | Your server |
| Customizable | Limited | Full |
| Uptime SLA | Yes (they manage it) | You manage it |
| Open source | No | MIT |

---

## License

MIT — same as OpenClaw.

---

## Credits

Built on top of [OpenClaw](https://github.com/openclaw/openclaw) by the OpenClaw community.
SelfClawy is not affiliated with useclawy.com or Clawy.