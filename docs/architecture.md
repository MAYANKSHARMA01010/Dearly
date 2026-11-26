# Architecture and security

Dearly is an Android digital time capsule app for preserving memories, feelings
and wishes and sharing them at a meaningful future time. Capsules support text,
photos, videos, voice and files; recipients may be self, a Dearly user ID, a phone
number or an email address. This guide describes current behavior, not phase
history or proof that a particular deployment was tested.

“Capsule” describes the product experience. Existing code, database models, APIs
and screen labels use message, draft, recipient, schedule and mailbox terminology
for the underlying content and delivery lifecycle. Those identifiers remain the
technical reference throughout this guide. WhatsApp, SMS, email and push support
verification or capsule notifications; private content access follows the due-time
and ownership rules below. Capsule scheduling does not imply indefinite archival
guarantees or end-to-end encryption.

## Code and data ownership

| Location | Responsibility |
| --- | --- |
| `frontend/src/app/` | Expo Router routes and protected layouts |
| `frontend/src/screens/`, `components/`, `theme/` | Feature UI, reusable controls, Paper themes/tokens |
| `frontend/src/api/`, `config/` | Safe HTTP transport and explicit backend selection |
| `frontend/src/services/`, `context/`, `hooks/` | Sessions, feature contracts, device integrations and screen state |
| `backend/src/routes/`, `controllers/`, `validators/` | HTTP boundary and strict request validation |
| `backend/src/services/` | Ownership and business rules |
| `backend/src/providers/` | WAHA, SMSGate, Gmail, push and private storage adapters |
| `backend/src/jobs/`, `workers/` | Bounded maintenance, durable dispatch and push processing |
| `backend/src/configs/`, `middlewares/`, `utils/` | Configuration, authorization and shared helpers |
| `backend/src/docs/openapi.ts` | Executable API reference |
| `backend/prisma/` | PostgreSQL schema and additive migrations |
| `backend/functions/` | Protected Gmail relay |
| `scripts/`, `.github/workflows/` | Environment selection, operations, verification and release tooling |

Expo SDK 58, NativeWind v4 and React Native Paper share the existing Babel/Metro
configuration. `frontend/index.js` loads CSS and Router; `src/app/_layout.js` owns
providers/navigation. There is no competing App.js/navigation root. Backend flow
is routes → controllers → services, with vendor I/O in providers.

Neon PostgreSQL is authoritative for accounts, access, schedules, delivery state
and quotas. Neon private objects hold hosted media. Redis is optional and is not
the durable queue. Local SQLite/media are disposable copies, never auth authority.

## Identity and recipient access

Login verifies a phone number through WhatsApp OTP. Six-digit codes expire after
five minutes, have a 60-second resend cooldown and bounded attempts. Durable phone
budgets permit five requests/hour and ten failed comparisons/15 minutes; each
challenge allows five incorrect codes. A separate sender budget limits OTPs.
Codes are HMAC-hashed with a private pepper; no plaintext code enters logs/storage.
Read-only sender preparation may retry status GETs; OTP POSTs never retry silently.
Rejected, pending, uncertain, expired or superseded dispatch cannot authenticate.

New WhatsApp OTPs retain an outgoing message ID and sender scope for expiry
cleanup. The delivery worker requests deletion for everyone after five minutes,
including consumed/superseded codes, without reading chat history or touching
scheduled messages. A persisted lease and bounded retries survive worker restarts.
Deletion is best effort: sleeping hosts, offline recipients or gateway failures
can delay/prevent it; screenshots and prior notification previews cannot be erased.
OTP expiry is enforced by the server independently of WhatsApp deletion.

Access tokens are opaque random secrets, hashed in PostgreSQL, with 15-minute
expiry and a live session check. Sessions expire absolutely after 30 days. Refresh
rotates both tokens; replay revokes the session. Native SecureStore keeps the pair
atomically. Refresh is serialized, and uncertainty requires sign-in again rather
than replaying an old token. Startup/foreground restoration checks `/auth/me`
online before protected content appears. Foreground checks retain the existing
navigation/editor behind a blocking privacy curtain; Android picker and permission
returns must not reset the route or discard a pending selection. Success resumes
the same screen; offline failure stays locked with explicit retry/sign-out. A
revoked or different account removes protected navigation. Saved-media playback
needs reopening after an auth suspension; writes are never replayed.
Logout clears local credentials and
caches, disables session devices and attempts server revocation.

Email is **not login**. In Profile, save an address and verify its Gmail code to
link it to the phone account. Changed addresses lose verification; a verified
address belongs to at most one account. Codes are account/address scoped, expire
after five minutes and have five attempts, a 60-second cooldown, five requests/hour
and a separate daily sender budget. Unverified profile fields grant no access.

