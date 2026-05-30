# SelfClawy — Project Memory

## What This Is
SelfClawy is a self-hosted Docker management dashboard for the OpenClaw AI ecosystem. It wraps three optional backends in a unified Node.js/HTML web UI:
- **OpenClaw** (always on): Node.js AI gateway, 50+ messaging channels, ClawHub skills (5,700+), port 18789
- **Hermes Agent** (optional, profile `hermes`): Python self-improving agent, 23 platforms, port 8080
- **Ollama** (optional, profile `ollama`): Local LLM runner, port 11434

Users manage all three backends from a single dashboard at port 3001.

## Repo Layout
```
selfclawy/
├── dashboard/
│   ├── server.js          # Express API + Socket.io (21+ routes)
│   ├── db.js              # SQLite layer (better-sqlite3)
│   ├── public/
│   │   ├── index.html     # Main dashboard (tabbed: Dashboard/History/Team/Settings)
│   │   └── setup.html     # First-run wizard (5 steps)
│   ├── tests/
│   │   └── api.test.js    # Jest+Supertest, 31 tests
│   └── package.json       # v1.2.0
├── hermes/
│   ├── Dockerfile         # python:3.11-slim + NousResearch/hermes-agent
│   └── entrypoint.sh      # Writes ~/.hermes/config.yaml from env, runs hermes gateway
├── config/
│   ├── openclaw.json      # OpenClaw config
│   └── hermes.yaml        # Hermes gateway config
├── scripts/
│   ├── install.sh         # One-liner installer (curl | bash)
│   └── deploy.sh          # One-click update for existing installs
├── docker-compose.yml     # 5 services: openclaw, hermes, ollama, dashboard, watchtower
├── docker-compose.gpu.yml # NVIDIA GPU override for Ollama
├── .env.example
├── README.md
└── CHANGELOG.md
```

## Key Architecture Decisions
- **State file** (`/data/state.json`): tracks `activeBackend` and `setup_complete`
- **SQLite DB** (`/data/selfclawy.db`): conversation history, metrics, audit log, MCP servers, routing rules, presets, notifications
- **Docker Compose profiles**: `hermes`, `ollama`, `autoupdate` — controlled by `COMPOSE_PROFILES` env var
- **Auth modes**: `basic` (HTTP Basic Auth, default) or `jwt` (multi-user with bcrypt+JWT)
- **CSRF**: double-submit cookie pattern on all POST/DELETE routes
- **Socket.io**: live log streaming per backend
- **Metrics polling**: every 15s checks all backends, writes to SQLite + sends webhook alerts

## API Routes (server.js)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/setup/status | Check if setup wizard complete |
| POST | /api/setup/complete | Mark setup done, set password |
| GET | /api/status | OpenClaw status (legacy) |
| GET | /api/backends | All 3 backends status + activeBackend |
| GET | /api/status/:backend | Per-backend status |
| POST | /api/backend/switch | Switch active backend |
| POST | /api/start|stop|restart | OpenClaw controls (legacy) |
| POST | /api/:backend/start|stop|restart | Per-backend controls |
| GET | /api/scan/local-ai | Scan ports for local AI services |
| GET | /api/config | Read openclaw.json |
| POST | /api/config | Update provider model |
| GET | /api/ollama/models | List Ollama models |
| POST | /api/ollama/pull | Pull Ollama model (SSE stream) |
| POST | /api/hermes/migrate | Run hermes claw migrate via docker exec |
| GET | /api/history | Conversation history (SQLite) |
| GET/DELETE | /api/history/:id | Single conversation |
| GET | /api/users | List users |
| POST | /api/users | Create user (JWT mode) |
| PATCH/DELETE | /api/users/:username | Update/delete user |
| GET | /api/mcp/servers | List MCP servers |
| POST | /api/mcp/servers | Add MCP server |
| DELETE | /api/mcp/servers/:id | Remove MCP server |
| POST | /api/mcp/servers/:id/test | Test MCP connection |
| GET/POST/DELETE | /api/routing | Routing rules |
| GET/POST/DELETE | /api/presets | Persona presets |
| GET | /api/audit | Audit log |
| GET | /api/notifications | Notifications + unread count |
| POST | /api/notifications/:id/read | Mark read |
| GET | /api/metrics | In-memory metrics |
| GET | /api/metrics/history | 7-day SQLite metrics |
| GET | /metrics | Prometheus text format |
| POST | /api/backup | Download .tar.gz backup |
| POST | /api/login | JWT login |

