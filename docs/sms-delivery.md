# SMS delivery — Phase 14

## Provider and cost boundary

The user selected SMSGate with their physical Android/SIM on 19 November 2026.
The user subsequently selected **Cloud Server mode** to avoid USB. Use the
free/open-source standard Android app with an active internet connection. SMSGate's [pricing](https://docs.sms-gate.app/pricing/) states local and current
cloud service are free; its [license](https://docs.sms-gate.app/license/) is
Apache-2.0. The SIM, carrier allowance, powered phone and connectivity remain
separate requirements. No billing, paid subscription or claim of unlimited free
carrier SMS is introduced. InfiniReach remains an unselected free-plan alternative.
ShopSmart was inspected as a read-only HTTP reference; no credentials were copied.

SMS carries only a short generic notification and the existing seven-day private
link. It does not carry message text/media. Each recipient explicitly selects one
channel and asserts SMS consent during review and confirmation. Consent is bound
to the review proof and persisted; no implicit WhatsApp, email or SMS fallback.
WhatsApp login OTP remains separate and unchanged.

Cloud authentication and the selected device were verified during private setup.
The initial readiness cutoff was too short for the provider's documented 15-minute
fallback polling cycle. Readiness now accepts activity within 20 minutes, with a
one-minute future-clock tolerance. Older/missing activity remains offline. This is
a recent-activity check, not proof that the phone is connected at the exact send
instant; the five-minute outbound queue TTL still applies. No live SMS was sent.
The placeholder signing key was replaced privately with a random key; the same
key must be copied to the phone before receipt callbacks can authenticate. A
reachable HTTPS callback endpoint remains unconfigured, so SMS stays disabled.

## Preferred setup: SMSGate Cloud

The user selected Cloud mode on 19 November. USB and USB debugging are not required.
The existing cloud adapter is already implemented; changing mode does not require
another provider or dependency.

1. On the Android phone, open the official
   [latest stable release](https://github.com/capcom6/android-sms-gateway/releases/latest)
   and install the standard secure APK, not the insecure variant or a pre-release.
2. Allow SMS sending and phone-state access for selecting the intended SIM.
3. Turn on **Cloud Server** and tap **Start Service**. On first registration,
   confirm **Sign Up**; the app generates Cloud Server credentials. See the official
   [Cloud setup](https://docs.sms-gate.app/getting-started/public-cloud-server/).
4. Keep the phone online and its service running. Store the Cloud Server username,
   password, exact device ID and device webhook signing key only in private
   `backend/.env`. The device ID can be read from the authenticated cloud device
   list after credentials are configured; Dearly must pin the intended device.
5. Prepare a reachable HTTPS callback endpoint before registering outbound receipt
   callbacks. The local Mac's `localhost:8080` is not internet-reachable. No public
   tunnel is started and no hosted backend URL is invented by this mode change.

Prepared private/public-example settings:

```dotenv
SMS_PROVIDER=disabled
SMSGATE_CONNECTION=cloud
SMSGATE_LOCAL_API_URL=https://api.sms-gate.app/3rdparty/v1
SMSGATE_SERVER_API_URL=
# SMSGATE_USERNAME=<private Cloud Server username>
# SMSGATE_PASSWORD=<private Cloud Server password>
# SMSGATE_DEVICE_ID=<exact intended cloud device ID>
# SMSGATE_WEBHOOK_SECRET=<private device webhook signing key>
SMSGATE_SIM_NUMBER=1
SMS_DAILY_LIMIT=20
# SMSGATE_CALLBACK_URL=https://YOUR_REACHABLE_BACKEND/webhooks/smsgate
```

`LOCAL_API_URL` means the gateway used by Dearly's local backend, even when that
provider is cloud-hosted. It is separate from the future hosted Dearly backend URL,
which remains empty. Set `SMS_PROVIDER=smsgate` only after the private credentials,
exact device and callback setup are ready. No real SMS has been sent.

## Optional alternative: direct USB setup

1. Install the standard SMSGate app from the official
   [installation guide](https://docs.sms-gate.app/installation/). Do not use the
   insecure build or disable device security protections.
2. Allow sending SMS and the phone-state access needed to select the intended SIM. No incoming-message export is
   used or subscribed to by Dearly.
3. Turn on Local Server and start its service on the phone's port 8080.
4. Connect this one physical phone by USB and authorize USB debugging on the phone.
   Run `sh scripts/connect-smsgate-usb.sh` from the repository root. It does not
   launch an emulator, reset a device, send SMS or overwrite another port forward.
   It verifies that host port 3102 listens only on loopback.
5. Put the Local Server credentials and the device's **Settings → Webhooks →
   Signing Key** only in ignored `backend/.env`. Never paste them into chat or
   frontend/public settings. Use a key dedicated to this phone.

```dotenv
SMS_PROVIDER=smsgate
SMSGATE_CONNECTION=local
SMSGATE_LOCAL_API_URL=http://127.0.0.1:3102
SMSGATE_SERVER_API_URL=
SMSGATE_USERNAME=<private Local Server username>
SMSGATE_PASSWORD=<private Local Server password>
SMSGATE_WEBHOOK_SECRET=<private device webhook signing key>
SMSGATE_SIM_NUMBER=1
SMS_DAILY_LIMIT=20
SMSGATE_CALLBACK_URL=http://127.0.0.1:3103/webhooks/smsgate
```

An exact `SMSGATE_DEVICE_ID` is optional for the direct local phone; set it if known
to pin the response and callbacks further. Local scope includes the API origin,
connection type, SIM and a fingerprint of the unique signing key. Cloud mode
requires the exact device ID. Local credentials plus the dedicated signing key
must never be reused for another phone. Changing phones/keys creates a different
scope; old sends are not replayed or confirmed by another sender.

Restart the backend and worker after private configuration changes. Then run:

```sh
npm run sms:status --prefix backend
npm run sms:init --prefix backend
```

Status checks never send. Initialization preserves other registrations and adds
only `sms:sent`, `sms:delivered`, `sms:failed` and `sms:cancelled` callbacks, never
incoming messages, contacts or inbox history. In the optional USB setup, the reverse link makes the Mac
backend reachable at the phone's loopback address without publishing port 8080.
The phone must stay connected and the service running. Health means gateway
reachability, not verified SIM allowance or guaranteed carrier delivery.

## Server configuration

Hosted URLs remain empty until the user provides hosting. Production selects only
`SMSGATE_SERVER_API_URL`; it never falls back to the local phone URL. Use either
an explicitly reachable private local-mode gateway with HTTPS, or cloud mode with
`SMSGATE_CONNECTION=cloud`, a base ending `/3rdparty/v1`, the exact device ID and
private Basic credentials or a scoped `SMSGATE_TOKEN` (mutually exclusive). Local
mode supports Basic only. Never publish the phone's unencrypted API to the internet
or disable TLS validation. Refer to the provider's
[authentication](https://docs.sms-gate.app/integration/authentication/) and
[API](https://docs.sms-gate.app/integration/api/) contracts.

Register callbacks at the hosted HTTPS `/webhooks/smsgate` endpoint and set the
existing `CONTENT_PUBLIC_URL` to the hosted HTTPS backend. Current localhost links
open on this Mac only. No public tunnel or hosted address is created by this phase.

## Length, scheduling and delivery evidence

The notification is limited to **one SMS segment**. The length utility accounts
for GSM-7 extension characters, Unicode UTF-16 units and multipart boundaries.
The actual provider payload is checked before POST; an oversized link is rejected
with `SMS_TOO_LONG`. Capabilities disable SMS when the configured content origin
would produce an oversized notification. No paid URL shortener is introduced.
Carrier charges/limits still apply to a single segment.

The existing durable worker reserves a submission record and separate sender
budget before HTTP. It sends one normalized E.164 destination, client-selected
reservation UUID, explicit SIM, delivery-report request and a five-minute device
queue TTL. Dearly owns scheduling; no second future schedule is set on SMSGate.
Offline/auth/explicit throttling before acceptance may retry within existing work
limits. POST timeouts, malformed/mismatched responses, 409 and ambiguous 5xx are
UNKNOWN and never blindly replayed, even after worker restart. Queue acceptance
is SUBMITTED, not carrier delivery. Failed/uncertain attempts consume budget.

Signed callbacks verify HMAC-SHA256 over raw body followed by `X-Timestamp`, use
constant-time comparison, reject timestamps outside five minutes, and deduplicate
scope/event IDs. Only the exact known outbound UUID, configured SIM, destination
and sender scope are retained; unrelated personal SMS metadata and raw bodies/
failure reasons are discarded. Receipts that race provider acceptance wait for
the response commit. Minimal receipt rows expire after 14 days via `sms:cleanup`.

SENT confirms carrier submission. DELIVERED requires both a signed SENT with
`partsCount=1` and a signed delivery event, in either order. The provider documents
that multipart delivery callbacks may confirm just one part, so unexpected or
unknown part counts never become whole-message delivery. SMS has no read receipt;
opening the private Dearly link is separate. Duplicate/late weaker events do not
invent additional history or downgrade stronger evidence. Signed failures appear
in Failed; a later valid delivery receipt can recover without resending.

Sources: [sending](https://docs.sms-gate.app/features/sending-messages/),
[status tracking](https://docs.sms-gate.app/features/status-tracking/),
[webhook signatures and multipart behavior](https://docs.sms-gate.app/features/webhooks/),
[health checks](https://docs.sms-gate.app/features/health/).

## Acceptance checkpoint

Implementation and automated verification are ready. Backend lint/typecheck/build
and 76 tests passed; frontend lint/typecheck and 79 tests passed. All 84 backend
integration entries, seven focused SMS integration entries and three mobile/API
integration scenarios passed. The focused suite also verifies signed receipts
racing an uncertain HTTP response without replaying it. Existing legacy unsupported
SMS rows keep their unavailable display. The additive migration was applied and its
checksum verified; no applied migration was rewritten. Test schemas were isolated
and removed by their runners. No package upgrade, emulator launch or reset occurred.

SMS remains disabled until the physical sender/private configuration is ready.
No real SMS has been sent, and native SMS interaction was not verified. The backend,
updated worker, Metro and existing iPhone simulator remain the development setup.
Completion requires a scheduled SMS to a designated consenting recipient, actual
phone arrival and honest carrier evidence. Do not mark this phase complete from
an emulator, fake transport, health probe or gateway acceptance alone.
