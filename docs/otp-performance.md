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

The repair changes only the hosted WAHA session-store endpoint from pooled to
direct. Preserve its existing database, role, password, namespace, worker, engine,
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

- Backend checks: 116 unit tests, lint/types/build passed before deployment.
- Isolated PostgreSQL auth integration: 17 runner entries passed, including stage
  correlation, no private-value leakage, expiry, limits and uncertain/superseded
  dispatch behavior. Test database is a disposable local container, not live Neon.
- Timing unit checks preserve returned values/errors and exactly one dispatch even
  if logging throws. The actual logger accepts the event without private payloads.
- Live configuration repair, matching application rollout, before/after timing and
  downloadable release acceptance are pending until recorded below.
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
origin is unchanged. Final routing/measurement remains pending until recorded.

A transport URL change normally changes the hashed sender scope. For this same
paired sender only, production can set WAHA_SERVER_SCOPE_ORIGIN to the previous
origin while WAHA_SERVER_API_URL targets the replacement. The auth budget and
receipt service both use that stable scope, preserving quota and receipt matching.
Without the explicit setting, behavior remains based on the selected API URL.
Development ignores this hosted override, keeping the independently paired local
sender separate. Never reuse it to merge unrelated accounts, engines or sessions.
The field is a logical identity input, not a network destination. Tests cover both
scope continuity and actual requests reaching the new transport address.
