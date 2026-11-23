# Notifications and settings — Phase 15

## Behavior

Notifications are durable account-owned records, created inside the same database
transaction as delivery activity. They contain only an update kind and an opaque
owned-message or delivered-inbox address, never message text, media, sender names,
phone numbers or external bearer links. Inbox delivery creates a received update;
final submission, delivery, partial outcome and failure create sender updates.
Mixed in-app/external deliveries use the same notification contract. Unique source
keys prevent duplicate notification records. Existing history is not backfilled.

The authenticated list has 20-item cursor pages and an unread count. Reading a
page does not mark items read. Opening an item explicitly marks that notification
read, then navigates to the existing protected message screen. Notification read
state is separate from Dearly's explicit message-opened receipt. Foreign cursors,
read requests and push links cannot access another account's notifications.
Deleted or unavailable messages still fail their normal server access checks.

The Settings screen persists these preferences:

- In-app notifications: controls creation of future notification records, while
  keeping old records and actual message delivery intact.
- Push alerts: off by default; requires in-app notifications and explicit device
  permission. Disabling either control skips queued, unsubmitted push jobs.
- Default phone channel: WhatsApp or SMS, preselected only for new schedules when
  available. Reschedules keep existing channels. Preview and confirmation still
  require recipient consent; no preference rewrites an existing schedule.

Profile name, optional delivery email and IANA timezone use the existing profile
API. Phone sign-in remains OTP-only. Settings links to profile/timezone editing and
session sign-out. A recipient may disable their in-app/push alerts without losing
the message in their inbox. Account alert controls do not retract an explicitly
consented external SMS/WhatsApp/email notification. There is no automatic external
fallback or all-channel sending: changing a delivery channel requires a new review.

## API

All endpoints below require a valid bearer session and return private/no-store
responses. Existing global request limits apply. Inputs are strict and bounded.

| Endpoint | Purpose |
| --- | --- |
| `GET /notifications?cursor=UUID` | Page and unread count |
| `GET /notifications/:id` | Resolve this account's notification target |
| `POST /notifications/:id/read` | Idempotent explicit notification-read action |
| `GET /notifications/preferences` | Persisted settings or defaults |
| `PATCH /notifications/preferences` | Save the complete preference form |
| `PUT /notifications/devices` | Register/rotate a session-bound Expo token |
| `DELETE /notifications/devices/:id` | Disable this session's device registration |

Registration accepts an installation UUID, Expo push token, iOS/Android platform
and the configured Expo project UUID. A different active session cannot take over
an installation or token. Five active devices per session are allowed. Repeating
an identical registration preserves its timestamp; rotating a registration cannot
redirect an older queued alert to a replacement account. Logout disables associated
devices, and the worker also checks session revocation/expiry before submission.
Already submitted alerts cannot be recalled; they carry generic text only.

## Push dispatch

`npm run push:worker --prefix backend` runs a bounded pass; append `-- --loop`
for an explicitly managed worker. Dispatch defaults to disabled:

```dotenv
PUSH_PROVIDER=disabled
EXPO_PROJECT_ID=
EXPO_ACCESS_TOKEN=
```

Select `PUSH_PROVIDER=expo` only after configuring the matching app project and
push credentials. The optional Expo access token belongs only in backend/.env.
The mobile app reads its public Expo project ID from app configuration.

Notification creation reserves unique per-device push jobs. Workers atomically
claim a job and persist SUBMITTING before an HTTP request. A timeout or crash is
UNKNOWN and is not automatically resent. Opt-out, read notifications, expired or
revoked sessions, disabled devices and changed account/token associations skip
unsubmitted work. No private content goes to the push service: the payload is
“Dearly / You have a new update in Dearly” and a notification UUID.

Expo ticket acceptance is not phone arrival. Receipts are checked after 15 minutes;
provider acceptance means FCM/APNs accepted the request, not that the user saw it.
Invalid-token responses disable only the matching registration; an old receipt
cannot disable a newer token. Missing receipts expire to UNKNOWN after 24 hours.
Other failures remain explicit; no SMS/email/WhatsApp fallback is sent.

A native listener retains a pending notification UUID through login, resolves it
through the authenticated server, and opens only the supported owned/received
route. URLs supplied in push payloads are never followed. Foreground registration
and token-rotation listeners update a permitted device without repeatedly asking
for OS permission. Denied permission removes its server registration. Expo Go and
missing project setup display an explicit limitation; no simulation is called real
push delivery.

Sources: [Expo SDK 58 notifications](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/),
[setup](https://docs.expo.dev/push-notifications/push-notifications-setup/),
[push tickets and receipts](https://docs.expo.dev/push-notifications/sending-notifications/),
[FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/).

## Project setup and acceptance — 19 November 2026

The user authorized creating Dearly projects under their personal Gmail and
requested local APK builds. Expo project `@manku_dada/dearly` is linked; Firebase
project `dearly-afd15` is on Spark ($0/month), with optional Analytics and Gemini
disabled. Android package `com.mayanksharma.dearly` is registered. A dedicated
service account has only the Firebase Cloud Messaging API Admin role; its private
key is attached to the matching Expo project's FCM V1 credentials. No Editor role,
billing upgrade, paid build, database replacement or iOS paid-account enrollment
was added. Firebase Android client configuration is private in the repository but
included in the native build; the service-account key and signing key are excluded.

Backend lint/typecheck/build and 83 standard tests pass; frontend checks and 81
tests pass. Focused database checks cover notification ownership, durable read
state, pagination, opt-out, duplicate push claims, uncertainty, token receipts and
logout. The full integration sweep found an obsolete table-count expectation and
an aged-receipt fixture; both were corrected and the affected suites passed on
rerun. Tests use fake push transports and isolated schemas; no live push was sent.
The final SMS/WhatsApp receipt suites pass 18 entries, and all three real
mobile/API integration scenarios pass. The iOS JavaScript export passes. At this historical checkpoint Expo Doctor reported 19/20. Phase 16 applied the
three SDK 58 recommended patches and reverified Doctor at 20/20.

Real target-device push permission/arrival and notification-tap-after-login checks
remain pending. The hosted backend URL is intentionally empty, so the standalone
preview APK shows service configuration is needed. Physical push acceptance cannot
be claimed from compilation, a fake gateway or a token registration. Phase 15 is
engineering-complete, with device acceptance deferred by the user. Phase 16
non-device checks and handover are recorded in [current project documentation](README.md).
