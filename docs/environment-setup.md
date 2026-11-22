# Environment setup

## Configuration ownership

| File/settings | Purpose | Committed? |
| --- | --- | --- |
| `backend/.env` | Single private source for local backend, hosted/service profiles and release tools | No; mode 600 |
| `backend/.env.example` | Single safe backend template covering all profiles | Yes |
| `frontend/.env` | Single public/build configuration source, including API URLs and Expo identity | No; mode 600 |
| `frontend/.env.example` | Single safe frontend template | Yes |
| Render backend / WAHA settings | Private service-specific settings injected by the host | Platform settings, not extra repository env files |
| Neon Gmail relay settings | Private service-specific Gmail configuration; database URL injected by Neon | Platform settings, not extra repository env files |

### Single-source profiles

`backend/.env` retains the existing unprefixed local Express keys. Other sections
use explicit prefixes so local and hosted credentials never silently overwrite
one another:

- `HOSTED_`: production Express keys, stripped only when deliberately selected.
- `LOCAL_WAHA_SERVICE_` and `HOSTED_WAHA_SERVICE_`: separate gateway environments;
  paired sender identities and API-key verifier formats must stay distinct.
- `MAIL_RELAY_`: Gmail function settings only; Neon injects its database connection.
- `RELEASE_`: trusted local coordinator settings, including the scoped deploy-hook
  path and Render service ID. Signing files remain private native key files.

`node scripts/environment.mjs check backend-hosted` reports key names only.
`run TARGET -- COMMAND` selects values in memory and filters inherited environment
variables; it never prints settings or writes another dotenv file. Available
profiles are `backend-local`, `backend-hosted`, `waha-local`, `waha-hosted`,
`mail-relay`, `release` and `frontend-release`. Never send the complete backend
file to Render, WAHA, Neon, GitHub Actions, an Android build or a log. Supply only
that service's selected keys through its private settings. Editing the local file
does not itself update a running hosted service.

Examples:

```sh
node scripts/environment.mjs run backend-hosted -- docker compose -f scripts/compose.release.yaml up -d
node scripts/environment.mjs run waha-local -- docker compose -f scripts/whatsapp.compose.yaml up -d
sh scripts/build-android-apk.sh
```

The APK script reads only `frontend/.env`, enforces the hosted target/production
mode and passes public values to the local build in memory. `eas.json` contains
build mechanics, not duplicate API configuration. `app.config.js` reads Expo
owner/project identity from the frontend environment; app identifiers, versions,
plugins, styles and protocol/security constants remain source-controlled.
`APP_DOWNLOAD_URL` in each relevant backend/relay profile supplies the public
GitHub Releases destination. Examples contain placeholders, not real identities.

On 22 November 2026, 23 historical plaintext dotenv exports were retired after
an AES-256-GCM encrypted recovery copy was verified. Recovery material is ignored
under `backend/.runtime/environment-consolidation/`; keep its key private and back
it up independently. It is not loaded by application or release tools.

The current topology is in [Render deployment](render-deployment.md). The backend
runs locally on port 8080; Neon remains its remote database. The hosted backend is
`https://dearly-z8zm.onrender.com`, and active WAHA is `https://dearly-waha-singapore.onrender.com`.
Public service URLs are not credentials. Provider keys, connection passwords,
operational sender/test identities and private device IDs are server configuration.
Users' phone/email records are authenticated account data in PostgreSQL, not global
configuration. Never put either class of private data in examples or mobile assets.

## Safe local setup

Copy `backend/.env.example` to the ignored local `.env`, then supply the database
connection privately. The template validates structurally but its database URL is
only a placeholder; no connection or provider availability is implied.
Authentication and delivery providers default to disabled. Local simulated auth
requires an explicit development mode, loopback bind and private OTP pepper; real
login uses WhatsApp with the paired sender. Never expose simulated auth publicly.

Optional fields are omitted/commented unless their validator explicitly accepts
empty strings. Do not uncomment every placeholder. Numeric fields cannot be empty.
`parseEnvironment` reports field names only; it must never echo supplied values.
The new example regression checks run through `npm run check --prefix backend`.

Private environments should have owner-only filesystem permissions. Back them up
privately before editing; do not overwrite the local file with a hosted export.
Do not use `cat`, shell tracing, raw config dumps or screenshots of revealed values
for reporting. Restart the intended process after changing its environment.

## Selection and precedence

| Setting | Development | Production |
| --- | --- | --- |
| Mobile API | `EXPO_PUBLIC_SERVER_API_URL` first; local URL when server is absent or `EXPO_PUBLIC_API_TARGET=local` is explicit | Remote HTTPS server required; local override rejected |
| Backend address metadata | `BACKEND_LOCAL_URL`, defaulting to localhost and PORT; separate `BACKEND_SERVER_URL` | Explicit hosted server URL |
| WhatsApp client | `WAHA_LOCAL_API_URL` | `WAHA_SERVER_API_URL` only; no local fallback |
| SMSGate gateway | `SMSGATE_LOCAL_API_URL` | `SMSGATE_SERVER_API_URL` only; no local fallback |
| Optional Redis | `REDIS_LOCAL_URL`, then legacy `REDIS_URL` | `REDIS_SERVER_URL` only |
| Outgoing recipient origin | `CONTENT_PUBLIC_URL`, then `BACKEND_SERVER_URL`, then legacy `EMAIL_PUBLIC_URL` | Same precedence; hosted HTTPS required |

