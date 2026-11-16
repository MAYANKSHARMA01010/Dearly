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
is not configured. Message creation, scheduling, and delivery follow later.
See [authentication setup](docs/authentication.md) for endpoints and security limits.

See [Project structure](docs/project-structure.md) for folder responsibilities,
feature placement, and the next implementation steps.

Follow the [implementation phases](docs/implementation-phases.md) for the roadmap
and [backend setup](backend/README.md) to run the API on port `8080`.
