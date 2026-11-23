# Setup and configuration

Commands below run from the repository root. Android and the backend are the
active development and acceptance targets. Existing iOS source is retained.

## Requirements

- Node.js 22.16 or later within major 22, npm and Git.
- PostgreSQL with a private connection URL; the current shared database is Neon.
- FFmpeg/ffprobe for server media validation and media integration tests.
- Android device or emulator for native checks. SQLCipher and push need a native
  build; Expo Go is not the acceptance target.
- For APK builds: EAS CLI signed in, JDK 17, Android SDK/NDK and the existing
  private signing/Firebase client files. See [releases](releases.md).

```sh
npm ci --prefix backend
npm ci --prefix frontend
```

## Environment ownership

Maintain exactly one private dotenv file and one safe template per package:

| File | Contents |
| --- | --- |
| `backend/.env` | Private backend, service profiles and release settings |
| `backend/.env.example` | Canonical server keys, comments and safe defaults |
| `frontend/.env` | Public app/build settings only |
| `frontend/.env.example` | Canonical public app/build template |

Copy a template only when its private file does not already exist. Fill credentials
privately and keep `.env` files owner-readable (`chmod 600`). Templates start with
providers disabled and placeholder connections; they do not provision services.
Leave optional fields commented unless needed; numeric settings cannot be empty.
Never dump private environments into logs, screenshots, prompts or command output.

Backend credentials, sender/device identities, webhook keys and server Firebase
keys never belong in `EXPO_PUBLIC_*`, source, examples or APK assets. Users' account
phone/email and message data belong in authenticated database records. Native
signing files and Firebase credential files keep their required file formats.

### Service profiles

Shared server values appear once under canonical names. `HOSTED_` overrides contain
only actual hosted differences. `GATEWAY_`, `LOCAL_GATEWAY_` and
`HOSTED_GATEWAY_` define WAHA process settings. The selector generates required
vendor aliases and key verifiers; do not maintain copied alias values manually.
Legacy aliases may still be accepted by older deployed code; check that version's
parser before synchronizing settings.

`scripts/environment.mjs` selects and filters settings **in memory**. Profiles:
`backend-local`, `backend-hosted`, `waha-local`, `waha-hosted`, `mail-relay`,
`release`, `frontend-release`. Check output lists key names only:

```sh
node scripts/environment.mjs check backend-hosted
node scripts/environment.mjs run waha-local -- docker compose -f scripts/whatsapp.compose.yaml up -d
```

Never send the complete backend file to Render, WAHA, Neon, Actions or a mobile
build. Sync only the intended service's selected settings to its private platform
configuration. Editing `.env` does not update a hosted service; restart/deploy the
intended consumer and verify it. Relay-mode APIs must not receive SMTP_PASSWORD.
SMTP_USER defines sender identity; SMTP_FROM is generated for consumers.

### URL selection

| Purpose | Rule |
| --- | --- |
| App API | Hosted `EXPO_PUBLIC_SERVER_API_URL` first, including development. Local `EXPO_PUBLIC_API_URL` only if hosted is absent or `EXPO_PUBLIC_API_TARGET=local` is explicit. Releases require hosted HTTPS. |
| Local API | Port 8080; `BACKEND_LOCAL_URL` describes local access. |
| Hosted API | `BACKEND_SERVER_URL`; separate from the local listening address. |
| Recipient content | `CONTENT_PUBLIC_URL`, then BACKEND_SERVER_URL, then legacy EMAIL_PUBLIC_URL. Real sends require remote HTTPS, even from a local worker. |
| WhatsApp | WAHA_LOCAL_API_URL in development; WAHA_SERVER_API_URL in production. No automatic gateway fallback. |
| SMSGate | Canonical SMSGATE_API_URL for the configured Cloud/local connection. |
| Redis | REDIS_LOCAL_URL locally; REDIS_SERVER_URL hosted. Use redis:// or rediss://, not HTTPS or a resource ID. |

