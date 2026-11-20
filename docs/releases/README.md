# Dearly versioned releases

`VERSION` is the project release version. Frontend/backend packages and lockfiles,
Expo's user-facing version and GitHub tag must agree. Native build numbers increase
independently; the initial hosted candidate uses version 1.0.0, Android code 2 and
iOS build 2. The earlier local-only APK used code 1 and was never published.

Use MAJOR for incompatible changes, MINOR for compatible features and PATCH for
compatible fixes. To begin the next release from the repository root:

```sh
node scripts/release.mjs prepare 1.0.1
node scripts/release.mjs check
```

Review and commit the focused changes. Run checks, then build the APK locally with
`sh scripts/build-android-apk.sh`. Its profile explicitly embeds the public hosted
API origin; ignored `.env` files are not the release configuration mechanism.
Private local signing stays on this Mac. Do not upload the keystore, Firebase
server key, app passwords or backend environment to GitHub.

Package the exact committed source and verified APK:

```sh
node scripts/release.mjs package v1.0.0-rc.1 frontend/artifacts/Dearly-preview.apk
node scripts/release.mjs verify frontend/artifacts/releases/v1.0.0-rc.1
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
