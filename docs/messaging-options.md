# Messaging integrations and suggestions

Research date: 15 November 2026. These are reviewable suggestions, not selected
providers or installed dependencies. Recommendations are limited to usable free
plans and open-source tools that are free to use; paid upgrades and temporary trials
are excluded. The user has excluded Meta/WhatsApp Cloud API because of setup time.
Recheck documentation, licensing, limits, and account eligibility when implementing. No credentials were read, services
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
| WhatsApp | WAHA Core free edition | No paid alternative | Selected in Phase 13; real scheduled self-delivery confirmed 19 November |
| SMS | SMSGate with a dedicated Android phone/SIM | InfiniReach free plan only, within its quota | SMSGate selected 19 November; physical Android/SIM setup and live acceptance pending |
| Email | Nodemailer + Brevo SMTP free plan | Gmail SMTP for a small demo; Resend API/SMTP free plan | Proposed; verify sender/domain setup and usable quota |
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

Use only WAHA's free edition. Check its engine/edition support before promising
direct photo/video/voice/file sending; features requiring payment are out of scope.
Begin with text plus a secure Dearly content link, subject to the
recipient-access design. Sources: [WAHA introduction](https://waha.devlike.pro/docs/overview/introduction/)
and [message capabilities](https://waha.devlike.pro/docs/how-to/send-messages/).

WAHA's own documentation discusses account blocking, which matters for an app
that schedules messages far in advance. Plan for session readiness, disconnection,
re-pairing, and outages; do not promise reliable delivery merely because the API
is running. See [WAHA's blocking guidance](https://waha.devlike.pro/docs/overview/how-to-avoid-blocking/).

**Review before Phase 13:** free-edition capability; who operates the sender number;
text/link versus supported direct media; recipient consent; outage and re-pairing
procedure. Do not switch providers or automatically send a second channel without an explicit configuration/policy.

## SMS: SMSGate first, InfiniReach free plan as an alternative

SMSGate is free/open-source Android gateway software with local, public-cloud,
and private-server integration options. It sends using an Android device, not a
free global carrier network. Keep the phone powered, connected, and able to send
SMS; verify the SIM plan and applicable carrier restrictions. Secure network
access rather than exposing a phone's local API publicly. Sources:
[SMSGate](https://sms-gate.app/) and [integration documentation](https://docs.sms-gate.app/).

InfiniReach is already supported in ShopSmart. Its current billing guide lists
one connected line and 100 messages/month on its free plan. Consider only that
free plan; do not recommend an upgrade when its quota is exhausted. Underlying
connected-line costs remain separate. It is a hosted
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

**Free-only rule:** Use only the free plans above. Free quotas are not unlimited;
pause/report excess work rather than enable billing. If a service needs a domain
you do not already own or other paid prerequisites, use an eligible free alternative
or record the blocker; do not present a domain purchase as free.

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
| OTP channel/provider | Explicit local simulation or immediate real dispatch | WhatsApp via free WAHA Core selected; live OTP self-test passed 19 November |
| WhatsApp | WAHA Core free edition | Selected: dedicated GOWS sender, private links, signed receipts; live self-delivery confirmed 19 November |
| SMS | SMSGate; InfiniReach free plan only as an alternative | User selected SMSGate with physical Android/SIM on 19 November; setup pending |
| Email | Nodemailer SMTP | Gmail SMTP selected by the user on 17 November 2026; dedicated sending identity and app password stored only in private backend configuration |
| External content access | Revocable bearer links | Selected for Phase 12: fragment proof, explicit opening, seven-day expiry and owner revocation; forwarding grants access |
| Missing credentials | Explicit unavailable status | SMTP mode requires credentials; email scheduling also requires public URL and a separate access key; no silent capture fallback |
| Quota/timeout handling | Durable budget and safe retries | Rolling sender budget; explicit temporary rejection retries; ambiguous submission stops without automatic resend |

Do not copy ShopSmart environment files, credentials, phone numbers, WhatsApp
session data, branding, or order-specific templates into Dearly.

### Gmail setup checkpoint — 17 November 2026

Gmail is selected; Brevo/Resend remain alternatives, not active integrations.
The configured account passed a TLS/authentication-only SMTP verification using
`npm run email:verify` in `backend/`. This command never submits a message and
prints only a sanitized result. It does not prove inbox delivery or complete
Phase 12. No live email has been sent.

Private settings use `EMAIL_MODE=smtp`, `SMTP_HOST=smtp.gmail.com`, port `465`,
and matching `SMTP_USER`/`SMTP_FROM`. The app password is in ignored
`backend/.env` with owner-only permissions; no credentials belong in examples.
Port `587` is supported with mandatory STARTTLS. Both configurations require
certificate validation. SMTP debug logging and URL/filesystem content fetching
are disabled. Missing settings fail validation rather than falling back to capture.
The transport remains separate from the delivery worker; email capabilities stay
unavailable until secure access and durable submission handling are implemented.

Gmail's documented limits are not a guaranteed application quota. Use a conservative
durable sending budget during worker integration and report throttling honestly.
SMTP acceptance must never be labeled delivery confirmation. Authentication checking
does not authorize a live test: designate a consenting recipient before live sends.
See [SMTP transport documentation](https://nodemailer.com/smtp) and
[Google app-password requirements](https://support.google.com/accounts/answer/185833).

Phase 12 now implements this integration; see [email contracts](email-delivery.md).
The earlier setup checkpoint above records the state at that time. Real inbox
acceptance passed in the authorized 19 November self-test; email scheduling is
available when all private SMTP/access settings exist. Earlier no-send statements
above describe the initial setup checkpoint.

Phase 13 implements the WAHA candidate; see [WhatsApp operations](whatsapp-delivery.md).
The free Core GOWS sender is paired and readiness was verified. This is separate
from a real recipient delivery acceptance check. ShopSmart remains read-only.


Phase 14 selects SMSGate with the user's physical Android/SIM. The free software
and current free cloud option were rechecked on 19 November against the provider's
[pricing](https://docs.sms-gate.app/pricing/), [license](https://docs.sms-gate.app/license/)
and [API](https://docs.sms-gate.app/integration/api/) documentation. InfiniReach's
[free plan](https://infinireach.io/docs/billing) still lists one line/100 messages
per month, with carrier costs separate; it is not selected. See
[SMS operations and the outstanding live-device check](sms-delivery.md).
