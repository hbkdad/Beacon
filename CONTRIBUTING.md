# Contributing to SelfClawy 🦞

Thanks for wanting to contribute! SelfClawy is maintained by one person — every PR, bug report, and star helps.

## Ways to contribute

- **Fix a bug** — check [open issues](https://github.com/hbkdad/selfclawy/issues?q=label%3Abug)
- **Build a feature** — check [enhancement requests](https://github.com/hbkdad/selfclawy/issues?q=label%3Aenhancement)
- **Improve docs** — README, inline comments, or the landing page
- **Test on your hardware** — Raspberry Pi, Proxmox, ARM servers, etc.
- **Support the project** — [☕ Ko-fi](https://ko-fi.com/hbkcustomsinc)

---

## Getting started

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/selfclawy.git
cd selfclawy

# 2. Configure
cp .env.example .env && nano .env

# 3. Start
docker compose up --build
# Dashboard: http://localhost:3001  (admin / changeme)
# OpenClaw:  http://localhost:18789

# 4. Dashboard standalone (faster iteration)
cd dashboard && npm install
OPENCLAW_URL=http://localhost:18789 DASHBOARD_PASSWORD=dev npm run dev
```

---

## Project structure

```
selfclawy/
├── scripts/install.sh          # One-liner installer
├── dashboard/
│   ├── server.js               # Express + Socket.io backend
│   ├── public/index.html       # Dark-mode management UI
│   └── Dockerfile
├── config/openclaw.json        # OpenClaw gateway config template
├── docs/index.html             # Landing page (GitHub Pages)
├── .github/
│   ├── FUNDING.yml
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── docker-compose.yml
└── .env.example
```

---

## Coding style

- **JavaScript**: vanilla Node.js, no unnecessary frameworks
- **Shell**: POSIX bash, `set -e`, shellcheck-clean
- **HTML/CSS**: single-file, no build step, CSS variables
- **Docker**: Alpine images, pinned versions

---

## Submitting a PR

1. Branch from `main`: `git checkout -b feat/my-thing`
2. Make your changes and test locally
3. Open a PR and fill in the template

---

## Support the project

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/hbkcustomsinc)