Mobile API selection does not change backend provider selection. A local backend
can use local WhatsApp, SMSGate Cloud and hosted recipient content. API failure
must never automatically replay an OTP/write against another backend. Configure
local and hosted keys independently; do not copy/relink paired sessions.

Localhost on a physical phone means the phone itself. For deliberately local API
testing, use an intentional reachable LAN address or USB reverse forwarding. Keep
that override private and development-only. Browser CORS origins are separate
from listening addresses; native clients do not require browser CORS entries.

Redis accepts `redis://` or `rediss://`, not an HTTPS application URL or bare Render
resource ID. Render's internal URL is for the hosted network; it is not generally
reachable from this Mac. Redis remains optional and inactive in the current
runtime; configuration does not prove connectivity or implement caching.

## Hosted environment

The `HOSTED_` section intentionally fails validation until private credentials
are supplied. It uses the current public service origins, Gmail relay, private
Neon storage and explicit quotas. Push defaults disabled until the actual project
is configured; the full release preflight additionally requires configured push.
`TRUST_PROXY_HOPS=1` matches the recorded Render setup; review it for another host.

Render uses `node dist/jobs/startHosted.js`, with health path `/health/live`. Keep
Neon object storage as durable media; `/tmp/dearly-attachments` is a disposable
private cache. `PERSISTENT_STORAGE_CONFIRMED=false` is correct for that ephemeral
directory when the validated remote adapter is configured. Do not assert a durable
local mount merely to pass preflight. Self-managed Compose can deliberately use a
persistent filesystem adapter; that is a different topology.

The hosted backend's relay mode needs SMTP_USER/FROM for sender identity and the
relay URL/secret, but does not need SMTP_PASSWORD. That password belongs only in
the Gmail relay and the explicitly configured local SMTP runtime. The relay uses
Neon's injected database connection and the same content origin/access secret as
the backend. Existing issued links depend on those persistent secrets; changing
them casually invalidates access. Keep credentials out of CLI arguments and logs.

The separate WAHA service keeps its dashboard and Swagger disabled, QR printing
off and a SHA512 verifier for its API key. The backend uses the corresponding
plaintext client key. Set strong private dashboard/Swagger passwords even when
those interfaces are disabled, to avoid the startup auto-generation/logging path.
Preserve the paired namespace, worker identity, session database and pinned image.
Do not reset/relink a session as environment cleanup. Consult the exact installed
engine's database requirements before changing connection mode.

SMSGate Cloud uses the real Android/SIM and explicit device identity. Keep the
phone Signing Key and backend webhook secret equal. A cloud bearer token is an
alternative to username/password, not an additional credential to combine with
them. SIM 1 is the configured sender. No example authorizes a real test message.

## Maintenance-only inputs

`BACKUP_ENCRYPTION_KEY` is independent of access/OTP/webhook secrets and needs an
independent secure backup. `PG_DUMP_BIN` and `PG_RESTORE_BIN` point to tools
compatible with the source PostgreSQL major version (hosted database: 18).
`RESTORE_DATABASE_URL` and `RESTORE_STORAGE_ROOT` are separate empty isolated
targets, never the live source. `SMSGATE_CALLBACK_URL` is consumed by SMS setup and
release checks; `PERSISTENT_STORAGE_CONFIRMED` is consumed by release preflight.
`LOCAL_WAHA_SERVICE_WAHA_IMAGE` is a Compose-only profile input, not an Express configuration field.
See [operations/recovery](release-operations.md) before using these settings.

## Credential replacement and verification

Generate replacements privately, update every real consumer in a coordinated
order, verify authentication without sending, then revoke the old credential.
Backups or signed links may depend on existing keys; preserve those contracts.
If the provider revokes the previous credential immediately, plan the interruption
rather than pretending both keys overlap. Gmail and SMSGate account/phone actions
may require the user. Never paste replacements into chat.

Check three different things: configuration shape, service availability and real
provider/device behavior. Passing the first does not prove the others. For this
phase, read-only health/auth checks are sufficient to verify credential rollout;
new live OTP/email/SMS tests require specific authorization. Record unfinished
rotation work in [the follow-up checklist](follow-up-phases.md).

## Guardrails in automation

The example tests require every validated field and known operations input to be
documented, reject duplicate active keys, verify disabled local defaults, prove
hosted relay configuration works without an SMTP password on Render, and check
examples/mobile public variables for common credential/personal-data mistakes.
These checks complement private-value scans; they are not proof that no possible
secret exists anywhere in Git history. Release packaging also excludes private
runtime files, environments, signing material and dependencies from source ZIPs.


## Hosted WAHA relocation identity

`WAHA_SERVER_API_URL` selects the actual hosted transport. For the same paired
sender moved to Singapore, `WAHA_SERVER_SCOPE_ORIGIN` retains the old hosted HTTPS
origin to preserve quota and receipt matching. It must be a credential-free remote
HTTPS origin. Omit it for new senders; never merge unrelated accounts/sessions.
It is ignored in development so the independently paired local gateway retains
its own identity. This setting does not redirect network requests. The hosted section of the single
example and validator cover this optional field. See [deployment](render-deployment.md)
and [Phase 19 evidence](otp-performance.md). Credentials remain in private settings.
