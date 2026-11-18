# SMS delivery — Phase 14

## Provider and cost boundary

The user selected SMSGate with their physical Android/SIM on 19 November 2026.
Use the free/open-source standard Android app and local USB connection for this
Mac. SMSGate's [pricing](https://docs.sms-gate.app/pricing/) states local and current
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

## Prepare the Android phone

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
incoming messages, contacts or inbox history. The USB reverse link makes the Mac
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
