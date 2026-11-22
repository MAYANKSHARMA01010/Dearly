# Phase 18 environment audit — 21 November 2026

## Scope and implemented work

- Reconciled local and hosted examples with existing environment validation and
  actual consumer selection. Added a separate `backend/waha.env.example` for the
  WhatsApp service; its filename is compatible with the existing release archive
  guard without weakening that guard. Production now documents Gmail relay rather
  than direct SMTP on Render. Examples contain no real sender identity or project
  credential; actual Expo push identity is supplied privately when enabled.
- Reorganized the ignored local `.env` by feature, preserving existing private
  credentials/modes and providing explicit hosted WAHA/SMSGate companion values.
  Local selection still uses local provider settings; mobile remains hosted-first.
  A private owner-only backup was taken before editing. Local `.env` has mode 600.
- Added `backend/tests/envExamples.test.ts`: validated-key/operations-input coverage,
  no duplicate active keys, safe disabled defaults, fail-closed incomplete hosted
  setup, a fully synthetic hosted preflight, and common secret/personal-data checks
  for examples/public mobile configuration. No runtime source changed.

## Observed hosted configuration changes

Render access worked during this audit. The backend showed commit `819c41b` Live,
independently confirming the previous user-reported deployment. Private before/
after exports were compared without reporting values.

| Consumer | Change / evidence |
| --- | --- |
| Render backend | Removed unused SMTP_PASSWORD from relay-mode service; made WHATSAPP_OTP_DAILY_LIMIT=20 explicit (same existing default). All other configured values unchanged. Environment-update deployment succeeded, 20.6 seconds, existing 1.1.3 code. |
| Render WAHA | Added explicit independent strong dashboard/Swagger credentials to avoid startup credential generation/logging. Both interfaces remain disabled; API-key verifier, paired namespace/worker/session DB, pinned image and all prior values unchanged. Deployment succeeded, 1 minute 1 second. |
| Gmail relay | User supplied a replacement app password through the private file. Direct TLS/authentication check returned READY. Reviewed Neon plan changed only dearlymail, then deployed through the existing project-scoped CLI profile with env pull disabled. Hosted authenticated relay verification returned READY; no email submitted. |
| Local Gmail SMTP | Updated to the replacement after hosted verification; all other local sender settings preserved. |

Screenshots and private exports stay ignored under `backend/.runtime/phase18/`;
never commit or upload that directory. The deployed application version remains
1.1.3: this phase changes examples/tests/docs and private settings, not runtime
application source or the distributed APK. No new APK/release is claimed or needed
for these configuration-only changes. Future runtime changes still require the
root release-closeout rules.

## Checks and limits

- Local private environment and exported hosted private environment pass existing
  parseEnvironment validation. Hosted offline releaseIssues returns no issues.
- Backend `npm run check`: lint, strict types, 114 tests and production build pass.
  The four added example tests complement the existing 110 tests.
- Current tracked-file scan found no exact matches for credential values loaded
  privately from local and hosted configurations. A scan of the published 1.1.3
  source ZIP and APK entries found no exact matches for known current/pre-rotation
  private credentials. These are bounded known-value scans, not proof that no
  secret exists anywhere in history or in an external log.
- Post-rollout read-only check: API readiness HTTP 200; WAHA readiness OFFLINE
  after a bounded request. A live configuration deployment does not prove a
  connected sender. A single follow-up returned API HTTP 200 and WAHA READY.
  No OTP/send was attempted, and this does not establish improved OTP latency.
- Release version consistency remains 1.1.3, Android code 7, iOS build 7. Existing
  local `.gitignore` edit is unrelated and remains unstaged.
- WAHA's pre-change log view contained startup-generated admin credentials and
  engine prepared-statement parameter errors. No raw logs or personal account
  records were copied into documentation. Explicit credentials remove the observed
  generation cause; absence of future sensitive logging still needs a bounded
  post-restart log check. Database connection/engine latency diagnosis belongs to
  Phase 19; this phase did not alter connection mode, pair/reset a sender or claim
  the OTP delay fixed.

## Credential replacement acceptance — completed with user exception

| Item | Final state | Evidence / exception |
| --- | --- | --- |
| Gmail replacement rollout | Complete | Direct SMTP and hosted relay READY; user confirmed OLD app password revoked on 21 November |
| SMSGate Cloud password | Retained by explicit user instruction | User requested the existing password remain; no phone/Render/local SMS credential change performed; unused proposed replacement file removed |
| Neon application owner password | Rotated | User confirmed only Dearly uses this role; local/backend/relay consumers coordinated; fresh new-password connection succeeds and old-password connection is rejected |

