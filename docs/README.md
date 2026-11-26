# Dearly documentation

Dearly is an Android digital time capsule app for preserving personal memories,
feelings and wishes and making them available to your future self or chosen people
at a scheduled time. In-app access and controlled external links provide access
to due capsules; WhatsApp, SMS, Gmail and push support notifications, with WhatsApp
OTP used for phone sign-in. Android APK and backend are the current testing/release
scope. Existing iOS source is retained for future work.

| Guide | Read it for |
| --- | --- |
| [Setup and configuration](setup.md) | Requirements, one env/template per package, local startup, provider setup and checks |
| [Architecture and security](architecture.md) | Code/data ownership, auth, recipients, scheduling, delivery evidence, permissions and encrypted caches |
| [API guide](api.md) | Swagger, common contracts and feature workflows |
| [Deployment, operations and recovery](operations.md) | Render/Neon topology, diagnostics, scheduled jobs, backups, restore and limitations |
| [Android builds and releases](releases.md) | Local APK signing, major.minor.patch, exact-source deployment and GitHub publication |

Start with the [root README](../README.md), including its
[project explanation and viva answers](../README.md#project-explanation-and-viva-answers).
API schemas live in the running
backend's `/api/docs` and `/api/openapi.json`; keep Markdown focused on behavior
and workflows rather than duplicating every schema. Canonical key descriptions
live in [backend/.env.example](../backend/.env.example) and
[frontend/.env.example](../frontend/.env.example).

These guides describe the current project. Historical phase reports, completed
checklists, deployment IDs, test transcripts and AI continuity belong in the
ignored `.local-notes/` directory, excluded from Git and release archives. Fresh
clones must remain understandable without that private history. Update the relevant
guide when behavior changes; avoid adding one public document per phase or fix.
