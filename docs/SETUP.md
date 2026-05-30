# SelfClawy Setup Guide

## One-Command Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
```

That's it. The script handles everything:
- Installs Docker and Docker Compose if missing
- Clones the repo
- Walks you through a 2-minute interactive setup
- Starts all containers

**After install:** Open `http://YOUR_SERVER_IP:3001` → complete the web setup wizard.

---

## What You Need

| Requirement | Minimum | Notes |
|---|---|---|
| OS | Ubuntu 20.04+ / Debian 11+ / any Linux | macOS works too |
| RAM | 512 MB | 8+ GB if using Ollama |
| Disk | 2 GB | +20 GB per Ollama model |
| Network | Any VPS or home server | Ports 3001, 18789, 8080 (optional) |
| API Key | Anthropic, OpenAI, or Google | Free tiers work |

**No domain required.** Works on any IP address.

---

## Interactive Setup Walkthrough

When you run the install script, it asks:

### 1. Anthropic API Key
```
Anthropic API key (sk-ant-...):
```
Get one at [console.anthropic.com](https://console.anthropic.com) → API Keys.
Press Enter to skip and configure later.

### 2. Telegram Bot Token (optional)
```
Telegram bot token (leave blank to skip):
```
Create a bot:
1. Open Telegram → search `@BotFather`
2. Send `/newbot`
3. Follow prompts, copy the token

### 3. Phone Number for Allowlist
```
Your phone number in E.164 format (e.g. +15555550123):
```
Only your number can message the bot. Use E.164 format: `+` + country code + number.

### 4. Dashboard Password
```
Dashboard password (default: changeme):
```
Choose a strong password. You'll use this to log in at port 3001.

### 5. JWT Auth (optional)
```
Enable multi-user JWT auth? (y/N):
```
Press `y` if you want multiple users with separate accounts. Otherwise stick with basic auth.

### 6. Alert Webhook (optional)
```
Alert webhook URL (Discord/Telegram, leave blank to skip):
```
Get notified when services go up/down:
- **Discord**: Server Settings → Integrations → Webhooks → New Webhook → Copy URL
- **Telegram**: Use `https://api.telegram.org/bot{TOKEN}/sendMessage?chat_id={CHAT_ID}&text=test`

### 7. Backend Selection
```
  a) OpenClaw only  — lightweight Node.js gateway (default)
  b) + Hermes Agent — Python gateway with memory, skills, cron (~180s startup)
  c) + Ollama       — local LLM runner (needs 8+ GB RAM)
  d) Both Hermes + Ollama
```

- **OpenClaw only** (`a`): Best for getting started. Connects to Telegram/Discord/WhatsApp. Uses cloud AI APIs.
- **+ Hermes Agent** (`b`): Adds persistent memory, 5,700+ skills, cron jobs. Takes ~3 minutes to install on first start.
- **+ Ollama** (`c`): Run AI locally. Pull models like `nous-hermes3` (4.8GB). Zero API costs after download.
- **Both** (`d`): Full stack — Hermes uses Ollama models for zero-cost local AI.

---

## Web Setup Wizard

After the script finishes, open `http://YOUR_SERVER_IP:3001` in your browser.

The 5-step wizard guides you through:

1. **Secure your dashboard** — set admin password
2. **Connect AI provider** — paste API key, test it
3. **Connect a channel** — Telegram, Discord, WhatsApp, or Signal
4. **Choose backends** — confirm which services to run
5. **Done** — your AI is live

The wizard only appears once. After completion, you're taken directly to the dashboard.

---

## Manual Setup (Advanced)

If you prefer full control:

```bash
# Clone
git clone https://github.com/hbkdad/selfclawy.git
cd selfclawy

# Configure
cp .env.example .env
nano .env   # fill in API key, tokens, passwords

# Start
docker compose up -d --build

# With optional backends
COMPOSE_PROFILES=hermes,ollama docker compose up -d --build
```

### Minimal .env for OpenClaw only:
```env
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
OPENCLAW_SECRET=your-random-secret-here
DASHBOARD_PASSWORD=your-secure-password
TELEGRAM_TOKEN=your-telegram-token
OPENCLAW_ALLOW_FROM=+15555550123
```

Generate `OPENCLAW_SECRET`:
```bash
openssl rand -hex 32
```

---

## Ports Reference

| Port | Service | Required |
|------|---------|----------|
| 3001 | Dashboard | Yes |
| 18789 | OpenClaw gateway | Yes |
| 8080 | Hermes Agent UI | Optional (profile: hermes) |
| 11434 | Ollama API | Optional (profile: ollama) |

Open these in your firewall:
```bash
# UFW
sudo ufw allow 3001/tcp
sudo ufw allow 18789/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 18789 -j ACCEPT
```

---

## Updating

```bash
# One-liner update
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/deploy.sh | bash

# Or manually
cd ~/selfclawy
git pull
docker compose up -d --build
```

Auto-updates via Watchtower (add to COMPOSE_PROFILES):
```env
COMPOSE_PROFILES=autoupdate
```

---

## Connecting Channels

### Telegram
1. Create bot with [@BotFather](https://t.me/BotFather): `/newbot`
2. Copy the token to `TELEGRAM_TOKEN` in `.env`
3. Message your bot — it responds immediately

### Discord
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Bot → Reset Token → copy
3. Paste as `DISCORD_TOKEN` in `.env`
4. Enable Message Content Intent under Bot settings
5. Invite bot to server with OAuth2 URL Generator

### WhatsApp
1. Start containers: `docker compose up -d`
2. Run: `docker compose logs openclaw`
3. Scan the QR code with WhatsApp → Linked Devices

### Signal
Same as WhatsApp — look for QR code in OpenClaw logs.

---

## GPU Acceleration for Ollama

If your server has an NVIDIA GPU:

```bash
# Install NVIDIA Container Toolkit first
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

# Start with GPU support
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

---

## Troubleshooting

**Dashboard won't load:**
```bash
docker compose logs dashboard
docker compose ps
```

**OpenClaw not connecting to Telegram:**
```bash
docker compose logs openclaw
# Check TELEGRAM_TOKEN and OPENCLAW_ALLOW_FROM in .env
```

**Hermes takes too long to start:**
This is normal — first start installs Python dependencies (~3 minutes). Check:
```bash
docker compose logs hermes
```

**Ollama out of memory:**
Reduce model size or add swap space:
```bash
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

**Reset everything:**
```bash
docker compose down -v  # WARNING: deletes all data
docker compose up -d --build
```

---

## Security Hardening

For production deployments:

1. **Strong passwords**: Use `openssl rand -hex 16` for all secrets
2. **Firewall**: Only expose ports you need
3. **Reverse proxy**: Use Caddy or nginx for HTTPS (set `ENABLE_HTTPS=true` + `DOMAIN=yourdomain.com`)
4. **JWT mode**: Switch to `AUTH_MODE=jwt` for multi-user access control
5. **Backups**: Use the dashboard backup button or set up a cron job

---

## Getting Help

- **Issues**: [github.com/hbkdad/selfclawy/issues](https://github.com/hbkdad/selfclawy/issues)
- **Docs**: [OpenClaw docs](https://docs.openclaw.ai)
- **Support**: [ko-fi.com/hbkcustomsinc](https://ko-fi.com/hbkcustomsinc)
