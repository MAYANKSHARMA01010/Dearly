# Dearly project structure

Phase 1 prepares folders for phone-only login and future messages containing
text, photos, videos, voice recordings, and other attachments. Recipients may be
the sender, another Dearly user, a phone number, or an email address. Planned
delivery channels are in-app, WhatsApp, SMS, and email.

Folders contain `.gitkeep` only until implementation needs a real file. Existing
configuration, dependencies, entry points, and database schema are preserved.

## Frontend

Keep the existing `src/screens/` convention for feature UI:

| Folder | Responsibility |
| --- | --- |
| `screens/auth/` | Phone entry and OTP verification |
| `screens/home/` | Dashboard: created, scheduled, sent, received, drafts, failed |
| `screens/messages/` | Compose, attachments, occasion, scheduling, lists, details; edit, reschedule, cancel |
| `screens/recipients/` | Choose self, app user, phone number, or email |
| `screens/notifications/` | Notification list and message-opening actions |
| `screens/profile/` | Account and profile |
| `screens/settings/` | Notification preferences, timezone, and app settings |
| `components/messages/` | Shared message cards, status indicators, and message content |
| `components/media/` | Attachment selection, previews, playback, and voice recording UI |
| `components/recipients/` | Shared recipient input and display |

Keep reusable primitives in the existing `components/common/`, `forms/`,
`layout/`, and `platform/` folders. Keep API requests in `api/`, device and
storage integrations in `services/`, state providers in `context/`, hooks in
`hooks/`, configuration in `config/`, and Paper themes/design tokens in `theme/`.
Retain `utils/` and the existing asset folders.

`App.js`, `index.js`, providers, Babel, Metro, Tailwind, CSS, and package versions
remain unchanged. `frontend/AGENTS.md` requires Expo Router for future navigation;
the current starter uses `App.js` and has React Navigation dependencies but no
Expo Router dependency. When navigation is implemented, follow those instructions
and verify SDK 58 documentation before adding `src/app/` route files. Feature UI
can remain under `screens/`, with route files importing it. The existing
`navigation/` folder is retained; do not build a competing navigation system.

## Backend

Retain the existing layered structure and naming, including plural `configs/`:

| Folder | Responsibility |
| --- | --- |
| `src/routes/` | HTTP endpoints grouped by feature |
| `src/controllers/` | Request/response handling |
| `src/validators/` | Request validation |
| `src/services/` | Auth, users, messages, recipients, attachments, scheduling, notifications, and delivery business logic |
| `src/middlewares/` | Authentication, authorization, errors, rate limiting, validation |
| `src/configs/` | Environment, Prisma, and optional Redis/provider configuration |
| `src/jobs/` | Due-message scheduling and enqueueing work |
| `src/workers/` | Background delivery execution, retries, and status updates |
| `src/providers/whatsapp/` | WhatsApp delivery integration |
| `src/providers/sms/` | SMS delivery integration |
| `src/providers/email/` | Email delivery integration |
| `src/providers/storage/` | Attachment storage integration |
| `src/constants/`, `interfaces/`, `types/`, `utils/` | Shared constants, contracts, types, and helpers |
| `prisma/` | Schema and migration history |
| `logs/` | Runtime logs, subject to existing ignore rules |

Keep business rules in services and vendor-specific calls in providers. Jobs and
workers are placeholders: no queue library, recurring timer, or delivery process
has been configured. Redis remains optional until cache/queue requirements are
decided. Store attachments through the eventual storage provider; no local upload
directory is needed yet. Provider folders do not choose a vendor or guarantee free
delivery.

## Next implementation steps

1. Add the Express application and server entry points using existing backend
   conventions. The current scripts reference `src/server.ts`, which does not yet
   exist, so backend start/build readiness is not part of this folder-only phase.
2. Replace the generic email/password Prisma user template with the agreed
   phone/OTP account design; then design messages, recipients, attachments,
   schedules, and per-channel delivery records before generating migrations.
3. Implement phone authentication and navigation, preserving the existing styling
   and Paper providers.
4. Implement message creation, recipients, date/time/timezone, and message lists.
5. Implement durable scheduling, delivery integrations, retries, status tracking,
   and notifications. Ensure received messages are accessible only to the intended
   recipient and scheduled content is not exposed early.

No empty controllers, screens, models, environment secrets, provider credentials,
or migration files are generated in this phase. Add implementation files and
feature-specific subdivisions when the corresponding work begins.
