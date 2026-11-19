# Environment setup

## Current configuration

| Setting | Location | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `backend/.env` only | Supplied Neon PostgreSQL connection; preserve its SSL/channel-binding query parameters |
| `PORT=8080` | `backend/.env` | Local Express listening port |
| `BACKEND_LOCAL_URL=http://localhost:8080` | `backend/.env` | Explicit local Dearly backend address |
| `BACKEND_SERVER_URL=` | `backend/.env` | Future hosted Dearly backend address; empty until supplied |
| `REDIS_LOCAL_URL=redis://localhost:6379` | `backend/.env` only | Optional local cache connection; existing `REDIS_URL` remains a local alias |
| `REDIS_SERVER_URL=` | `backend/.env` only | Future hosted Redis TCP/TLS connection; no production fallback to local |
| `AUTH_MODE=whatsapp` | `backend/.env` | Real login OTP through the paired free WAHA sender; committed default remains disabled |
| `WHATSAPP_OTP_DAILY_LIMIT=20` | `backend/.env` or default | Separate persistent per-sender OTP limit |
| `SMS_PROVIDER=disabled` | `backend/.env` | Enable only after physical SMSGate sender setup; see SMS guide |
| `SMSGATE_LOCAL_API_URL` / `SMSGATE_SERVER_API_URL` | `backend/.env` | Selected SMSGate Cloud gateway for local backend / explicit future server; no production fallback |
| `OTP_PEPPER` | `backend/.env` only | Private generated OTP hashing key |
| `EXPO_PUBLIC_API_URL=http://localhost:8080` | `frontend/.env` | Local backend base URL |
| `EXPO_PUBLIC_SERVER_API_URL=` | `frontend/.env` | Future hosted backend base URL; intentionally empty |
| `EXPO_PUBLIC_APP_ENV=development` | `frontend/.env` | Current development environment |

The database is hosted on Neon even while the backend runs locally. The future
hosted API URL is an HTTP(S) application address, separate from the PostgreSQL
connection string. Never put database credentials in the frontend.

Private `.env` files are ignored by Git. Committed `.env.example` files contain
only safe placeholders/public defaults. On a fresh checkout, copy each example
to `.env` and supply the real backend database connection privately. Other backend
example settings are validated as features are implemented. Phase 4's local
simulation remains available only through explicit `AUTH_MODE=development`;
Phase 13 adds real WhatsApp OTP. Redis remains optional. See
[auth setup and contracts](authentication.md) for mode guards, migration and tests.

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


Development OTP mode requires a loopback backend bind. Do not change HOST to a
LAN/public address while it is enabled or expose it through a proxy/tunnel. Use
iOS Simulator localhost or local adb reverse for development; physical-device/public
login requires a real verified OTP adapter and subsequent configuration review.
JWT environment placeholders are obsolete; sessions use opaque database-backed tokens.

## Phase 12 email configuration

Gmail SMTP credentials are private backend values. `EMAIL_PUBLIC_URL` currently
uses `http://localhost:8080`; the future hosted frontend/API URL remains empty.
`EXTERNAL_ACCESS_SECRET` is a separate persistent random key. Changing it invalidates
all existing email links. `EMAIL_DAILY_LIMIT=100` reserves a conservative rolling
24-hour budget; external sending from the same Gmail account shares Google's
actual limits and is not measured by Dearly. See [email setup](email-delivery.md).

For future migrations, use Neon's unpooled connection through a private migration
process environment, preserving SSL settings. Application runtime keeps the pooled
`DATABASE_URL`. This phase encountered a stale pooled advisory lock. After verifying
no migration command was running, only the pending additive revocation migration
was applied over a direct connection with a one-process advisory-lock bypass; no
sessions were terminated and no bypass was saved in the app environment. Do not
use that bypass for concurrent migrations. See [Neon/Prisma connection guidance](https://neon.com/blog/prisma-dx-improvements)
and [Prisma advisory locking](https://docs.prisma.io/docs/orm/v6/reference/environment-variables-reference).

## Phase 13 WhatsApp local/server selection

`WHATSAPP_MODE=waha` enables the private configured Core integration. Development
uses `WAHA_LOCAL_API_URL=http://localhost:3100`; production requires an explicitly
set `WAHA_SERVER_API_URL` and never falls back to the local URL. The hosted value
is still empty. API and callback HMAC keys are separate server secrets. `WAHA_ENGINE=GOWS`
is selected after successful pairing; `WAHA_SESSION=default` matches the single free
Core sender. `CONTENT_PUBLIC_URL` optionally replaces the compatible `EMAIL_PUBLIC_URL`
setting for shared recipient links. Its existing localhost value stays in effect;
the frontend hosted URL is still empty. See [WhatsApp setup](whatsapp-delivery.md).

The optional local pairing helper binds port 3101 only while requested and expires
after 15 minutes. It is not a deployed setup/admin endpoint. Do not expose it, gateway
session files or the development OTP backend as a public service. Real remote content
access requires the planned hosted HTTPS URL, not replacing loopback development auth.

For SMSGate credentials, device signing key, SIM selection and USB forwarding, see
[SMS setup](sms-delivery.md). None of those values belong in frontend variables.


## Redis and application addresses

Redis remains optional and is not connected by the current runtime. These settings
prepare configuration; they do not enable a new cache, change durable PostgreSQL
work, or claim a Redis health check passed. Development selects `REDIS_LOCAL_URL`
(or legacy `REDIS_URL`); production selects only `REDIS_SERVER_URL` if supplied.
Accepted Redis schemes are `redis://` and `rediss://`; credentials stay backend-only.
Use `redis://redis:6379` only for a backend container sharing a Docker network with
a service named `redis`. The backend currently runs on this Mac, so its existing
`redis://localhost:6379` setting is preserved.

The user corrected the hosted reference to a Render internal Key Value hostname.
Private `REDIS_SERVER_URL` now uses that hostname with the standard `redis://`
scheme and port 6379. This is an internal-only configuration candidate; the exact
Render Connect URL, any required authentication, workspace and region must be
confirmed before deployment. It is not verified reachable from this Mac. Use the
External URL and authorized network access if testing hosted Redis from the Mac.
The previous HTTPS reference is no longer treated as the Redis address. Redis
itself remains optional and inactive in the current application.

The mobile client already keeps distinct local/server URLs in
`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SERVER_API_URL`. The local value remains
`http://localhost:8080` for the iOS simulator; the hosted value stays empty. A real
phone's localhost means that phone, not the Mac: physical-device API testing needs
an intentionally reachable Mac address or the future hosted backend. Redis URLs
must never be copied to frontend/public variables.
