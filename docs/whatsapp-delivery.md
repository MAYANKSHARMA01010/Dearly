# WhatsApp delivery — Phase 13

## Selected approach

Use the Apache-2.0 WAHA Core/free image and GOWS engine, one dedicated `default`
sender session. No Plus subscription, paid media feature, or Meta Cloud API is
required. Adapt only ShopSmart's HTTP boundary: E.164 destinations never receive
an assumed country prefix. PHONE recipients explicitly choose either IN_APP or
WHATSAPP; there is no fallback or sending both channels silently. WhatsApp sends a
short notification and the existing private content link. Direct media is out of
scope for this phase. Pair a separate Dearly session; never read/copy ShopSmart's
credentials or session volume.

Local Docker uses this Mac's resources and must stay running for scheduled sends.
The same pinned image and persistent-volume configuration can run on a server.
WAHA software is free; hosting, connectivity and the WhatsApp account are separate
requirements. No free always-on hosting, unlimited messages or delivery-time SLA is
promised. Local and hosted WAHA URLs are separate private backend settings. Remote
WAHA connections require HTTPS. Keep WAHA behind private networking/authentication,
and configure a reachable HTTPS Dearly content origin before sending links to
other devices. Real notifications now reject localhost content links; see
[public notification links](release-operations.md#public-notification-links-and-app-downloads).

## Integration decisions (before implementation)

Generalize the Phase 12 durable external submission engine and access records for
email and WhatsApp, preserving existing database rows and issued email tokens.
Persist a submission marker before outbound POST; ambiguous POST/5xx/timeout or a
crash after this marker is UNKNOWN and never automatically replayed. Only failures
proven to occur before submission (readiness check, explicit authentication or
validation rejection, explicit throttling) can retry within the existing bounded
work budget. Provider IDs stay private. A local conservative sender budget is
separate for each provider. An offline/unpaired sender is visible, not a success.
No incoming message/content webhook or OTP forwarding is subscribed to.

Use HMAC-SHA512 authenticated `message.ack` callbacks over the exact raw body,
strict configured session/engine/fromMe validation, bounded request size and event deduplication.
Store only the minimal provider-message identity, destination and acknowledgement;
never webhook bodies, contacts or private messages. DEVICE confirms WhatsApp
notification delivery; READ/PLAYED confirms reading that notification, not opening
Dearly content. The explicit bearer-link opening remains a separate timestamp.
Receipts are monotonic and cannot downgrade accepted delivery when delayed events
arrive. Signed events that race provider-ID persistence are retained only during an active
submission window for the intended destination and reconciled
against the committed outbound record, never applied by phone alone. Unrelated
personal-account acknowledgement metadata is ignored. Unidentified LID receipts
are retried until the exact outbound ID is committed instead of being guessed. Message
status remains SUBMITTED for external submissions; per-recipient receipt fields
carry stronger evidence. Unmatched events expire through an explicit cleanup job.

## Sources reviewed

- [WAHA license](https://github.com/devlikeapro/waha/blob/core/LICENSE)
- [Core Docker quick start](https://waha.devlike.pro/docs/overview/quick-start/)
- [Text sending](https://waha.devlike.pro/docs/how-to/send-messages/)
- [Session readiness](https://waha.devlike.pro/docs/how-to/sessions/)
- [Signed callbacks and acknowledgements](https://waha.devlike.pro/docs/how-to/events/)
- [Security](https://waha.devlike.pro/docs/how-to/security/)

Provider software can lose its pairing or be restricted by WhatsApp. Pause and
surface those conditions; do not try to evade them or promise uninterrupted sending.
Real delivery acceptance needs a user-designated consenting recipient. Setup and pairing alone never authorize live sends. On 19 November the user
explicitly authorized self-tests through Phase 13 plus WhatsApp login OTP. This
authorization is limited to that acceptance check, not future arbitrary messages.


## Local setup (prepared)

A separate `dearly-whatsapp` Docker Compose project listens at
`http://localhost:3100`, bound to loopback only. Its dedicated session volume is
`dearly-whatsapp_sessions`. Dashboard/Swagger and QR logging are disabled; the
backend API key and a separate callback HMAC key are private values in backend/.env.
Compose passes only the required WAHA variables into that container, not the
Neon or Gmail credentials. The ARM Core image is pinned to the downloaded digest
in that private configuration. The existing ShopSmart container/volume is untouched.

From the repository root:

```sh
docker compose --env-file backend/.env -f scripts/whatsapp.compose.yaml up -d
npm run whatsapp:init --prefix backend
npm run whatsapp:status --prefix backend
npm run whatsapp:pair --prefix backend
```

`init` creates only a missing dedicated default session and subscribes exclusively
to signed `message.ack` events. It preserves an existing session configuration;
review its webhook settings manually if connecting an existing service. GOWS is configured not to persist messages, contacts or chats and requests minimal
history sync depth. Its device/authentication state still belongs in the private
session volume. Dearly does not import WhatsApp chat history. If an unpaired session
has stopped after its QR codes expired, run `npm run whatsapp:start --prefix backend`
and request a fresh QR. This is not logout/reset. Do not restart a working restricted
sender to try to bypass WhatsApp limits.

The recommended `whatsapp:pair` helper serves an automatically refreshing pairing
page at `http://localhost:3101` for at most 15 minutes. It binds only 127.0.0.1,
rejects cross-site/rebinding requests, sends no API key to the browser, and cannot
send messages, start, reset or log out sessions. Stop it with Ctrl+C after pairing.
The separate `whatsapp:qr` command exports a one-time image when needed.

The pairing image is private at `backend/.runtime/whatsapp-pairing-<timestamp>.png`; it expires.
Pair it using the sender phone's WhatsApp Linked devices flow. Delete the image
after pairing. `whatsapp:status` prints only sanitized readiness, never a phone,
QR token, API key or raw gateway body. Setup/status/QR commands never send messages.

The local callback target is `http://host.docker.internal:8080/webhooks/waha`.
Connectivity from the dedicated container to the existing loopback backend was
checked; the development-auth backend remains bound to 127.0.0.1. Keep backend,
worker, Docker and internet connectivity running for due delivery. The normal
mobile app remains on Metro 8081; Android is not started.

Use the hosted HTTPS content URL even when the sender gateway and API run locally.
The sender now rejects localhost/private-network content links before submission.
Do not expose the development OTP backend publicly to work around this limitation.

## Same integration on a server

No server was deployed and no hosted URL was invented. On a Docker host you already
have, copy the Compose file, create its own private environment/keys and select a
verified Core image digest for the host's architecture (`arm` for ARM, `latest` for
x86, pinned after pull). Use a fresh dedicated session volume and pair that sender;
never commit or publicly serve session files. Switching gateways/engines is an
explicit operation, not fallback. Old accepted/uncertain sends are not replayed.

For a production backend, configure:

```dotenv
NODE_ENV=production
WHATSAPP_MODE=waha
WAHA_ENGINE=GOWS
WAHA_SESSION=default
WAHA_SERVER_API_URL=https://YOUR_PRIVATE_WAHA_HOST
WAHA_CALLBACK_URL=https://YOUR_BACKEND_HOST/webhooks/waha
CONTENT_PUBLIC_URL=https://YOUR_BACKEND_HOST
```

Supply the matching API/HMAC keys privately. Production selects only the server
WAHA URL; it never falls back to this Mac's local service. Co-located backend and
WAHA may explicitly use `http://127.0.0.1:3100` as the **server** URL. Remote calls
require HTTPS; place WAHA behind your existing HTTPS reverse proxy/private network
and keep authentication enabled. No paid service or domain purchase is required
by the integration itself; actual hosting/public TLS addresses must already exist
or be arranged separately. The app's hosted API URL stays empty until hosting is
configured. Public app login still requires real OTP readiness in the release plan.

Restore/re-pair only the intended sender. Preserve old database submission records,
private attachments and the persistent external access key on deployment. Changing
the key revokes existing links. Changing provider URL/engine changes the receipt
scope, so callbacks from a different gateway cannot confirm prior submissions.

## Operations and proof

The schedule form offers WhatsApp only for PHONE destinations, with an explicit
sender assertion that recipients agreed to receive these messages. This assertion
is bound into the review proof and persisted as per-intent consentAt; it is not a
claim that Dearly verified the recipient's identity or permission independently.
Every recipient still has exactly one selected channel. Offline/unpaired readiness
is shown before review and checked again before each provider POST.

The existing per-provider budget defaults to 20 WhatsApp submissions per rolling
24 hours (maximum configurable 500), counting uncertain submissions too. This is a
Dearly safety/operations budget, not a promise of WhatsApp allowance. Restrictions,
provider throttling, expired links and rejection remain visible; no paid upgrade,
extra channel or blind resend is attempted. Daily `whatsapp:cleanup` deletes only
expired callback rows (14-day retention); never archive raw callback content.

Provider acceptance is SUBMITTED. Authenticated DEVICE/READ/PLAYED receipts can
show notification delivery/read dates, while private content openedAt remains an
explicit link-opening action. Failures appear per recipient and in Failed mailbox
counts/lists without rewriting the original submission evidence. Later stronger
receipts recover that notification outcome without another send. Message-level
SUBMITTED still means provider acceptance; it never implies private content was read.
Revoke a link from owned message details; the phone notification itself cannot be
recalled by revoking its content link, and downloaded content cannot be recalled.

Pairing and a real designated-recipient send/opening check remain separate from
contract tests. The initial implementation did not send live messages; see the
19 November acceptance follow-up below.

## Pairing verification — 17 November 2026

The latest stable free Core image (2026.10.1) was checked. WEBJS stalled during
startup and NOWEB pairing was rejected by WhatsApp. The user confirmed ordinary
WhatsApp Web linking worked, narrowing this to the gateway connection. Free Core
GOWS was explicitly selected, the user paired it, and both the CLI and live helper
reported READY. The existing official WhatsApp Web and ShopSmart sessions were
not reset or unlinked. GOWS is the configured local/default engine; NOWEB/WEBJS
remain explicit alternatives, not automatic fallbacks. No paid edition was used.

For a future “couldn’t link device” failure, preserve the session, check the exact
phone error and ordinary WhatsApp Web behavior, and verify the current Core release
before another attempt. Do not repeatedly ask for scans or blindly rotate engines.
A working restricted sender must not be restarted to evade provider restrictions.
Pairing readiness is not proof of real message delivery: no live send is authorized
by the setup/status commands or by a successful QR scan.

## Verification

Backend lint/typecheck/build and 66 standard tests passed, including raw-body HMAC,
pre-submit readiness, POST uncertainty, recovery preserving existing sessions, and
local pairing helper access boundaries. Frontend lint/typecheck and 76 tests passed.
The full PostgreSQL integration suite passed 75 entries (including parent suites),
and the expanded WhatsApp-specific suite passed 10 entries covering nine scenarios,
including failure-mailbox recovery without resending. Three mobile client integration
scenarios passed. Expo Doctor passed 20/20 and an iOS export was built. Tests use
fake gateways and isolated database schemas; no real email/WhatsApp messages were
submitted. Native mobile UI was not newly verified in this phase. Phone pairing is verified. Real designated-recipient delivery and hosted URL
validation remain acceptance work.

## WhatsApp login OTP — 19 November follow-up

Real login is selected with `AUTH_MODE=whatsapp`, using this same free Core sender
through a dedicated immediate OTP adapter. It never enters the scheduled queue,
never includes a private-content link, and never returns the code to the client.
See [authentication](authentication.md) for expiry, resend and separate persistent
sender limits. SMS remains disabled. Core GOWS returns `{ id, _data }` on send;
the adapter now handles this verified minimal response while still rejecting
incoming IDs, explicit `fromMe: false`, mismatched phone destinations and malformed
IDs. Other engines retain their existing stricter contract.

### Live self-test

The user authorized real self-tests on 19 November. An initial OTP returned HTTP
201 from Core GOWS but was classified UNKNOWN by the old response-field check.
That challenge was never verified/replayed. After the contract fix, an explicit
fresh challenge superseded it: gateway acceptance, wrong-code rejection, correct
verification, session authentication and code-replay rejection passed. The test
session was logged out. Codes, tokens and the sender number were not logged.

One clearly labeled synthetic message (`Dearly acceptance 1e16f360`) was scheduled
through normal preview/consent/confirmation for the user's paired account and own
Gmail. The worker accepted WhatsApp exactly once; an SMTP connection failure safely
retried before the single email acceptance. Gmail inbox arrival and its exact
private-content link were verified. The user confirmed both the OTP and scheduled notification arrived in WhatsApp.
Self-chat did not return DEVICE/READ evidence; phone arrival is user-confirmed,
not a fabricated callback receipt. Desktop WhatsApp window access was
unavailable. Phone access to localhost links remains unsupported; content checks
run on this Mac. Both test links opened the exact synthetic content, were revoked
by the owner service, and then returned 404. The synthetic message remains as
labeled evidence in Sent. The real OTP test used the auth HTTP handlers with a
cryptographically generated code retained only in test memory; native code entry
was not separately automated.

Standard checks passed: backend lint/typecheck/build and 69 tests; frontend
lint/typecheck and 77 tests. Isolated auth/WhatsApp integration passed 25 runner
entries, with a final focused WhatsApp rerun passing 11. No new migration,
dependency, Expo configuration, Android launch or device reset was needed.


## Designated-recipient test — 19 November 2026

The user explicitly requested one WhatsApp test to a different designated number.
The existing paired Core GOWS sender reported READY. A synthetic PHONE/WHATSAPP
message was previewed with explicit consent and confirmed through the normal
schedule service. The worker submitted it once, and WAHA accepted the outbound
message. No additional SMS/email channel or login OTP was sent. The user confirmed actual WhatsApp arrival at the designated recipient.
Notification delivery/read callbacks remain absent, so this is user-confirmed
arrival rather than an invented signed delivery/read receipt. The private
content URL remains localhost, so it opens on this Mac only. This test does not
change the completed Phase 13 self-test or start Phase 15.

## OTP cold-start repair — 20 November 2026

The hosted gateway was asleep during the reported failed phone request. Its
readiness probe timed out and the stored challenge was marked rejected. A later
read-only probe returned READY after the service started; no message was submitted
by that diagnostic. Render Free can spin down after inactivity; no always-on
service or scheduled keepalive was enabled.

`GET /auth/otp/status` now probes the sender with a bounded ten-second read-only
request and returns READY, WARMING or UNAVAILABLE. It has its own IP budget, so
readiness polling does not consume the stricter OTP-write budget. The production
app polls only that GET while connecting, for at most four minutes. Leaving the
connecting screen aborts polling. Code request/resend POSTs are made once after
readiness; uncertain writes are never automatically replayed.

The server also checks readiness before reserving a challenge, superseding an
existing code, applying cooldown or spending sender quota. This protects older
clients too, although only the rebuilt app has the clearer connecting state. A
known unavailable sender and an uncertain code submission remain different errors.
