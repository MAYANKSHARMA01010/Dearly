# Environment setup

## Current configuration

| Setting | Location | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `backend/.env` only | Supplied Neon PostgreSQL connection; preserve its SSL/channel-binding query parameters |
| `PORT=8080` | `backend/.env` | Local Express port when the server is implemented |
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
implemented; this task does not establish production authentication or Redis.

## API client behavior to implement in Phase 3

- Development uses `EXPO_PUBLIC_API_URL`.
- Hosted/production use requires a nonempty `EXPO_PUBLIC_SERVER_API_URL` and must
  report missing configuration instead of silently falling back to localhost.
- Keep the hosted value empty until a real deployment URL exists. Restart the
  frontend development process after changing environment settings.

These are configuration requirements, not implemented API-selection logic. The
backend server and frontend API client do not exist yet. No server was started,
database connection tested, schema pushed, or migration applied during this setup.

## Running on a device later

`localhost` refers to the device running the app. The default is suitable when
the app can reach the backend on the same host. For a physical phone, set the
local API value to the development computer's LAN address with port `8080` and
ensure the server accepts LAN connections. For an Android emulator, use its
host-machine address (commonly `http://10.0.2.2:8080` for the standard emulator).
Keep these machine-specific overrides in the private environment file.

Client/CORS origins such as Expo's development port are separate from the backend
listening port. Do not change them all to `8080` merely because Express uses it.
