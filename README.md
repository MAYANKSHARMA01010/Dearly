# Dearly

Schedule text, photos, video, voice, and attachments for yourself or others.

- `frontend/`: Expo SDK 58 with Router, NativeWind v4, Paper themes, and an API client.
- `backend/`: Express/TypeScript runtime with Prisma/PostgreSQL readiness checks.
- `docs/`: Project structure and implementation notes.
- `scripts/`: Shared development scripts when needed.

Phase 1 established the folder structure. Phase 2 adds the backend runtime,
database readiness, request safeguards, and automated checks. Phase 3 adds mobile
routing, a home/service-status shell, shared components, and frontend checks. Those
foundations were restored after the frontend reset on 16 November 2026. Phase 4
adds phone OTP/session/profile APIs with explicit local simulation. Phase 13 adds
real WhatsApp login OTP. Phase 5 adds mobile phone login, secure session recovery and
own-profile editing, with explicit test-code labeling. Phase 6 adds private, versioned draft and recipient
APIs. Phase 7 adds the mobile composer, manual recipients, draft list, explicit
save/edit/delete, and unsaved/conflict recovery. See [mobile drafts](docs/mobile-drafts.md).
Phase 8 adds private attachments, voice recording/playback, format validation and
cleanup. See [attachments and storage](docs/attachments.md) for supported types,
limits and the persistent-disk requirement.
Phase 9 adds timezone-aware schedule review, confirmation, edits, rescheduling and
cancellation. Phase 10 adds durable PostgreSQL work, a separate in-app delivery
worker and private recipient inbox APIs; existing paused plans require a new review.
Phase 11 adds the mobile dashboard, scoped mailboxes, private message/attachment
details, durable activity and an explicit opened choice. See [mailboxes](docs/mailboxes.md). See [worker operations](docs/delivery-workers.md). See [scheduling](docs/scheduling.md).
See [backend authentication](docs/authentication.md) and
[mobile authentication](docs/mobile-auth.md) for setup and security limits.
The [draft API contract](docs/draft-api.md) covers private message work and recipients.

See [Project structure](docs/project-structure.md) for folder responsibilities,
feature placement, and the next implementation steps.

Follow the [implementation phases](docs/implementation-phases.md) for the roadmap
and [backend setup](backend/README.md) to run the API on port `8080`.

Phases 1–14 are complete within their documented scope. Phase 12 adds real Gmail
SMTP notifications and private links; Phase 13 adds free WAHA Core WhatsApp delivery
and immediate login OTP. Live self-tests verified inbox arrival, user-confirmed
WhatsApp arrival, private content and revoked-link rejection. Hosted URLs remain
empty; localhost message links open on this Mac only. Phase 14 verifies a real scheduled SMS through SMSGate Cloud and the physical
SIM 1 sender, signed single-part sent/delivered receipts, private content access
and test-link revocation. See [SMS setup](docs/sms-delivery.md).

For development-task attention alerts on this Mac, run
`sh scripts/attention-sound.sh`. Agents use it before waiting for input and finishing.
It plays a local sound without changing Focus, volume or output settings. This is
separate from Dearly's future product notification features in Phase 15.

Phase 15 adds notifications and account preferences; native push acceptance remains
pending. See [notification contracts](docs/notifications-settings.md) and
[local Android APK builds](docs/android-apk.md).
