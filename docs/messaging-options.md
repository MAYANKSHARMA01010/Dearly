# Messaging integrations and suggestions

Research date: 15 November 2026. These are reviewable suggestions, not selected
providers or installed dependencies. Recheck documentation, licensing, limits,
and account eligibility when implementing. No credentials were read, services
started, tests dispatched, or messages sent during this review.

## What ShopSmart actually uses

Inspected local repository: `/Users/mayanksharma/Downloads/New_Projects/shopsmart`.
The following paths are relative to that repository, not Dearly:

| Evidence | Observed implementation |
| --- | --- |
| `apps/server/src/modules/sms/whatsapp.service.ts` | WAHA HTTP `POST /api/sendText`, session name, optional `X-Api-Key`, local/hosted URLs, abort timeout; text and OTP methods |
| `apps/server/src/modules/sms/sms.service.ts` | InfiniReach API-key branch or SMSGate Basic Auth branch; text and OTP methods; returns a boolean |
| `apps/server/src/modules/sms/phoneOtp.dispatcher.ts` | Explicit WhatsApp/SMS selection, defaults to WhatsApp; sends through one channel per request |
| `apps/server/src/modules/email/email.service.ts` | Nodemailer with configured SMTP; otherwise `jsonTransport: true`; reusable text/HTML delivery method |
| `apps/server/src/shared/config/env.ts` | Provider configuration names and timeouts |
| `docs/DEPLOYMENT.md` | Gmail SMTP example with an app password; this is documentation, not proof of the active deployment |
| `apps/server/tests/messaging.test.ts` | Live-dispatch tests targeting a configured phone; inspected only, not run |

These are gateways/libraries, not AI models. Source review establishes supported
code paths, not which provider is currently configured or whether it is online.
The SMS service comments mention a local relay, but the implementation still
requires one of its two credential branches; do not assume arbitrary unauthenticated
local relay support. ShopSmart's versions also differ from Dearly's Express/Prisma
versions, so adapt patterns rather than copying its package manifest.

## Suggested choices to review

| Channel | Suggested starting point | Alternative | Decision status |
| --- | --- | --- | --- |
| WhatsApp | Existing WAHA integration for a controlled prototype | Official Meta Cloud API for a supported production route | Proposed; review session operations, account risk, and platform suitability |
| SMS | SMSGate with a dedicated Android phone/SIM | Existing InfiniReach branch if its convenience/quotas suit you | Proposed; verify hardware, SIM costs, reachability, and sending limits |
| Email | Nodemailer + Brevo SMTP for an app-focused free-tier trial | Gmail SMTP for a small demo; Resend API/SMTP for another option | Proposed; verify sender/domain setup and usable quota |
| Local email testing | Explicit local JSON/capture transport | A local test inbox | Development only; never count it as delivery |

There is no demonstrated need to replace WAHA or SMSGate merely to use a different
open-source project. The useful improvement is a clearer adapter contract and
reliable scheduling/status handling. Brevo/Resend are hosted services with free
tiers, not free self-hosted mail infrastructure. Free gateway software still needs
hosting, connectivity, and, for SMS, an Android device and a carrier plan.

## WhatsApp: keep WAHA as the prototype candidate

ShopSmart's HTTP adapter is a useful starting point: retain timeout handling and
separate local/hosted configuration. Dearly should expose it behind a WhatsApp
provider interface so a different provider can be selected later.

