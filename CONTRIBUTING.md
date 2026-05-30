# Contributing to Beacon

Thanks for your interest in contributing! Beacon is a self-hosted AI control plane — every bug fix, feature, and documentation improvement helps the community.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold these standards.

---

## Ways to contribute

| Type | Where to start |
|---|---|
| 🐛 Bug fix | [Open issues labeled `bug`](https://github.com/hbkdad/selfclawy/issues?q=label%3Abug) |
| ✨ Feature | [Open issues labeled `enhancement`](https://github.com/hbkdad/selfclawy/issues?q=label%3Aenhancement) |
| 📖 Docs | README, inline comments, landing page |
| 🧪 Testing | Test on ARM, Proxmox, Raspberry Pi, different distros |
| 🌍 Translation | Open an issue first |
| ☕ Support | [Ko-fi](https://ko-fi.com/hbkcustomsinc) |

---

## Getting started

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/selfclawy.git
cd selfclawy

# 2. Configure
cp .env.example .env
# Edit .env — add your Anthropic/OpenAI API key

# 3. Start full stack
docker compose up --build
# Dashboard: http://localhost:3001  (admin / changeme)
# OpenClaw:  http://localhost:18789

# 4. Dashboard only (faster iteration)
cd dashboard && npm install
OPENCLAW_URL=http://localhost:18789 DASHBOARD_PASSWORD=dev npm run dev

# 5. Tests
cd dashboard && npm test      # 49 tests, ~1s
npm run lint                  # eslint
```

---

## Project structure

```
selfclawy/
├── launcher/
│   └── main.go               # Cross-platform Go binary (beacon.exe on Windows)
├── dashboard/
│   ├── server.js             # Express + Socket.io backend (~700 lines)
│   ├── db.js                 # SQLite layer (better-sqlite3)
│   ├── logParser.js          # Log → conversation history parser
│   ├── public/
│   │   ├── index.html        # Main dashboard (tabbed SPA)
│   │   └── setup.html        # First-run wizard
│   └── tests/api.test.js     # Jest + Supertest suite
├── hermes/
│   ├── Dockerfile
│   └── entrypoint.sh
├── config/
│   ├── openclaw.json         # OpenClaw config template
│   └── hermes.yaml           # Hermes config template
├── scripts/
│   ├── install.sh            # curl | bash installer
│   └── deploy.sh             # One-click updater
├── docs/
│   ├── index.html            # Landing page (GitHub Pages)
│   └── launch.md             # Launch copy / playbook
├── docker-compose.yml
└── .env.example
```

---

## Coding style

- **JavaScript**: vanilla Node.js, no unnecessary frameworks; CommonJS modules
- **Go**: standard library only; `gofmt`-formatted; no external dependencies
- **Shell**: POSIX-compatible bash; `set -e`; ShellCheck-clean
- **HTML/CSS**: single-file; no build step; CSS custom properties; no frameworks
- **Docker**: Alpine base images; pinned major versions; healthchecks required

---

## Adding an API route

1. Add the route to `dashboard/server.js` after the relevant section comment
2. Add a stub in the `buildApp()` function in `dashboard/tests/api.test.js`
3. Add at least one test in a new `describe` block

---

## Adding a SQLite table

1. Add `CREATE TABLE IF NOT EXISTS` to `db.js` `initSchema()`
2. Add helper functions and export them
3. Mock the table in the test file's `mockDb` object

---

## Submitting a PR

1. Branch from `main`: `git checkout -b feat/your-thing`
2. Make changes, run `npm test`, ensure 0 failures
3. Open a PR — fill in the template completely
4. A maintainer will review within a few days

**PR requirements:**
- Tests pass (`npm test`)
- No secrets or credentials in the diff
- Description explains *why*, not just *what*
- Scope matches the PR title — one concern per PR

---

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md).

---

## Support the project

Beacon is free and MIT licensed. If it saves you money:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/hbkcustomsinc)
