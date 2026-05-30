# Beacon — Launch Playbook

Research-backed copy for every channel. Based on analysis of top Show HN posts,
ProductHunt launches (Lago 1,046 upvotes, Wealthfolio viral trajectory), and
r/selfhosted community patterns.

---

## Show HN

**Title:**
```
Show HN: Beacon – self-hosted control plane for OpenClaw, Hermes, and Ollama
```

**Opening comment (post within first 5 minutes):**

> I've been running multiple AI backends — OpenClaw for channel integrations
> (Telegram, Discord, Slack, etc.), Hermes Agent for self-improving tasks, and
> Ollama for local LLM inference. Managing three separate Docker services meant
> SSH-ing into a VPS, running docker commands, manually checking which backend
> was handling traffic, and losing track of token usage. It was busywork.
>
> Beacon is a single web dashboard that handles all three: start/stop/restart
> each backend, switch the active AI routing in one click, browse and install
> ClawHub skills (5,700+), pull Ollama models, track 7-day token usage, and
> manage MCP servers. It runs entirely on your own VPS — I test it on a
> $6/month Hetzner instance. No cloud accounts, no subscriptions, no API keys
> going to a third party.
>
> The setup is one command: `curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash`
> It configures Docker Compose profiles so you only run the backends you
> actually need. There's a 5-step first-run wizard so you don't need to SSH
> again after the initial deploy.
>
> Technically: Node.js + Express + Socket.io for the backend, SQLite for
> conversation history and metrics, plain HTML/CSS for the UI (no build step).
> Happy to answer questions about any of it.

**Rules:** No hype words. No "excited to share." No asking for stars. Answer
every comment within the first hour.

---

## ProductHunt

**Tagline (58 chars):**
```
Self-hosted AI control plane. No subscriptions, your data.
```

**Founder first comment (post within 60 minutes of going live):**

> Hey Product Hunt! I built Beacon because I was tired of SSH-ing into my VPS
> every time I wanted to switch AI backends.
>
> **The problem:** If you run your own AI stack — OpenClaw for messaging
> integrations, Hermes Agent for autonomous tasks, or Ollama for local LLMs —
> you're managing 3+ Docker services with no unified view. Token costs? You're
> guessing. Routing rules? Edit a YAML file. Model updates? docker exec into
> the container.
>
> **What Beacon does:** It's a self-hosted web dashboard that wraps all three
> backends in one UI. Live status for each service, one-click start/stop/
> restart, backend switching, 7-day token/cost chart, ClawHub skill browser
> (5,700+ skills), Ollama model management, MCP server management, full audit
> logs. Runs on a $6/month VPS. Your data never touches our servers — because
> we don't have any.
>
> **Why self-hosted matters in 2025:** Every time you use a managed AI
> dashboard, your prompts and conversations go to someone else's infrastructure.
> With Beacon, the control plane is yours. Zero subscriptions. No lock-in.
>
> **Technical:** Node.js + Express + Socket.io + SQLite + plain HTML. One-liner
> install via curl or docker compose. MIT licensed, full source on GitHub.
>
> We'd love to hear what backends or integrations you'd want to see next. Drop
> a comment — I'll be here all day.

---

## Reddit r/selfhosted

**Title:**
```
I built a self-hosted dashboard to manage OpenClaw, Hermes Agent, and Ollama
from one UI — no more SSH-ing just to restart a backend
```

**Post body:**

> Been running an AI stack on a cheap Hetzner VPS for the past year — OpenClaw
> handling my Telegram and Discord bots, Ollama running Llama 3 locally, and
> Hermes Agent for autonomous tasks. The problem: three separate Docker
> services, no unified log view, and I kept forgetting which backend was
> actually routing traffic.
>
> I ended up building Beacon — a self-hosted web dashboard that wraps all three.
> It's a `docker compose up` and a 5-step wizard; after that you can manage
> everything from a browser. No accounts, no subscriptions, your VPS stays
> yours.
>
> Features: live log streaming per backend, 7-day token/cost chart, ClawHub
> skill browser (5,700+ skills), Ollama model pull UI, MCP server management,
> conversation history, audit log, Prometheus metrics endpoint.
>
> One-liner install:
> ```
> curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash
> ```
>
> GitHub: https://github.com/hbkdad/selfclawy
>
> Sharing here because this community's feedback shaped what I actually built.
> Happy to answer questions about the setup.

