# Coordinated release pipeline — Phase 24

GitHub runs untrusted source checks on disposable hosted runners. Signing and
publication run only through the explicitly invoked local coordinator on the
owner's Mac. No self-hosted GitHub runner is installed, and no signing file,
database credential, provider credential or Render deploy hook is uploaded to
Actions. This avoids exposing a persistent signing host to public pull requests.
See [GitHub runner security](https://docs.github.com/en/actions/reference/security/secure-use).

## Prepare

`Propose release` runs on relevant main pushes or manual dispatch, with read-only
permissions. It proposes the next MAJOR.MINOR.PATCH and lists conventional commit
subjects since the latest reachable **published** release. `feat:` proposes MINOR;
other runtime changes propose PATCH; `type!:` or a `BREAKING CHANGE:` /
`BREAKING-CHANGE:` footer proposes MAJOR. Documentation-only changes propose none.
Workflow/tooling changes count as release engineering features when committed as
`feat`. It never mutates main or publishes automatically.

From the repository root, `node scripts/release/prepare.mjs` prints the proposal.
`node scripts/release/prepare.mjs --apply` invokes the existing version tool to
synchronize VERSION, both package manifests/lockfiles and Expo/native build
numbers. Review, make focused commits and push main. Do not reuse a published
version or native build number. No app release is required for later closeout docs.

## Run

Copy [the safe template](../scripts/release/.env.example) privately to
`backend/.runtime/release.env`, setting the hosted origin and the path to this
service's existing private Render deploy hook. Backend/.env supplies only the
selected database connection and independent read-only monitoring key to the
coordinator; they are never passed into the Android build. Local signing remains
in the existing private mobile signing files. Never print the hook or put it in
GitHub secrets merely to simplify release automation.

Run on the trusted Mac, from the exact clean tracked release source on main:

```sh
node scripts/release/pipeline.mjs run vX.Y.Z-rc.1
```

The coordinator requires matching remote main and synchronized versions. It:

1. Waits for successful **push** CI on that exact main SHA. PR/fork checks cannot
   unlock signing. CI includes code/integration, backup recovery and compatible
   code rollback drills. The Mac being offline leaves publication pending.
2. Compares every applied Prisma migration name/checksum/completion with the exact
   source. Unknown, modified, unfinished or pending migrations stop the release.
   Review/apply additive migrations separately through the established migration
   process, then resume; never apply unreviewed SQL or reset data automatically.
3. Builds the signed local ARM64 APK, packages its exact-source ZIP, manifest and
   checksums, validates native identity and verifies signer continuity against the
   previous published APK. No cloud build or AAB is substituted.
4. Calls the service-scoped Render hook once with the exact SHA. Render disables
   automatic deploys for an explicit hook ref. Future runtime pushes remain
   undeployed until the coordinator passes CI/build/migration gates. See
   [Render exact-commit behavior](https://render.com/docs/deploys#deploying-a-specific-commit).
5. Waits for protected hosted identity: exact SHA/version/migration-file digest,
   database readiness, running delivery worker, healthy queue and ready WAHA.
   It rechecks immediately before publication. It sends no OTP or provider message.
6. Creates an immutable-target RC draft with APK/source ZIP/release.json/SHA256SUMS,
   downloads and independently verifies it locally and through a source-pinned
   Linux GitHub draft-check workflow, publishes only after both pass, downloads public assets
   again, and waits for the separate release-verification workflow to pass.

The release verifier checks source ZIP entries, file contents, executable/symlink
attributes and source commit independently of ZIP compression, plus semantic/native
metadata, allowed filenames and all checksums to the checked-out release source.
Editing a manifest and regenerating checksums cannot legitimize another source.
Python 3 is required locally and is available on the GitHub hosted verifier.
Archives are bounded and checked without extraction, including duplicate/path and
size rejection. All published releases remain RC until separately recorded required device/push
acceptance is complete; the pipeline cannot promote an RC to stable.

## Failure and resumption

A private singleton lock prevents concurrent coordinators. The journal is at
`backend/.runtime/releases/TAG/state.json`; command logs are private sibling files,
not uploaded. Public output contains only stage names and safe outcomes. On any
failure later stages stop, retaining a partial rollout state. No automatic data
restore, WAHA reset or provider resend occurs. Logs may contain build-tool details;
keep the whole directory private.

Use `node scripts/release/pipeline.mjs resume TAG` only after inspecting the state.
It requires the same source, versions, remote main and migration history. Completed
stages are not replayed. An uncertain deployment POST is reconciled through hosted
identity, never blindly repeated. A crash around draft creation can require manual
reconciliation of that draft with the exact manifest; existing release assets are
never overwritten. A published RC is downloaded and verified, never replaced.
If the process was force-killed, inspect its PID/children before removing the
private lock. Do not delete a live process's lock. Timeouts bound subprocesses and
network requests; cold Render services can take minutes to become ready.

If deployment succeeded but publication failed, the journal reports that partial
state and resumption finishes artifact checks/publication. If public verification
fails, stop distribution and publish a new version after repair; do not overwrite
assets or hide the failure. GitHub failure notifications depend on account settings.

## Compatible application rollback

Prefer a reviewed forward fix. A code rollback must be compatible with the **current
schema** and preserve queues, quotas, provider uncertainty and private objects.
Never restore a stale database merely to roll back application code. An operator
may choose an existing known-good Render deployment after compatibility review;
keep automatic deploys off and inspect exact source/readiness. Old APKs are retained
as immutable RC assets; Android does not permit routine downgrade to a lower
versionCode, so distribute any mobile rollback as a new higher-numbered build.

CI executes `scripts/release/rollback-drill.mjs` with an explicit previous tag and a
loopback database. It creates an isolated random database, applies current
migrations, writes synthetic witness data, runs current → previous → current
APIs, verifies readiness/version and preserved data, and removes only that target.
No production rollback or backup restore is performed. Future breaking schema
changes require a different explicitly compatible rollback target or forward-only
recovery review; the drill must fail instead of masking incompatibility.

## Acceptance limits

Build/export evidence, provider readiness and real device acceptance are distinct.
Phone installation, notifications, media permissions, push arrival, native iOS and
full screen-reader operation require actual observations. Follow the dated
[phase checklist](follow-up-phases.md) for current results. Free Render/Actions
limits still apply; no paid runner/cron service, keepalive or provider test is added.
