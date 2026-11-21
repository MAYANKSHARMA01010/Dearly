# OTP performance — Phase 19

## Baseline and diagnosis

The previously authorized 1.1.3 hosted OTP took 15.157 seconds to return accepted;
the user confirmed noticeable arrival delay. Challenge creation was about 2.3
seconds into that request, based on client/server timestamps; that approximate
comparison cannot isolate gateway time. A new baseline attempt on 21 November
stopped at WARMING, with no OTP POST or sender-budget consumption.

A bounded Last hour inspection of backend and WAHA Render logs found repeated
WAHA GOWS prepared-statement parameter-count failures (22 occurrences in the
rendered WAHA log snapshot). The backend's known failed credential rollout was
followed by the corrected Live deployment and successful readiness; do not treat
those historical failures as current authentication failure. No raw provider logs,
personal account identifiers, QR codes, codes or credentials are included here.

WAHA's long-lived session-store connection used the Neon transaction pooler.
Protocol-level prepared statements can be supported by Neon; the observed unnamed
statement errors are a concrete engine/connection compatibility problem, not proof
that every pooled client is unsupported. A direct endpoint for the exact same
WAHA database/role passed TLS/authentication and five parameterized read-only
queries before the proposed rollout. Neither local query timings nor a connection
check prove faster OTP delivery.

The connection compatibility repair changes the hosted WAHA session-store endpoint
from pooled to direct; the regional relocation below addresses measured latency. Preserve its existing database, role, password, namespace, worker, engine,
image, webhook configuration and paired data. The application's Prisma connection
remains pooled. Do not reset/relink the sender or change OTP limits/locks/replay
behavior. See [Neon pooling guidance](https://neon.com/docs/connect/connection-pooling)
and [WAHA storage configuration](https://waha.devlike.pro/docs/how-to/storages/).

## Safe application timings

The backend emits `auth.otp.stage` through the existing runtime allowlisted logger.
Only static stage/completion code, nonnegative durationMs and a validated request
UUID survive. The stages are READINESS, RESERVATION, DISPATCH, FINALIZATION and
TOTAL. A completed dispatch stage means the adapter returned; it does not assert
provider acceptance or arrival. TOTAL fails when the auth service cannot confirm a
usable challenge. Logger failure cannot alter the result or trigger replay.

Durations use the process monotonic clock. They measure server work for a request,
not phone arrival or app-visible cold-start polling. A request can stop before
later stages; absence of a stage is not a fabricated zero. Resend lookup precedes
the measured request flow. No input, code, challenge ID, destination, provider ID,
raw error or response is added to timing logs. Use the shared request UUID to
correlate the existing HTTP duration. Do not enable general body/query logging.

## Verification and rollout status

- Backend checks: 118 unit tests, lint/types/build passed before deployment.
- Isolated PostgreSQL auth integration: 17 runner entries passed, including stage
  correlation, no private-value leakage, expiry, limits and uncertain/superseded
  dispatch behavior. Test database is a disposable local container, not live Neon.
- Timing unit checks preserve returned values/errors and exactly one dispatch even
  if logging throws. The actual logger accepts the event without private payloads.
- Live configuration repair, matching application rollout, before/after timing and
  release evidence are recorded below.
- User authorized up to two timed WhatsApp login tests to the designated own
  account. No authorization for SMS, email, or automatic repeated POSTs is implied.
  The pre-repair baseline did not submit; any after-repair test must record its
  request count and distinguish acceptance from user-confirmed arrival.

Free Render services and Neon compute can still start cold. No artificial
keepalive, paid upgrade or instant-login guarantee is part of this repair.


## Regional latency investigation and sender-scope continuity

The first instrumented 1.1.4 request returned accepted in 15.253 seconds. Server
stages were readiness 0 ms, reservation 4641 ms, dispatch 9160 ms and finalization
1058 ms (total 14860 ms). This shows the direct-connection compatibility repair
alone did not improve the observed request latency.

Render settings confirmed API and WAHA in Oregon (US West); Neon is in Singapore.
WAHA's multi-query cryptographic/session work therefore crossed regions. A Free
Singapore WAHA replacement was prepared using the identical pinned image and
private environment. The old Oregon gateway was suspended before starting the
replacement; never run both against the same session store. The new service
restored the existing session as WORKING without re-pairing. The public Dearly API
origin is unchanged. Final routing and measurement passed as recorded below.

A transport URL change normally changes the hashed sender scope. For this same
paired sender only, production can set WAHA_SERVER_SCOPE_ORIGIN to the previous
origin while WAHA_SERVER_API_URL targets the replacement. The auth budget and
receipt service both use that stable scope, preserving quota and receipt matching.
Without the explicit setting, behavior remains based on the selected API URL.
Development ignores this hosted override, keeping the independently paired local
sender separate. Never reuse it to merge unrelated accounts, engines or sessions.
The field is a logical identity input, not a network destination. Tests cover both
scope continuity and actual requests reaching the new transport address.


## Final acceptance — 22 November 2026

The production API uses `https://dearly-waha-singapore.onrender.com`
(`srv-dc0ndfe7bikc73bas48g`, Free/Singapore). The old Oregon gateway
(`srv-dbvbrcek1f9s73c3dl2g`) remains suspended for rollback. Keep it suspended while
the replacement uses the same session database. The stable scope origin remains
`https://dearly-waha.onrender.com`; it is not the transport destination.

| Measurement | Before regional move | After regional move |
| --- | ---: | ---: |
| Client OTP POST | 15,253 ms | 6,848 ms |
| Server readiness | 0 ms | 0 ms |
| Database reservation | 4,641 ms | 4,647 ms |
| Gateway dispatch | 9,160 ms | 838 ms |
| Final persistence | 1,058 ms | 1,053 ms |
| Auth service total | 14,860 ms | 6,539 ms |
| HTTP request | 14,943 ms | 6,558 ms |

The final warm readiness GET took 700 ms. Both specifically authorized OTP POSTs
returned accepted and the user confirmed both arrived. No additional OTP was sent.
The first attempted baseline stopped at WARMING before a POST. These single warm
observations show about 55% lower request latency, not a latency distribution or
phone-arrival stopwatch. Roughly 5.7 seconds of reservation/finalization remains
between the Oregon API and Singapore Neon. A cold gateway probe took about 52.7
seconds; free sleeping services still add startup delay. No keepalive was added.

Source `79aeec0ea53b7ef770630f3fc490f294683172ba` was independently observed Live
on Render. Backend 118 tests/lint/types/build, 17 isolated PostgreSQL auth runner
entries, frontend 106 tests/lint/types, and
[full CI 44932660441](https://github.com/MAYANKSHARMA01010/Dearly/actions/runs/44932660441)
passed. Timing tests cover privacy, failures and exactly one dispatch; scope tests
cover preserved sender identity, new transport routing and development isolation.

[1.1.4 RC1](https://github.com/MAYANKSHARMA01010/Dearly/releases/tag/v1.1.4-rc.1)
contains the exact-commit signed ARM64 APK (Android code 8), source ZIP, manifest
and checksums. Local packaging and fresh downloaded assets passed verification;
the signer matches the previous release.
[Release verification 44936439203](https://github.com/MAYANKSHARMA01010/Dearly/actions/runs/44936439203)
passed for the exact release commit. Installation of this APK and physical
Android permissions/push/background acceptance remain separate pending gates.
The simulator was stopped without erasure to free build resources; no UI changes
or new native UI acceptance are claimed. Phase 19 is complete; Phase 20 has not
started.
