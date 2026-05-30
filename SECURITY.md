# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.3.x (latest) | ✅ |
| < 1.3 | ❌ |

Always run the latest release. Update with:

```bash
curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/deploy.sh | bash
```

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub's private security advisory](https://github.com/hbkdad/selfclawy/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

You'll receive a response within **72 hours**. If the vulnerability is confirmed, a patch will be released within **7 days** for critical issues.

## Scope

In scope:
- Authentication bypass in the dashboard
- Remote code execution via API endpoints
- SQLite injection
- Exposed secrets in logs or API responses
- Docker socket privilege escalation

Out of scope:
- Issues requiring physical access to the server
- Social engineering
- Issues in OpenClaw, Hermes Agent, or Ollama (report to their respective projects)

## Security Design Notes

Beacon is designed to run on a **private VPS or home server** — not exposed directly to the public internet. For production use:

- Put Beacon behind a reverse proxy (Nginx, Caddy) with TLS
- Use `AUTH_MODE=jwt` for multi-user setups
- Restrict `OPENCLAW_ALLOW_FROM` to trusted phone numbers
- Rotate `JWT_SECRET` and `OPENCLAW_SECRET` regularly
- Never expose port 3001 directly to the internet
