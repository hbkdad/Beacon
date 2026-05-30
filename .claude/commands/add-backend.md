Add a new backend service to SelfClawy.

Usage: /add-backend name port health-path "description"

Steps:
1. Read docker-compose.yml — add new service with appropriate profile
2. Read dashboard/server.js — add entry to the BACKENDS object:
   ```js
   newbackend: { container: 'container-name', url: 'http://localhost:PORT', healthPath: '/health', port: PORT }
   ```
3. Add Docker Compose service (with profile so it's opt-in)
4. Add to .env.example: `NEWBACKEND_PORT`, `NEWBACKEND_URL` etc.
5. Update the install.sh backend selection menu
6. Add the backend tab to dashboard/public/index.html backend-tabs div
7. Run npm test — add any needed stubs to api.test.js

Remember:
- All backends must appear in getBackendStatus() which uses docker.getContainer()
- The backendUp and backendUptime objects track all backends
- The setInterval loop polls all BACKENDS entries
