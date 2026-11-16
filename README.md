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
adds phone OTP/session/profile APIs with explicit local simulation; real OTP delivery
is not configured. Phase 5 adds mobile phone login, secure session recovery and
own-profile editing, with explicit test-code labeling. Scheduling and delivery
follow later. Phase 6 adds private, versioned draft and recipient
APIs. Phase 7 adds the mobile composer, manual recipients, draft list, explicit
save/edit/delete, and unsaved/conflict recovery. See [mobile drafts](docs/mobile-drafts.md).
Phase 8 adds private attachments, voice recording/playback, format validation and
cleanup. See [attachments and storage](docs/attachments.md) for supported types,
limits and the persistent-disk requirement.
See [backend authentication](docs/authentication.md) and
[mobile authentication](docs/mobile-auth.md) for setup and security limits.
The [draft API contract](docs/draft-api.md) covers private message work and recipients.

See [Project structure](docs/project-structure.md) for folder responsibilities,
feature placement, and the next implementation steps.

Follow the [implementation phases](docs/implementation-phases.md) for the roadmap
and [backend setup](backend/README.md) to run the API on port `8080`.