**Cross-post same day:**
- r/homelab — angle: VPS/container management
- r/ChatGPT — angle: free alternative to $20/month AI services
- r/LocalLLaMA — angle: Ollama management UI
- r/opensource — straight product post

---

## Twitter/X Thread

**Tweet 1 (hook — attach dashboard GIF or screenshot):**
```
You're paying $20–100/month for AI tools that train on your conversations.

I built a free alternative that runs on a $6 VPS, manages OpenClaw + Hermes +
Ollama from one dashboard, and keeps every prompt on your own server.

Setup: one command. Here's how it works 🧵
```

**Tweet 2 (show the UI — attach GIF of switching backends):**
```
Beacon gives you one control plane for your entire AI stack:

→ Start/stop/restart any backend
→ Switch active AI routing in one click
→ Live logs per service
→ 7-day token/cost chart

Which backend do you run — Ollama, OpenClaw, or something else?
```
*(Ask a question in tweet 2 to seed replies — X's algorithm weights replies 27x more than likes)*

**Tweet 3 (the install — code block):**
```
One command gets you running:

curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/install.sh | bash

Then open :3001 — a 5-step wizard handles the rest. No more SSH config editing.
```

**Tweet 4 (comparison — attach comparison table image):**
```
How it compares:

LibreChat ❌ container management, ❌ 50+ channels
Open WebUI ❌ skills, ❌ Hermes, ❌ Prometheus
Dify ❌ OpenClaw, ❌ local AI scanner

Beacon ✅ all of the above, $0 forever

github.com/hbkdad/selfclawy
```

**Tweet 5 (CTA):**
```
If this is useful, a ⭐ on GitHub means a lot — it helps other
self-hosters find it.

github.com/hbkdad/selfclawy

Built on OpenClaw (302K ⭐). MIT licensed. Always free.
```

---

## Slack Announcement (#all-hbkcustoms)

```
🟢 Beacon is live — the new name for SelfClawy.

Same dashboard, new identity. Dark theme, electric emerald, no more 🦞.

What's new in this release:
• ClawHub Skill Browser — browse and install 5,700+ skills from the UI
• Conversation log parser — History tab auto-populates from live logs
• Token counts now persist to SQLite (7-day chart is accurate)
• Socket.io auth — WebSocket log stream is now properly protected
• 49 tests passing

Update: docker compose pull && docker compose up -d

GitHub: https://github.com/hbkdad/selfclawy
```

---

## Viral Mechanics — 5 Things Beacon Has That Are Shareable

1. **The 302K anchor** — OpenClaw has 302,000 GitHub stars. Beacon is the
   management UI for something with enormous existing adoption. Lead with this
   everywhere — it instantly establishes credibility.

2. **The $6 VPS hook** — "Runs on a $6 VPS" directly rebuts $20–100/month
   cloud AI pricing. It's screenshot-worthy and triggers sharing from people
   who feel priced out of the AI ecosystem.

3. **The unified control plane problem** — Nobody has built the management
   layer for AI backends (OpenClaw + local LLM + autonomous agent). The "why
   does this exist" answer is immediately legible to anyone running multiple
   AI services.

4. **Zero-SSH after setup** — "I built this so I'd never have to SSH just to
   restart a bot again" is a story the homelab and selfhosted communities
   understand viscerally.

5. **The data sovereignty moment** — 2025–2026 is a genuine inflection point
   for AI privacy. "Your prompts never leave your server" is culturally resonant
   right now in a way it hasn't been before. Beacon isn't just a dashboard —
   it's a statement.

---

## README Improvements (high-ROI, do before launch)

1. **Add a GIF above the fold** — single highest-ROI change. Repos with
   screenshots get 42% more stars; GIFs convert higher than statics.
   Record: switch backends → install a skill → view token chart.

2. **One-liner install FIRST** — before feature bullets, before everything.

3. **Add badges:** Docker pulls, latest release version, ProductHunt badge
   (after launch).

4. **Add "Why Beacon?" section (30 words):**
   > "Every managed AI dashboard sends your prompts somewhere. Beacon runs
   > entirely on your VPS. Your conversations stay yours. $6/month is all
   > the infrastructure you need."

5. **Comparison table vs Portainer + Open WebUI** (not just LibreChat/Dify) —
   container management tools are a bigger reference class for HN readers.