Adding a recipient grants no draft or early attachment access. At delivery,
account targets must still exist and be verified. In-app PHONE binding is resolved
during review/confirmation and rechecked at dispatch; recycled numbers cannot
redirect an old binding. Dashboard/Received refresh may claim at most 100 active
due external deliveries for the verified phone/email. Future, rejected,
expired/revoked unclaimed or already foreign-bound destinations are excluded.
Claims are idempotent and bind once. Later email changes/link expiry do not erase
an already committed recipient inbox copy.

Manual recipients support self, user UUID, normalized E.164 phone and case-folded
email. No contacts permission, address-book search/import or WhatsApp history import
is implemented. Owner-supplied recipient labels are not verified identities.

## Message lifecycle and scheduling

Draft save is private and does not send. Text/recipient updates use an expected
version; conflicting editors get 409 and must reload explicitly. Recipients and
attachments can be corrected while in drafts. Scheduled content edits retain
version checks; change recipients/files by canceling and returning to drafts,
then review again. Unknown fields and caller-supplied ownership/state are rejected.

Scheduling uses a calendar/12-hour clock in the app and an IANA timezone. The
server resolves local time to UTC, requiring at least 60 seconds ahead and at most
3,660 days. Invalid dates, DST gaps and repeated times are rejected. A ten-minute
HMAC review binds owner, version/content, recipients, files/digests, channels,
consent and resolved instant. Confirmation revalidates all of them and the time.
Profile timezone changes do not move an existing schedule.

Each recipient has one explicit supported channel. SELF/USER use IN_APP; PHONE
can use available IN_APP, WHATSAPP or SMS; EMAIL uses EMAIL. WhatsApp/SMS require
review-bound consent. Capabilities and sender readiness are checked; there is no
automatic fallback or all-channel sending. A private expiring link is not proof
that the recipient's identity was independently verified.

PostgreSQL scans enqueue due work uniquely by message/schedule version. The
claim transaction changes SCHEDULED to DISPATCHING and increments its version;
that commit ends edit/cancel permission, including while retrying. Cancel wins
only if it commits first. CANCELED may return to DRAFT before dispatch. Old paused
plans require an explicit new review; text edits do not enable them.

Claims use fencing tokens and 60-second leases. Stale claimants cannot commit.
Ready files/digests and recipient binding are checked before atomic inbox/outcome
writes. A unique intent/inbox constraint prevents duplicate in-app delivery.
Transient failures have five attempts with 5s/30s/2m/10m delays; operator recovery
may extend only eligible failed work, up to 20 total attempts. Successful intents
are skipped. Expired/stale/canceled work cannot override the current plan.

## Delivery evidence and private links

| Evidence | What it means |
| --- | --- |
| In-app delivery | Recipient-owned inbox row committed for a due message |
| SMTP / WAHA acceptance | Provider accepted a notification; not phone/inbox arrival |
| SMSGate acceptance | Phone-cloud queue accepted work; not carrier delivery |
| WhatsApp DEVICE / READ / PLAYED | Notification delivered/read; separate from Dearly content opening |
| SMS SENT / DELIVERED | Carrier submission / signed single-part delivery evidence |
| Expo ticket / receipt | Push-service / downstream-provider acceptance; not observed phone arrival |
| Explicit content opened | Recipient chose the supported open/mark-opened action; not proof of understanding |

External workers persist a submission marker **before** network I/O. A timeout,
crash or ambiguous response is UNKNOWN and is never blindly resent. Only known
safe pre-submission failures retry. Provider budgets are durable and count uncertain
attempts. SMTP has no authenticated delivery webhook here. WAHA acknowledgements
use raw-body HMAC-SHA512 and strict sender/outbound scope; SMSGate uses HMAC-SHA256
with timestamp/replay checks. Minimal 14-day receipts exclude unrelated personal
messages. SMS DELIVERED requires signed SENT with partsCount=1 plus delivery;
weaker/late events cannot invent evidence or downgrade stronger receipts.

Real notifications always use remote HTTPS content links, including local-worker
sends. Email/WhatsApp include the GitHub Releases download page; SMS keeps one
carrier segment and its companion page provides installation instructions. Users
register their phone and verify email in Profile to see matching email deliveries.

Bearer links expire seven days after dispatch and can be revoked per intent.
They authorize one due message and ready files; forwarding grants the same access.
Tokens enter the URL fragment, are removed on load and are submitted only after
explicit Open. Each content/file request rechecks access. Strict CSP, no-referrer,
no-store and self-hosted assets avoid third-party leakage. Revocation cannot recall
already loaded/exported content. GETs, previews, refresh and media playback do not
create opened receipts. Notification read state and content-opened state differ.

