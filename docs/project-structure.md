# Dearly project structure

Phase 1 prepares folders for phone-only login and future messages containing
text, photos, videos, voice recordings, and other attachments. Recipients may be
the sender, another Dearly user, a phone number, or an email address. Planned
delivery channels are in-app, WhatsApp, SMS, and email.

Folders contain `.gitkeep` only until implementation needs a real file. Phase 2
adds backend entry points and focused runtime files. Phase 3 adds Router, shared
Paper themes/components, and the mobile API client while preserving SDK 58 and
the NativeWind/Babel/Metro pipeline. Phase 4 replaces the generic user schema with
phone identities, OTP challenges, durable phone budgets, sessions and refresh history.
Phase 6 adds owned draft/recipient models and an additive migration. See
[authentication contracts](authentication.md) and [draft APIs](draft-api.md).

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

`index.js` imports global CSS before `expo-router/entry`. `src/app/_layout.js`
owns the Stack, Paper/Safe Area providers, navigation theme, and status bar.
`src/app/index.js` and `status.js` import feature screens; `+not-found.js` provides
a recoverable missing-page state. The superseded `App.js` starter was removed.
Babel, Metro, Tailwind, CSS, and existing core package versions are preserved;
Router and necessary compatible peers were added through Expo install.

`src/theme/` holds Paper light/dark themes and spacing/touch-size tokens.
`src/api/client.js` handles safe requests and cancellation; `src/config/api.js`
selects the environment; `src/services/health.js` and `src/hooks/useServiceHealth.js`
drive the service-status flow. Phase 5 adds `services/auth/`, `context/AuthContext.js`,
`hooks/useAsyncAction.js`, login/profile screens and guarded Router routes. Native
credentials use SecureStore; web sessions stay in memory. `navigation/` remains
reserved; never create a competing navigation system. Phase 6 provides draft APIs;
the mobile composer follows in Phase 7. See [mobile authentication](mobile-auth.md).

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

1. Backend foundation is implemented in Phase 2: `src/app.ts` assembles Express,
   `src/server.ts` loads the environment, and `src/serverLifecycle.ts` manages
   listening and shutdown. See [backend setup](../backend/README.md) for health
   endpoints and checks. Mobile foundation follows in Phase 3.
2. Phase 4 implements the phone/OTP account design and reviewed migration. Design
   messages, recipients, attachments, schedules and delivery records in their later
   phases, with separate traceable migrations.
3. Phase 5 implements mobile authentication and navigation with the existing styling
   and Paper providers. Phase 6 implements draft/recipient APIs in layered routes,
   controllers, validators and services, with shared session/phone helpers.
4. Implement message creation, recipients, date/time/timezone, and message lists.
5. Implement durable scheduling, delivery integrations, retries, status tracking,
   and notifications. Ensure received messages are accessible only to the intended
   recipient and scheduled content is not exposed early.

Scaffolding uses placeholders only where no implementation is needed. Phase 4 adds
real auth controllers, validators, services, a provider contract and a migration;
no real provider credentials or message sends are introduced. Add implementation files and
feature-specific subdivisions when the corresponding work begins.
