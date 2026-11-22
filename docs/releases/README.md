# Dearly versioned releases

`VERSION` is the project release version. Frontend/backend packages and lockfiles,
Expo's user-facing version and GitHub tag must agree. Native build numbers increase
independently. The current published baseline is 1.1.3 RC1, Android code 7 and
iOS build 7; see [current evidence and open gates](../follow-up-phases.md). Earlier
version/build records are historical, not values to reuse.

Use MAJOR for incompatible changes, MINOR for compatible features and PATCH for
compatible fixes. In the commands below, replace X.Y.Z and N with the actual
next version and candidate number; do not paste placeholders literally. To begin
the next release from the repository root:

```sh
node scripts/release.mjs prepare X.Y.Z
node scripts/release.mjs check
```

Review and commit the focused changes. Run checks, then build the APK locally with
`sh scripts/build-android-apk.sh`. Its profile explicitly embeds the public hosted
API origin; ignored `.env` files are not the release configuration mechanism.
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

## Existing automation versus planned orchestration

`.github/workflows/ci.yml` checks code, version consistency/deployment version
gating, isolated integrations, backup drills and platform exports.
`.github/workflows/release.yml` validates published asset hashes. Neither currently
orchestrates signed builds, Render rollout checks and publication end to end.
Phase 24 in [the follow-up plan](../follow-up-phases.md) owns that work. Version
selection must consult published history; native build numbers must increase for
every distributed binary. Never expose signing credentials to untrusted workflows.

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
