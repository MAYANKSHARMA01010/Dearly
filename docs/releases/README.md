# Dearly versioned releases

`VERSION` is the project release version. Frontend/backend packages and lockfiles,
Expo's user-facing version and GitHub tag must agree. Native build numbers increase
independently. Consult GitHub Releases for the latest published APK; VERSION may
represent prepared source that has not been released. Never reuse a published
version or Android build number. Android is the current distribution/acceptance
scope. iOS build metadata stays synchronized for compatibility, without implying
iOS testing or distribution.

Use MAJOR for incompatible changes, MINOR for compatible features and PATCH for
compatible fixes. In the commands below, replace X.Y.Z and N with the actual
next version and candidate number; do not paste placeholders literally. To begin
the next release from the repository root:

```sh
node scripts/release.mjs prepare X.Y.Z
node scripts/release.mjs check
```

Review and commit the focused changes. Run checks, then build the APK locally with
`sh scripts/build-android-apk.sh`. The wrapper reads public configuration from
frontend/.env and forces the hosted production target. Backend secrets never
reach the mobile build.
Private local signing stays on this Mac. Do not upload the keystore, Firebase
server key, app passwords or backend environment to GitHub.

Package the exact committed source and verified APK:

```sh
node scripts/release.mjs package vX.Y.Z-rc.N frontend/artifacts/Dearly-preview.apk
node scripts/release.mjs verify frontend/artifacts/releases/vX.Y.Z-rc.N
```

Packaging checks native identity/version/ARM64 support and the APK signature with
Android build tools. It refuses tracked secrets, uncommitted release source and
version/tag mismatches. It writes an APK, source ZIP, release.json and SHA256SUMS
inside ignored `frontend/artifacts/releases/<tag>/`. The ZIP comes from the exact
Git commit; it contains source and safe examples, not private runtime files.
Candidate tags use `vX.Y.Z-rc.N`; accepted stable tags use `vX.Y.Z`. Do not replace
an existing tag or overwrite an old APK under a newer version label.

After inspecting the package, create/push the tag and publish the assets with the
GitHub CLI. Use a notes file and a draft for review, then publish. Candidate builds
remain GitHub prereleases while physical acceptance or provider checks are pending.
Published releases trigger `.github/workflows/release.yml`, which validates the
tag and downloads/rechecks the attached asset hashes. Ordinary CI checks version
consistency; signing keys are never installed in GitHub Actions. GitHub also
provides its normal source ZIP/TAR downloads for each tag.

An AAB is a store-upload bundle, not an installable APK. The current requested
phone download is the signed ARM64 APK; no app-store submission is performed.

## Automated verification and trusted release orchestration

GitHub CI checks backend/mobile source, disposable database integrations, recovery,
version consistency, Android exports and container definitions. The trusted local
coordinator builds/signs the APK, gates exact-source Render deployment and publishes
immutable release assets. See [the release pipeline](../release-pipeline.md).
No public-repository self-hosted signing runner is installed. Provider credentials
and signing material remain private; tests use fake transports.

Documentation-only updates require no app-version bump, build or release. A runtime
release needs the exact source commit, passed checks, matching verified APK,
observed deployment evidence and immutable GitHub assets. Record partial failures
and device acceptance separately. Use `scripts/release.mjs` rather than manually
editing version fields independently.


The strengthened verifier must run from the matching release-source checkout:
later main commits (even closeout docs) have a different source identity. Use a
separate checkout/worktree at the tag rather than resetting a working checkout.
The [coordinated pipeline](../release-pipeline.md) performs local and Linux draft
checks before publication, then verifies fresh public downloads. Its proposal is
a minimum compatible version; it never permits a prepared/published version to
move backwards. Do not prepare again when that version is already prepared.
