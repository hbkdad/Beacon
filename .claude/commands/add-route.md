Add a new API route to the SelfClawy dashboard.

Usage: /add-route GET /api/example "description of what it does"

Steps:
1. Read dashboard/server.js to find where to insert (before httpServer.listen)
2. Add the route handler with proper auth middleware
3. Add a corresponding stub route to the buildApp() function in dashboard/tests/api.test.js
4. Add a describe/it test block in dashboard/tests/api.test.js
5. Run npm test to confirm all tests pass
6. If it touches SQLite, add helper functions to dashboard/db.js first

Route template:
```js
app.METHOD('/api/path', auth, async (req, res) => {
  try {
    // implementation
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

POST/DELETE routes also need `verifyCsrf` middleware after `auth`.