The SMSGate credential previously shared in chat is intentionally unchanged. This
is a recorded user exception, not a claim that every exposed credential was
replaced. Provider/device IDs and persistent access, webhook, backup and signing
keys were not regenerated as a side effect.

The first Render environment-update rollout after database rotation failed:
private export comparison showed its DATABASE_URL still held the old password.
Corrected the actual revealed textarea, saved again and compared the exported
configuration against the intended private values: exact match, no differences.
The corrected deployment succeeded in 35.9 seconds, preserving source 819c41b and
version 1.1.3. API/database readiness returned HTTP 200 afterward. The relay was
redeployed with its existing environment/bundle to refresh the injected database
connection; authenticated verification returned READY without sending email.

Phase 18 is accepted for its requested scope with the explicit SMSGate exception.
Phase 19 remains the next phase; OTP latency is not resolved by this credential
rollout. Existing test evidence above remains applicable because no runtime source
changed during this final configuration step.

Provider reference for phone password changes:
[SMSGate password guidance](https://docs.sms-gate.app/faq/general/). Cloud changes
take effect immediately across clients. Do not create a new device/account or
reset the configured Signing Key as a shortcut.

## Single-source consolidation — 22 November 2026

The active configuration now consists of one private `.env` and one safe
`.env.example` per package. The earlier production, WAHA and release templates
were folded into backend profile sections; they are no longer active files.
Twenty-three historical plaintext dotenv exports were retired after verified
AES-256-GCM recovery encryption. Recovery material remains ignored and private.
Existing local credentials, the distinct hosted gateway verifier/session identity,
Gmail credentials and native signing identity were preserved; no credential or
session was rotated as part of this work.

Added explicit in-memory service selection and inherited-environment filtering.
Production cannot fill missing configuration from the local master file; local
runtime loading excludes hosted, relay and release sections. Container definitions
receive selected variable names rather than the whole multi-service file. Hosted
relay selection excludes the local SMTP password. The release coordinator reads
its settings and hosted database/monitor configuration from the same backend
source. Outgoing app-download destinations now come from APP_DOWNLOAD_URL.

The local APK wrapper reads only frontend/.env and forces production/hosted mode;
Expo owner/project configuration comes from that file. Removed duplicate EAS URL
settings. Fixed API vendor origins and protocol/security constants remain in code.
GitHub's existing operations URL variable was synchronized and its workflow now
reads that variable rather than a project URL literal.

Validation: backend check (128 tests plus lint/types/build), frontend check (133
tests plus lint/types), 15 tooling tests, five focused environment regressions,
service Compose validation, exact existing Expo owner/project identity comparison,
iOS/Android exports, shell syntax, release version consistency and whitespace
checks passed. A bounded known-value scan found zero private credential/sender
matches in tracked source and both generated platform exports. Both private env
files remain ignored, with owner-only permissions. This is not an exhaustive
secret-history audit or real provider/native-device acceptance.

No live messages, production restart, Render deployment, APK build or publication
was performed. Hosted platform settings remain independently injected; local
profile edits do not automatically synchronize or deploy them. Runtime changes
are on the configuration branch and still require the normal versioned release
process before deployment.

### Canonical grouping and de-duplication — 22 November 2026

Replaced full copied service profiles with shared canonical settings and only
actual runtime differences. The backend is grouped into 13 numbered feature
sections; the frontend has three sections for runtime choice, backend addresses
and Expo identity. Both real/example files use matching comments and ordering.
Removed redundant REDIS_URL, EMAIL_PUBLIC_URL, SMTP_FROM, RELEASE_API_URL and the
paired SMSGate URL aliases from the maintained files. Existing deployment aliases
remain accepted for compatibility. SMTP sender, content/release origins, WAHA
vendor aliases and hosted SHA512 verifier are generated from their canonical
inputs. Different security secrets were not merged merely because their values
have similar shapes. Local gateway volume/session behavior remains distinct.

Before/after effective configuration comparison passed for both API profiles,
both gateways, Gmail relay and release tools. Frontend values were unchanged.
Encrypted before-change recovery and comparison material remains ignored and
private. No credentials were rotated, no sessions relinked and no deployment or
live provider submission was performed.

Final result: 176 → 96 active backend keys, no redundant hosted values, and one
private/example pair per package. Backend lint/types/build and all 130 tests,
16 tooling tests, nine focused template/SMTP tests, Compose validation, known-value
source scan and whitespace checks passed. Both private files retain mode 600.
