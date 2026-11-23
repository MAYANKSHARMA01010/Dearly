# Dearly

Dearly is an Android app for writing private messages now and delivering them
later. Messages can contain text, photos, video, voice recordings and files.

The current distribution is a signed ARM64 Android APK. Android and the backend
are the active testing targets; iOS distribution and testing are outside current
scope. Existing iOS-compatible source is retained for future work.

## Features

- Phone-number sign-in through WhatsApp OTP; verified profile email linking.
- Private drafts with editable manual recipients and attachments.
- Timezone-aware scheduling, rescheduling and cancellation before dispatch.
- Received/sent mailboxes and separate submission, delivery and opening evidence.
- In-app, WhatsApp, SMSGate and Gmail notification channels.
- Android push alerts, encrypted SQLite snapshots and encrypted reusable media.

Recipients can be yourself, a Dearly user ID, a phone number or an email address.
There is no address-book import, contact search or background contacts collection.

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