## SQLite Schema (db.js)
- `conversations(id, backend, channel, user, message, role, timestamp, tokens, model)`
- `daily_metrics(date, backend, tokens, errors, requests)` — PK (date, backend)
- `audit_log(id, user, action, target, result, timestamp, ip)`
- `notifications(id, type, title, body, read, timestamp)`
- `mcp_servers(id, name, url, auth_token, enabled, created_at)`
- `routing_rules(id, condition_type, condition_value, target_model, target_backend, priority, enabled)`
- `presets(id, name, system_prompt, model, channel, created_at)`

## Environment Variables (.env.example)
```
ANTHROPIC_API_KEY, ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY, GEMINI_API_KEY
OPENCLAW_PORT=18789, OPENCLAW_SECRET
DASHBOARD_PORT=3001, DASHBOARD_PASSWORD=changeme
AUTH_MODE=basic, JWT_SECRET
ALERT_WEBHOOK_URL
TELEGRAM_TOKEN, DISCORD_TOKEN
OPENCLAW_ALLOW_FROM
COMPOSE_PROFILES=                 # hermes, ollama, autoupdate, or combo
HERMES_PORT=8080, HERMES_SECRET, OLLAMA_BASE_URL
OLLAMA_PORT=11434
```

## Development Commands
```bash
cd dashboard
npm install          # install deps
npm test             # jest --runInBand --forceExit (31 tests)
npm run lint         # eslint server.js
npm start            # node server.js

# Docker
docker compose up -d --build        # start all
docker compose up -d --build dashboard  # rebuild only dashboard
docker compose logs -f dashboard    # live logs
docker compose --profile hermes up -d  # enable Hermes
```

## Test Architecture (tests/api.test.js)
- Mocks `dockerode` (container inspect/start/stop/restart/logs/exec)
- Mocks `node-fetch` (health checks and Ollama API)
- Mocks `better-sqlite3` (in-memory stub, no real DB)
- Builds a minimal Express app mirroring server.js logic
- All 31 tests use `supertest` against the in-memory app
- Auth header: `Authorization: Basic YWRtaW46dGVzdHBhc3M=` (admin:testpass)

## Unique SelfClawy Advantages
1. **Only tool** that unifies OpenClaw (302K ⭐) + Hermes Agent + Ollama in one dashboard
2. **Setup wizard** — zero SSH after initial deploy
3. **Local AI scanner** — auto-detects Ollama, LM Studio, llama.cpp, Jan AI, vLLM
4. **ClawHub access** — 5,700+ community skills via OpenClaw
5. **MCP management** — add/test/remove MCP servers from UI
6. **Cost tracking** — 7-day token chart, per-model breakdown

## Competitors
| Tool | Stars | Key Diff |
|------|-------|----------|
| Open WebUI | 139K | Chat UI for local models only |
| LibreChat | 34K | Chat UI, no container management |
| Dify | 131K | Workflow builder, no channel integrations |
| SelfClawy | — | Container mgmt + 50+ channels + skills + routing |

## Branching & CI
- Active feature branch: `claude/repo-scan-competitive-analysis-Sge5L`
- CI: `.github/workflows/ci.yml` — lint + jest on push/PR
- Tests must pass before merging to main
- PR #1 is open for this feature branch

## Common Tasks for Claude Code
- **Add a new API route**: add to server.js, add route stub to tests/api.test.js buildApp(), add test describe block
- **Add SQLite table**: add CREATE TABLE to db.js initSchema, add helper functions, export them
- **Update UI**: edit dashboard/public/index.html — CSS vars are in :root, JS is inline at bottom
- **Add a new Docker service**: add to docker-compose.yml with appropriate profile, add to BACKENDS in server.js
