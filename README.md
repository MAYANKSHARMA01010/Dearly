# Dearly

Dearly is a personal digital time capsule app for preserving memories, feelings
and wishes today and sharing them with your future self or chosen people at a
scheduled time. A capsule can contain text, photos, video, voice recordings and
files, making it suitable for future letters, birthdays, anniversaries and personal
milestones.

The core experience is to create, preserve, review and schedule a capsule.
WhatsApp, SMS, email and push notifications support account verification or notify
recipients about capsule availability. In-app access and controlled external
links let recipients open the content when it becomes due.

The current distribution is a signed ARM64 Android APK. Android and the backend
are the active testing targets; iOS distribution and testing are outside current
scope. Existing iOS-compatible source is retained for future work.

## Features

- Phone-number sign-in through WhatsApp OTP; verified profile email linking.
- Private capsule drafts with editable manual recipients and attachments.
- Timezone-aware capsule scheduling, rescheduling and cancellation before dispatch.
- Created/received capsule views, implemented as sent/received mailboxes, with
  separate submission, delivery and opening evidence.
- In-app, WhatsApp, SMSGate and Gmail notification channels.
- Android push alerts, encrypted SQLite snapshots and encrypted reusable media.

Recipients can be yourself, a Dearly user ID, a phone number or an email address.
There is no address-book import, contact search or background contacts collection.

## Project explanation and viva answers

**Introduce the project.**

“Dearly is a digital time capsule app. It lets users capture memories, feelings
and wishes using text, photos, video, voice notes and files, then choose a future
time to share them with themselves or selected people. The purpose is to make
personal moments available at a meaningful time, such as a birthday, anniversary
or future milestone.”

**What problem does it solve?**

“People have thoughts, memories and wishes they want to revisit or share at a
specific future moment. Dearly brings the content, recipients and scheduled time
together in a private capsule workflow.”

**Explain the user flow.**

“The user signs in with a phone OTP, creates a private capsule draft, adds content
and recipients, chooses a date, time and timezone, reviews the details and confirms
the schedule. A backend worker processes it when due. Recipients can then access
the capsule through the supported in-app or external access flow.”

**Explain the architecture.**

“The React Native frontend uses Expo Router for navigation, React Native Paper
and NativeWind for the interface, and Context with custom managers for shared
session and draft state. It calls an Express API using fetch. Backend services
apply ownership and scheduling rules. Prisma and PostgreSQL store accounts,
capsule records, recipients and durable work; private object storage holds files.
A worker processes due capsules independently of the mobile app.”

**Why are WhatsApp, SMS and email integrated?**

“WhatsApp OTP verifies the phone account. Scheduled WhatsApp, SMS and email
notifications help selected recipients discover and open a due capsule. Push
notifications provide device alerts. These channels support the time capsule
experience.”

**Why does the source code call capsules messages and drafts?**

“Capsule is the product concept. The existing implementation uses names such as
DraftMessage, recipients, schedules and inbox items to represent its content and
delivery lifecycle. These technical names describe how a capsule is stored and
processed.”

**How is privacy handled?**

“The server checks ownership and recipient access. Adding a recipient does not
grant access to a private draft or future capsule content. SecureStore protects
tokens and keys, SQLCipher encrypts local snapshots, and retained media files are
encrypted. This implementation should not be described as end-to-end encrypted.”

**What are the practical limitations?**

“Scheduling depends on backend and provider availability, and free hosts can
sleep, so exact delivery timing is not guaranteed. External provider acceptance
is separate from confirmed delivery and content opening. Cached data does not
provide offline login or offline scheduling. Android is the current release target.”

Use “capsule” when explaining the product. Preserve actual API, database and screen
names when discussing code. Scheduling freezes the reviewed plan; it is not a
claim that the owner can never read or change their content through supported
edit/cancel flows, or that preservation is guaranteed indefinitely.

## Stack and setup

The mobile app uses Expo SDK 58, React Native, Expo Router, NativeWind v4 and
React Native Paper. The API uses Node 22, Express, Prisma and PostgreSQL. Neon
stores database records and private objects; Render runs the API and WAHA.
SMSGate requires the configured physical Android/SIM. Redis is optional.

1. Install package dependencies in `backend/` and `frontend/`.
2. Create each package's private `.env` from its single `.env.example`.
3. Follow [environment setup](docs/setup.md#environment-ownership); keep credentials backend-only.
4. Run `npm run dev --prefix backend` for the local API on port 8080.
5. Run `npm run android --prefix frontend` when Android testing is needed.

The app prefers the configured hosted API. Local access from a phone requires
an intentional LAN/USB setup; localhost on the phone refers to the phone itself.

## Checks and releases

Run `npm run check --prefix backend`, `npm run check --prefix frontend` and
`node --test scripts/environment.test.mjs scripts/operations/*.test.mjs scripts/release/*.test.mjs`.
CI additionally uses disposable PostgreSQL for integration/recovery checks and
exports Android. Tests never send real provider messages.

Use [Android builds](docs/releases.md#build-a-local-apk) and [the release pipeline](docs/releases.md#coordinated-release)
for local signing, MAJOR.MINOR.PATCH versions, gated deployment and immutable
GitHub APK/source/checksum publication. Published builds remain release candidates
until the required Android acceptance is recorded. Free hosting can sleep and
cannot promise exact delivery times.

See [all project documentation](docs/README.md), [backend setup](backend/README.md)
and [repository structure](docs/architecture.md#code-and-data-ownership). Private progress/history
is stored locally and excluded from Git and release archives.

A user-requested [redacted AI conversation archive](AI_CHAT_HISTORY.md) records
project discussions. It is historical context; use the current guides for setup
and behavior.