## Private files and permissions

Actual signatures, exact length, SHA-256 and ffprobe/PDF parsing validate uploads;
filename/MIME alone is insufficient. READY objects are immutable. Owners can read
saved/scheduled files; recipients need their own committed due inbox record.
Private byte/range routes never expose permanent storage URLs.

| File | Limits |
| --- | --- |
| JPEG/PNG/WebP | 10 MiB, 20 million pixels, dimension ≤8,192 |
| MP4/MOV/WebM video | 50 MiB, 120 seconds, dimension ≤4,096 and 10 million pixels |
| M4A/MP3/WAV/audio WebM | 10 MiB, 300 seconds |
| Unencrypted PDF | 20 MiB, 1–100 pages |
| UTF-8 text | 1 MiB; binary/control bytes rejected except tabs/newlines |

A draft allows 10 reservations and 100 MiB; an account 500 MiB; server reserved
capacity 2 GiB. Pending/deleting objects count. ffprobe is network-disabled,
bounded to ten seconds and two concurrent inspections; PDF parsing is bounded.
Format validation is not malware scanning. Unsupported formats/codecs are rejected;
validated media may still fail playback on a particular device.

Uploads reserve a client UUID, stream exact raw bytes, then finalize. After an
uncertain transfer, inspect the reservation before a deliberate retry. A live
UPLOADING lease blocks replacement/removal; stale leases expire after 15 minutes.
Unfinished reservations expire after 24 hours; cleanup preserves referenced READY
files. Text version and attachment lifecycle are separate, joined by the message
lock during scheduling.

Microphone permission is requested at Record voice; notifications at their enable
action. Login requires neither. Denied/permanently-denied states offer appropriate
Settings recovery; already granted access is reused. System pickers select only
chosen files without broad storage/contact grants. Recordings stop on background,
cancel or limits. Native players use private temporary playback files; dismissal,
expiry, auth suspension and restart cleanup remove them. Exported copies in other
apps cannot be recalled.

## Android cache and synchronization

SQLCipher must report cipher support before persisting private snapshots. A random
256-bit key stays in device-only SecureStore; no plaintext fallback or cached login
approval exists. Data is scoped by account/API origin and invalidated on mutations,
auth transitions and reconnect. Expiry is checked before reads; backward clocks
purge copies. Failure disables caching while remote reads remain available.

| Snapshot | Maximum TTL |
| --- | --- |
| Profile/preferences/details | 5 minutes |
| Dashboard/first mailbox page | 60 seconds |

Usable deadlines are also bounded by token/session expiry and 60 seconds since
the last protected server success. Cache reads never renew that window. Profile
restoration, editors, review proofs, capabilities, pagination/history and writes
remain remote. Identical eligible reads share I/O; manual refresh bypasses cache.
Mutations invalidate before and after settlement, including uncertainty. Timers,
read retries and expiry refreshes are bounded and stop on blur/auth transitions.
Unsaved settings stay separate from fresh server baselines. No offline write queue.
Snapshot storage is bounded to 200 rows, 128 KiB/payload, 4 MiB retained payloads
and 4,096 SQLite pages. Migration failures never trigger a plaintext replacement.

Reusable media uses an independent SQLCipher index and AES-256-GCM files in the
private cache directory. Every open first authorizes online using the content
`/access` endpoint and digest/size; retained bytes save transfer, not auth calls.
Access lasts at most five minutes, and active viewers stop at expiry. Size/digest
are verified before retaining and after decrypting. Missing/corrupt bytes miss
safely. Retention is seven days without renewal, bounded to 250 MiB/500 entries
with LRU eviction. Transfers serialize and precheck disk for four times file size
plus 16 MiB. No tokens or signed URLs enter cache metadata.

Clear downloaded media removes media files/index/keys without deleting originals
or pending selections. Logout/account/origin changes purge Dearly caches and revoke
in-flight leases. OS eviction is a normal miss; remote revocation is not instant
while a permitted copy is open. Suspended processes and flash erasure cannot offer
instant physical deletion guarantees. Secrets/private content never enter logs.

## Sender attribution in external notifications

Scheduled email (subject and body), WhatsApp and SMS identify the sender using
the message owner's saved profile name at submission time. Names are display
labels, not verified legal identities. Blank names use “Someone”; notification
text never substitutes a sender phone/email or exposes message content. Email
markup is escaped, control/bidi characters are removed and label length is bounded.
The Gmail relay resolves the name from the durable intent's owner, never caller
input. Gmail's actual From address remains the configured Dearly mailbox.
SMS shortens GSM-compatible names to preserve the one-segment/link budget; names
that would force Unicode encoding use “Someone”. OTPs remain system notifications.
