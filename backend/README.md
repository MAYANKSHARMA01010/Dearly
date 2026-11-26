# Dearly backend

The backend supports Dearly's digital time capsules: private multimedia content
prepared today and made available to selected recipients at a scheduled future
time. Existing message/draft models represent capsules; delivery providers support
notifications and controlled access to due content.

Node 22, Express, TypeScript, Prisma and PostgreSQL. The API handles phone auth,
private drafts/media, reviewed schedules, mailboxes, notifications and signed
provider callbacks. Separate supervised processes perform delivery and push work;
PostgreSQL holds durable leases and outcomes. Redis is optional.

From the repository root:

```sh
npm ci --prefix backend
npm run prisma:deploy --prefix backend
npm run dev --prefix backend
```

First create private backend/.env from its single template and review the target
DB; migrations are additive, not resets. The local API uses port 8080. For scheduling
and push, start the documented workers with the same DB/storage configuration.
The hosted entrypoint is `node dist/jobs/startHosted.js`.

- [Setup](../docs/setup.md): environment ownership, providers and test commands.
- [Architecture/security](../docs/architecture.md): ownership, lifecycle and data rules.
- [API guide](../docs/api.md): Swagger at `/api/docs`, schema at `/api/openapi.json`.
- [Operations](../docs/operations.md): deployment, logs, maintenance and recovery.
- [Releases](../docs/releases.md): exact-source CI/deployment and APK coordination.

`npm run check --prefix backend` runs lint, strict typechecks, tests and build.
Integration/recovery tests require isolated disposable database configuration.
Automated transports are fake; no command authorizes arbitrary live messages.
