# Environment setup

## Current configuration

| Setting | Location | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `backend/.env` only | Supplied Neon PostgreSQL connection; preserve its SSL/channel-binding query parameters |
| `PORT=8080` | `backend/.env` | Local Express listening port |
| `EXPO_PUBLIC_API_URL=http://localhost:8080` | `frontend/.env` | Local backend base URL |
| `EXPO_PUBLIC_SERVER_API_URL=` | `frontend/.env` | Future hosted backend base URL; intentionally empty |
| `EXPO_PUBLIC_APP_ENV=development` | `frontend/.env` | Current development environment |

The database is hosted on Neon even while the backend runs locally. The future
hosted API URL is an HTTP(S) application address, separate from the PostgreSQL
connection string. Never put database credentials in the frontend.

Private `.env` files are ignored by Git. Committed `.env.example` files contain
only safe placeholders/public defaults. On a fresh checkout, copy each example
to `.env` and supply the real backend database connection privately. Other backend
example settings are scaffolding and must be validated when their features are
implemented; Phase 2 does not establish production authentication or Redis.

Backend defaults are `HOST=127.0.0.1`, `LOG_LEVEL=info`, a 1 MiB JSON body limit,
and a 10-second graceful-shutdown deadline. New settings in `backend/.env.example`
are optional defaults, so the existing private environment file remains usable.
See [backend setup](../backend/README.md) for all runtime settings and checks.

## API client behavior

- Development uses `EXPO_PUBLIC_API_URL`.
- Hosted/production use requires a nonempty HTTPS `EXPO_PUBLIC_SERVER_API_URL` and must
  report missing configuration instead of silently falling back to localhost.
- Keep the hosted value empty until a real deployment URL exists. Restart the
  frontend development process after changing environment settings.

Phase 3 implements this selection in `frontend/src/config/api.js`. Release builds
require the hosted URL even if `EXPO_PUBLIC_APP_ENV` was accidentally left as
`development`; local fallback is never used in a release. While the hosted URL is
empty, a release's service-status screen reports missing configuration. Development
continues against the local server. The original environment-only
setup did not start it or change the database; Phase 2 runtime verification is
recorded in the [phase plan](implementation-phases.md). No schema push or migration
is needed for the Phase 2 `SELECT 1` readiness probe.

## Running on a device later

`localhost` refers to the device running the app. The default is suitable when
the app can reach the backend on the same host. For a physical phone, set the
local API value to the development computer's LAN address with port `8080` and
ensure the server accepts LAN connections. For an Android emulator, use its
host-machine address (commonly `http://10.0.2.2:8080` for the standard emulator).
Keep these machine-specific overrides in the private environment file.

With an Android emulator/device attached through adb, an alternative that preserves
the localhost URL is `adb reverse tcp:8080 tcp:8080`. Reverse the Metro port too
when using a localhost development server. This is a local development tunnel,
not a deployed API. Restart Expo after changing public environment values.

Client/CORS origins such as Expo's development port are separate from the backend
listening port. Do not change them all to `8080` merely because Express uses it.
