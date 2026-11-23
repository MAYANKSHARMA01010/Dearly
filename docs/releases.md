# Android builds and releases

`VERSION` is prepared source, not proof of deployment or a downloadable build.
Use [GitHub Releases](https://github.com/MAYANKSHARMA01010/Dearly/releases) for
published APKs and explicitly labeled release candidates. Android ARM64 APK is
the current distribution/acceptance target; AAB/store submission is not requested.
Shared iOS metadata stays consistent without implying iOS testing/distribution.

## Version and source rules

Use **MAJOR.MINOR.PATCH**: breaking changes increment MAJOR, compatible features
MINOR, compatible fixes PATCH. Version tooling synchronizes VERSION, both package
manifests/lockfiles and Expo metadata, and increments native build numbers. Never
reuse a published version/build number, overwrite published assets or move an old
tag. Iteration on an unpublished prepared version is allowed; regression is not.
Documentation-only changes need no version bump, APK build or deployment.

```sh
node scripts/release/prepare.mjs
node scripts/release/prepare.mjs --apply
node scripts/release.mjs check
```

The first command prints a proposal; `--apply` prepares it. To deliberately prepare
an agreed version instead, use `node scripts/release.mjs prepare X.Y.Z`. Replace
placeholders with real values, review and commit the focused changes. Do not
prepare the same version again if it is already prepared.

The main-only release-proposal workflow is read-only. Conventional `feat` changes
propose MINOR, other runtime changes PATCH, and breaking markers MAJOR. It never
publishes automatically. Main runtime changes also pass `check-deploy BASE_SHA`
against an explicit previous commit. A source commit alone is not a release.

## Build a local APK

Use the trusted Mac, Node 22, signed-in EAS CLI, JDK 17 and Android SDK/NDK.
Existing `frontend/credentials.json`, signing keystore and Firebase Android client
configuration must be available privately. Preserve signer identity so updates can
install over an existing app. The Firebase service-account key is server-only;
it must not enter the APK. Expo's public Android client configuration belongs in
the native build. No signing material goes to public Actions runners.

```sh
sh scripts/build-android-apk.sh
```

This calls EAS preview **locally**, producing
`frontend/artifacts/Dearly-preview.apk`. The helper reads frontend/.env only,
forces the production hosted-HTTPS target and the ARM64 profile. It does not launch
an emulator, deploy a backend, perform a cloud build or submit to a store. Expo
project authentication and official Android build downloads may require internet.
An APK built locally still needs a reachable hosted API for phone login.

For package inspection without orchestration, from the exact clean source:

```sh
node scripts/release.mjs package vX.Y.Z-rc.N frontend/artifacts/Dearly-preview.apk
node scripts/release.mjs verify frontend/artifacts/releases/vX.Y.Z-rc.N
```

Packaging verifies version/native identity, ARM64, signature and clean committed
source; it rejects tracked private files. Output is APK, exact-source ZIP,
release.json and SHA256SUMS. Ignored notes, environment/runtime files, dependencies,
server Firebase keys and keystores must never enter an archive. Run verification
from the matching source checkout/tag; later documentation commits have another
source identity. Do not reset a working checkout to perform verification.

## Coordinated release

The explicit trusted local coordinator is the preferred publish/deploy path. Set
only the release fields in private backend/.env, using the canonical template:
service ID and a **private file** containing the service-scoped Render deploy hook.
The selector derives shared API/DB/monitor settings; no separate release env file
is needed. Do not put deploy-hook values in arguments or GitHub secrets/logs.
Keep main/source fixed while a coordinator is active.

```sh
node scripts/release/pipeline.mjs run vX.Y.Z-rc.1
```

It requires clean main matching remote main and synchronized versions, then:

1. Waits for successful exact-SHA **main push CI**, including tests, disposable
   PostgreSQL integrations, backup/rollback drills, Android export and containers.
2. Checks applied Prisma migration names/checksums/completion against source.
   Pending/unknown/modified migrations stop release; review/apply separately.
3. Builds/signs locally, packages exact source, verifies native identity and signer
   continuity against the previous published APK.
4. Sends the exact-SHA Render deploy hook once. An explicit hook ref disables
   auto-deploy; ordinary pushes do not establish deployment completion.
5. Checks protected deployed SHA/version/migration digest, DB, worker, queue and
   WAHA readiness, including another check immediately before publication.
6. Creates an RC draft, checks downloaded assets locally and with the source-pinned
   Linux draft verifier, publishes only after both pass, then verifies fresh public
   downloads and the separate published-release workflow.

The source verifier checks paths, bounded sizes, duplicates, file bytes,
permissions/symlink attributes, exact source and metadata independently of ZIP
compression. Regenerating checksums cannot legitimize different source. Python 3
is required. The main-only manual draft verifier has narrowly scoped contents-write
permission to read drafts, no persisted checkout token and no signing/provider
secrets; published verification is read-only. No public self-hosted signing runner
is installed.

## Failures and resumption

Private journals/logs live under `backend/.runtime/releases/TAG/`; a singleton lock
prevents concurrent coordinators. Do not upload this directory. On failure later
stages stop, leaving partial rollout visible. Inspect state and reconcile any
uncertain deploy/draft creation before resuming:

```sh
node scripts/release/pipeline.mjs resume vX.Y.Z-rc.1
```

Resume requires the same source/version/remote main and migrations. Completed
stages are not replayed. Reconcile uncertain deploy POSTs through hosted identity,
not blind retries. A force-killed process's lock may be removed only after checking
its PID/children are no longer active. Published assets are never replaced to hide
a failed verification; stop distribution and issue a corrected new version.

Prefer a forward fix or an explicitly compatible old server image against the
current schema. Preserve queues, quotas, uncertainty and objects. Do not restore
stale data as code rollback. Android downgrades are not a routine update path;
a mobile rollback needs a new higher build number. Recovery is in
[operations](operations.md#encrypted-backup-and-restore).

## Android acceptance

Record exact APK/source/deployed identities separately from observed behavior.
Exports and fake transports do not prove installation, SQLCipher in a real binary,
phone permission handling, media playback, push arrival or notification routing.
A released RC stays a prerelease until its required Android acceptance is recorded;
the coordinator does not auto-promote stable. Live OTP/SMS/email/push tests need
specific recipient/count authorization; readiness gates send none.

A deployed user-facing runtime fix needs a matching signed APK and GitHub release
unless the user explicitly defers it. Later documentation-only commits require
focused documentation verification, not another app release.