WAHA documents free availability and separately documents Plus features. Check
required engine/edition support before promising direct photo/video/voice/file
sending. Begin with text plus a secure Dearly content link, subject to the
recipient-access design. Sources: [WAHA introduction](https://waha.devlike.pro/docs/overview/introduction/)
and [message capabilities](https://waha.devlike.pro/docs/how-to/send-messages/).

WAHA's own documentation discusses account blocking, which matters for an app
that schedules messages far in advance. Plan for session readiness, disconnection,
re-pairing, and outages; do not promise reliable delivery merely because the API
is running. See [WAHA's blocking guidance](https://waha.devlike.pro/docs/overview/how-to-avoid-blocking/).

The official alternative is Meta's WhatsApp Business Platform. Its rules restrict
non-template sends to an open 24-hour customer-service window; outside that window
businesses use templates, and recipients must opt in. Categories and pricing also
matter. Arbitrary scheduled personal messages therefore need a product-fit check;
an approved notification template linking to Dearly may be more suitable than
sending arbitrary message bodies. This is a design suggestion, not a guarantee
of approval or free sending. Source: [Meta pricing and messaging rules](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

**Review before Phase 13:** WAHA versus Cloud API; who operates the sender number;
prototype versus public-release requirements; text/link versus direct media;
consent and template needs; outage and re-pairing procedure. Do not switch providers
or automatically send a second channel without an explicit configuration/policy.

## SMS: SMSGate first, InfiniReach as a convenient alternative

SMSGate is free/open-source Android gateway software with local, public-cloud,
and private-server integration options. It sends using an Android device, not a
free global carrier network. Keep the phone powered, connected, and able to send
SMS; verify the SIM plan and applicable carrier restrictions. Secure network
access rather than exposing a phone's local API publicly. Sources:
[SMSGate](https://sms-gate.app/) and [integration documentation](https://docs.sms-gate.app/).

InfiniReach is already supported in ShopSmart. Its current billing guide lists
one connected line and 100 messages/month on its free plan; paid plans and the
underlying connected-line costs are separate considerations. It is a hosted
service option, not evidence of an open-source implementation. Verify API shapes
against current documentation before reusing the old adapter. Sources:
[InfiniReach billing](https://infinireach.io/docs/billing),
[getting started](https://infinireach.io/docs/getting-started), and
[API documentation](https://infinireach.io/docs/api).

**Suggestion:** SMSGate is the stronger candidate for avoiding an additional SaaS
message quota if you already have a suitable Android device/SIM. InfiniReach may
be simpler to operate for a small demonstration. Neither removes carrier costs
or device availability requirements. Short SMS containing a secure link avoids
trying to fit photos/video into a text channel; count multipart/Unicode segments
when estimating usage.

**Review before Phases 4 and 14:** OTP channel versus message-delivery channel,
device availability, carrier allowance, provider credentials, status callbacks,
message length, and service behavior when the phone is offline. OTPs need immediate,
short-lived dispatch, not the future-message queue.

## Email: retain Nodemailer; choose the SMTP service separately

Nodemailer is the library, SMTP is the transport, and Gmail/Brevo/Resend are
possible service providers. Keep these separate so changing a service does not
change the message business logic.

| Option | Verified free-tier information | Why consider it / what to review |
| --- | --- | --- |
| Brevo | 300 email sends/day; unused sends do not roll over | Suggested app trial with Nodemailer SMTP; confirm transactional access, sender verification, branding, and account activation |
| Resend | 3,000 transactional emails/month and 100/day | API/SMTP option; review domain/sender verification and test restrictions |
| Gmail personal account | Google documents limits around 500 emails/day or 500 recipients in one email | Convenient small demo; limits are not a guaranteed app quota; review auth setup and suspension/reputation behavior |

Sources: [Brevo plan details](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans),
[Resend pricing](https://resend.com/pricing), and
[Gmail sending limits](https://support.google.com/mail/answer/22839?hl=en).

These quotas are channel limits, not delivery-time guarantees. A birthday message
must not be silently marked successful if the provider quota delays it until
another day. Surface the delay, preserve retries, and provide an honest status.

ShopSmart's missing-SMTP fallback uses Nodemailer's JSON transport. That generates
a message representation; it does not send to an inbox. Its code still records
`email.sent`, so Dearly should improve this with an explicit development mode and
separate simulation status. Production should fail configuration validation when
an enabled channel lacks credentials. See [Nodemailer JSON transport](https://nodemailer.com/transports/stream#3-generate-a-json-encoded-message-object--v310).

**Review before Phase 12:** provider, sending identity/domain, safe HTML templates,
text alternative, links/attachment strategy, quota management, bounce handling,
and permitted recipient types. Prefer secure links over attaching large files.

## Reuse the patterns, improve the delivery contract

1. Use explicit `WHATSAPP_PROVIDER`, `SMS_PROVIDER`, and `EMAIL_PROVIDER` settings
   instead of inferring a provider from whichever credentials happen to exist.
   Validate only the enabled provider's configuration. Keep secrets server-side.
2. Reuse ShopSmart's one-channel OTP dispatcher idea, HTTP timeouts, and reusable
   text/OTP methods. Replace its India-only ten-digit heuristic with validated
   E.164 numbers plus an explicit country selection.
3. Return a structured outcome: adapter mode, provider message ID, accepted/rejected/
   unknown result, retry classification, and safe error code. An HTTP 2xx or boolean
   is not proof that the recipient received a message.
4. Treat network timeout after submission as uncertain: the provider may already
   have sent. Use provider idempotency keys or reconciliation if supported; otherwise
   document duplicate risk and avoid blind retry claims of exactly-once delivery.
5. Separate OTP dispatch from future-message delivery. Redact phone/email data in
   routine logs; do not log OTPs, content, full provider error bodies, or secrets.
6. Authenticate callbacks using each provider's documented mechanism; use signature
   validation where available and deduplicate events. Do not invent receipt support
   where a provider offers none.
7. Protect WhatsApp session storage and Android gateway access. Add readiness checks
   and operational recovery without tying sessions to a disposable web instance.
8. Keep default automated tests isolated with mocks/capture adapters. Real provider
   checks are explicit opt-in tests using a designated consenting test recipient;
   do not run ShopSmart's live messaging tests as part of this planning task.

## Editable decision record

Fill this in when you review the options; leave unselected choices open.

| Decision | Current proposal | Selected value / reason |
| --- | --- | --- |
| OTP channel/provider | Development adapter first; SMSGate or WAHA trial for real verification | Pending |
| WhatsApp | WAHA prototype; assess Cloud API for production | Pending |
| SMS | SMSGate; compare InfiniReach convenience | Pending |
| Email | Nodemailer + Brevo SMTP; Gmail/Resend alternatives | Pending |
| External content access | Notification with secure link; define recipient proof and expiry | Pending |
| Missing credentials | Explicit unavailable/simulated status; production validation | Pending |
| Quota/timeout handling | Visible deferred/uncertain outcomes, bounded retries | Pending |

Do not copy ShopSmart environment files, credentials, phone numbers, WhatsApp
session data, branding, or order-specific templates into Dearly.
