Check the current state of the SelfClawy project.

Run these checks in parallel:
1. `git log --oneline -5` — recent commits
2. `git status --short` — uncommitted changes
3. `cd /home/user/selfclawy/dashboard && npm test 2>&1 | tail -5` — test status
4. `wc -l /home/user/selfclawy/dashboard/server.js /home/user/selfclawy/dashboard/public/index.html /home/user/selfclawy/dashboard/db.js` — line counts

Report:
- Branch and last 5 commits
- Any uncommitted changes
- Test pass/fail count
- File sizes
- Any obvious issues
