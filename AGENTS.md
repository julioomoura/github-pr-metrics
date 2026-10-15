# AGENTS.md — GitHub PR Metrics Dashboard

## Verify loop

There is no test suite, linter, typechecker, or build step. Verify changes with:

```bash
cd backend
node --check server.js
node --check githubClient.js
node --check metricsCalculator.js
node --check cache.js
node --check ../frontend/script.js
```

End-to-end validation:

1. Create `backend/.env` from `.env.example` with `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GHE_HOSTNAME`.
2. `cd backend && node server.js`
3. Open `http://localhost:3000`.

## Project structure

- `backend/` — Node.js backend (ES modules).
  - `server.js` — HTTP server, static file serving, API routes.
  - `githubClient.js` — GitHub Enterprise GraphQL client with caching and multi-repo fetching.
  - `metricsCalculator.js` — PR metric calculations.
  - `cache.js` — In-memory TTL cache.
- `frontend/` — Vanilla HTML/CSS/JS dashboard, served statically by the backend.
  - `index.html`, `style.css`, `script.js`.
  - No build step.

## Environment & conventions

- Node.js >= 22 required (`"type": "module"` in `backend/package.json`).
- Backend env vars live in `backend/.env` (ignored by `.gitignore`).
- Frontend repo list is configured in the UI and persisted to `localStorage`.
- Backend caches are in-memory only and reset on server restart.
- No formatter or linter is configured.
