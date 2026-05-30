# SelfClawy Automation Playbook

Composio connections: GitHub, Gmail, Slack, Linear, Facebook, YouTube, Zapier.
All one-time actions run via Composio. Trigger-based workflows run via Zapier.

---

## Active Connections

| Platform | Account | Status |
|---|---|---|
| GitHub | hbkdad (12 repos) | ✅ Active |
| Gmail | hello@hbkcustoms.ca | ✅ Active |
| Slack | hbkcustoms.slack.com (T0B40AAPH5X) | ✅ Active |
| Linear | Hbkcustoms team | ✅ Active |
| Facebook | HBK Customs Inc. (Page ID: 1015190401688025) | ✅ Active |
| YouTube | HBKcustoms Inc (UCWkLYucs6D_9EAyZ7lV3xqA) | ✅ Active |

Key IDs:
- Linear team ID: `53d74a9f-436c-4085-bbef-9c8b7f341f60`
- Slack #all-hbkcustoms: `C0B4SPH0RG8`
- Slack #social: `C0B423SQ04C`

---

## Zapier Trigger-Based Workflows

### 1. GitHub Issue → Linear Sync
**Trigger**: New issue opened on `hbkdad/selfclawy`
**Action**: Create Linear issue in Hbkcustoms team

Zapier config:
- Trigger app: **GitHub** → Event: "New Issue"
- Repo: `hbkdad/selfclawy`
- Action app: **Linear** → Event: "Create Issue"
- Team: `53d74a9f-436c-4085-bbef-9c8b7f341f60`
- Title: `[GitHub #{{issue_number}}] {{issue_title}}`
- Description: `{{issue_body}}\n\n---\nGitHub: {{issue_url}}`
- Priority: Normal (3)

---

### 2. New YouTube Video → Facebook Cross-Post
**Trigger**: New video uploaded on HBKcustoms Inc channel
**Action**: Post to HBK Customs Inc. Facebook page

Zapier config:
- Trigger app: **YouTube** → Event: "New Video in Channel"
- Channel: `UCWkLYucs6D_9EAyZ7lV3xqA`
- Action app: **Facebook Pages** → Event: "Create Page Post"
- Page: HBK Customs Inc. (1015190401688025)
- Message: `New video: "{{video_title}}"\n\n{{video_description|truncate:200}}\n\n▶️ Watch: https://youtu.be/{{video_id}}\n\n🐙 GitHub: https://github.com/hbkdad/selfclawy`

---

### 3. Customer Support Auto-Triage
**Trigger**: New email to hello@hbkcustoms.ca with subject matching "SelfClawy" or "support" or "bug"
**Actions**:
1. Create Linear issue (priority: High, team: Hbkcustoms)
2. Send Gmail reply acknowledging receipt

Zapier config (multi-step):
- Trigger: **Gmail** → Event: "New Email Matching Search"
- Filter: `to:hello@hbkcustoms.ca subject:(SelfClawy OR support OR bug OR help)`
- Action 1: **Linear** → "Create Issue"
  - Title: `Support: {{email_subject}}`
  - Description: `From: {{sender_email}}\n\n{{email_body}}`
  - Priority: High (2)
- Action 2: **Gmail** → "Send Email"
  - To: `{{sender_email}}`
  - Subject: `Re: {{email_subject}}`
  - Body: See template below

Auto-reply template:
```
Hi,

Thanks for reaching out about SelfClawy! We've received your message and created a support ticket.

We typically respond within 24 hours. In the meantime:
- Docs: https://github.com/hbkdad/selfclawy/blob/main/docs/SETUP.md
- Issues: https://github.com/hbkdad/selfclawy/issues
- Logs: run `docker compose logs -f dashboard` on your server

Thanks,
HBK Customs team
```

---

### 4. Weekly Performance Digest
**Trigger**: Every Monday at 9:00 AM Eastern
**Actions**: Compile stats → Gmail draft

Zapier config:
- Trigger: **Schedule by Zapier** → Every Monday 9AM
- Action 1: **GitHub** → "Get Repository" (`hbkdad/selfclawy`)
- Action 2: **YouTube** → "List Channel Videos" (latest 5)
- Action 3: **Gmail** → "Create Draft"
  - To: hello@hbkcustoms.ca
  - Subject: `SelfClawy Weekly Digest — {{zap_meta_humanized_datetimestamp}}`
  - Body: Stars: {{github_stargazers_count}} | Forks: {{github_forks_count}} | Open issues: {{github_open_issues_count}}

---

### 5. GitHub Tag → Release Announcement
**Trigger**: New tag pushed matching `v*` on `hbkdad/selfclawy`
**Actions**:
1. Post to Slack #all-hbkcustoms
2. Post to Facebook page

Zapier config:
- Trigger: **GitHub** → Event: "New Tag"
- Repo: `hbkdad/selfclawy`
- Filter: Tag name starts with `v`
- Action 1: **Slack** → "Send Channel Message"
  - Channel: `C0B4SPH0RG8`
  - Message: `🦞 SelfClawy {{tag_name}} released!\n\nChangelog: https://github.com/hbkdad/selfclawy/releases/tag/{{tag_name}}\n\nUpdate: \`curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/deploy.sh | bash\``
- Action 2: **Facebook Pages** → "Create Page Post"
  - Message: `🦞 SelfClawy {{tag_name}} is out!\n\nhttps://github.com/hbkdad/selfclawy/releases/tag/{{tag_name}}`

---

## One-Time Composio Actions (Completed)

| Date | Action | Result |
|---|---|---|
| 2026-05-30 | Slack v0.3.0 announcement → #all-hbkcustoms | ✅ Posted |
| 2026-05-30 | Facebook v0.3.0 feature post | ✅ Posted (1015190401688025_122101387598586663) |
| 2026-05-30 | Facebook YouTube video cross-post | ✅ Posted (1015190401688025_122101387706586663) |
| 2026-05-30 | Linear HBK-5 release tracking issue | ✅ Created |
| 2026-05-30 | Gmail v0.3.0 announcement draft | ✅ Saved |
| 2026-05-30 | Gmail weekly digest draft | ✅ Saved |

---

## Content Calendar

### Launch Week (May 30, 2026)
- [x] GitHub repo live
- [x] v0.3.0 PR open
- [x] YouTube Shorts: "I stopped paying for AI hosting"
- [x] YouTube long-form: "I Replaced a $20/Month AI Service"
- [x] Slack + Facebook + Gmail announcements

### Next 7 Days
- [ ] Merge PR #1 → tag `v0.3.0`
- [ ] ProductHunt launch ("SelfClawy — Free self-hosted OpenClaw dashboard")
- [ ] Hacker News: Show HN post
- [ ] Reddit posts: r/selfhosted, r/homelab, r/ChatGPT, r/opensource
- [ ] YouTube: v0.3.0 dashboard walkthrough (setup wizard → first AI message)
- [ ] Twitter/X thread: feature breakdown

### Post-Launch
- [ ] Dev.to article: "How I built a management dashboard for a 302K-star open source project"
- [ ] Video: Hermes Agent setup + self-improving memory demo
- [ ] Video: Local LLM with Ollama — zero API cost AI assistant
