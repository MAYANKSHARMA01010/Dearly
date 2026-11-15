# Dearly

Schedule text, photos, video, voice, and attachments for yourself or others.

- `frontend/`: Existing Expo SDK 58, NativeWind v4, and React Native Paper starter.
- `backend/`: Express/TypeScript runtime with Prisma/PostgreSQL readiness checks.
- `docs/`: Project structure and implementation notes.
- `scripts/`: Shared development scripts when needed.

Phase 1 established the folder structure. Phase 2 adds the backend runtime,
database readiness, request safeguards, and automated checks. Authentication,
message creation, scheduling, and delivery are not implemented yet.

See [Project structure](docs/project-structure.md) for folder responsibilities,
feature placement, and the next implementation steps.

Follow the [implementation phases](docs/implementation-phases.md) for the roadmap
and [backend setup](backend/README.md) to run the API on port `8080`.