A physical phone's localhost is the phone itself. Deliberate local testing needs
reachable LAN access or USB reverse forwarding. Do not expose development auth
publicly. Native clients do not need browser CORS entries. An OTP/write is never
replayed against another backend after a network failure.

## Start development

Review the target database before applying additive migrations. Local and hosted
profiles may share one Neon database: local changes can affect hosted accounts.
Do not use reset or schema push as setup shortcuts.

```sh
npm run prisma:deploy --prefix backend
npm run prisma:generate --prefix backend
npm run dev --prefix backend
```

Start workers separately when testing scheduling and push:

```sh
npm run delivery:worker --prefix backend
npm run push:worker --prefix backend -- --loop
```

Start Metro when Android development is needed:

```sh
npm run android --prefix frontend
```

The API, workers and hosted viewer must agree on database, private object storage
and access-signing key. Stop local workers when not needed. Render uses its hosted
supervisor instead; see [operations](operations.md#hosted-services).

## Enable integrations deliberately

| Integration | Configuration and setup |
| --- | --- |
| Login | AUTH_MODE=whatsapp, stable private OTP_PEPPER, paired WAHA sender. AUTH_MODE=development is loopback-only simulation, rejected in production; disabled is the template default. SMS OTP is not implemented. |
| WhatsApp | WHATSAPP_MODE=waha, GOWS engine, dedicated session, API/HMAC keys and reachable `/webhooks/waha` callback. Preserve local/hosted pairing independently. |
| Gmail | SMTP locally; EMAIL_MODE=relay on Render. The protected Neon Function uses Gmail SMTP. Backend/relay share access-signing settings; only relay/local SMTP needs the Gmail app password. |
| SMS | SMS_PROVIDER=smsgate, SMSGATE_CONNECTION=cloud, exact device ID, private Basic credentials **or** token, SIM and matching phone/backend webhook key. Callback: hosted `/webhooks/smsgate`. |
| Push | PUSH_PROVIDER=expo, matching Expo project and Android FCM V1 credentials. OS permission, saved Push alerts preference and session-bound device registration are separate requirements. |
| Storage | STORAGE_PROVIDER=neon for hosted private objects. Local filesystem is supported for development or a deliberate persistent self-managed volume. STORAGE_ROOT on Render is disposable cache. |

WAHA initialization preserves existing session configuration. Use these only for
the intended Dearly sender; setup does not authorize test messages:

```sh
npm run whatsapp:init --prefix backend
npm run whatsapp:status --prefix backend
npm run whatsapp:pair --prefix backend
npm run sms:status --prefix backend
npm run sms:init --prefix backend
npm run email:verify --prefix backend
```

The pairing helper binds loopback port 3101 for at most 15 minutes. Pair via
WhatsApp Linked devices and stop the helper afterward. It does not send messages.
Never reset/logout/relink a working sender as an environment-cleanup shortcut.
For SMSGate Cloud, keep the Android phone online with its Cloud service running,
SMS/phone permissions granted and SMSGATE_SIM_NUMBER set explicitly. Register only
outbound callbacks; no incoming SMS or address-book import is needed.

An optional local SMS callback receiver (`npm run sms:callback --prefix backend`)
binds only port 8082. If a temporary HTTPS tunnel is deliberately used, expose
that callback-only port, never the development API or Metro. Update callback
registration when its hostname changes; do not resend an accepted SMS.

## Verification

```sh
npm run check --prefix backend
npm run check --prefix frontend
node --test scripts/environment.test.mjs scripts/operations/*.test.mjs scripts/release/*.test.mjs
```

Database integrations require a private **disposable** AUTH_TEST_DATABASE_URL;
backup drills use a loopback DRILL_DATABASE_URL. Tests create isolated schemas or
databases and use fake transports, never real provider messages:

```sh
npm run test:integration --prefix backend
npm run test:integration --prefix frontend
npm run test:backup-drill --prefix backend
```

Documentation-only edits need link/path/anchor and whitespace checks. Native
module/configuration changes also need SDK-matched Expo documentation, Doctor,
Android export and a rebuilt native app as appropriate. Test counts and dated
acceptance evidence belong in private context, not setup instructions.
