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

## Credential replacement acceptance still open

| Item | Current state | Required completion evidence |
| --- | --- | --- |
| Gmail replacement rollout | Complete: direct SMTP auth and hosted relay READY | User must revoke OLD app password in Google, retaining replacement; record confirmation |
| SMSGate exposed Cloud password | Replacement prepared privately; phone change not yet confirmed | User applies replacement in Cloud Server credentials; update local/Render consumers and verify auth without sending SMS |
| Neon application owner password | Local and Render use the same role; WAHA uses a different role; relay connection is injected | Confirm other applications do not share the role before rotation; coordinate all consumers and verify connections |

Phase 18 is not fully accepted until the open credential actions are resolved or
explicitly deferred by the user. Do not treat selecting “I'll save” as proof of
revocation or phone configuration. Never paste replacement credentials into chat.

Provider reference for phone password changes:
[SMSGate password guidance](https://docs.sms-gate.app/faq/general/). Cloud changes
take effect immediately across clients. Do not create a new device/account or
reset the configured Signing Key as a shortcut.
