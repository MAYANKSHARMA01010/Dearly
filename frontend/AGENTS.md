This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

For frontend runtime changes, run `npm run check` (lint, typecheck and tests).
Documentation-only changes use link/path and whitespace checks.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.js` files define this JavaScript project's navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

The requested release artifact is a locally built, signed ARM64 APK. Follow
`../scripts/build-android-apk.sh` and `../docs/releases.md`; preserve private
signing identity and synchronize version/native build numbers with the root
release tool. Do not default to cloud builds, AAB, app-store submission or OTA
publication. Cloud build/submission is a separate requested scope.
Docs for EAS: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Attachment viewing

Use the shared `AttachmentViewer` for saved and pending image/video/audio previews;
keep playback controls out of the surrounding draft/message action list. Preserve
native video controls and accessible audio seeking. Viewer dismissal must unmount
players and clean temporary decrypted playback
files while retaining reusable encrypted downloads; it must retain a pending
upload's selection. Use only synthetic media for visual checks, and remove temporary test
routes before release. Do not add fake waveforms or unsupported encryption claims.

## Login preparation and phone permissions

Entry-screen preparation may perform read-only OTP status checks; never send a code
before the user presses Send code. Keep waiting abortable before submission and
never replay an uncertain OTP POST. Preserve explicit WhatsApp-first login.
Ask for microphone/notification access only at their feature action, explain the
reason with Not now, skip already granted access and honor canAskAgain=false with
Settings recovery. Login never requires device permissions. Use the native media
picker without broad Android media/storage grants; preserve the compatible iOS
video-export path that avoids a surprise original-asset permission request.

## UI and private storage

Follow the root Impeccable + Stitch requirement for every UI scope. Load project
context and the relevant Impeccable playbook, obtain a sanitized focused Stitch
proposal, reconcile both with native conventions, then verify rendered results.
Keep existing Paper tokens, NativeWind setup and accessible controls. Commit each
completed screen coherently before moving to the next requested screen.

Follow [cache architecture](../docs/architecture.md#android-cache-and-synchronization)
for SQLite, synchronization and reusable media. Retained ciphertext and temporary
playback files have different lifecycles. Define account/API scope, encryption,
expiry, logout purge, disk bounds and stale/revoked access before persisting data.
Never persist tokens in SQLite or queue/replay writes offline. Use SDK-matched
native documentation and rebuilt Android binaries for native verification.

SQLCipher snapshots under `services/cache/` require cipher_version before private
writes and a device-only SecureStore key. Serialize migrations/queries, check TTL
before reads and revoke leases synchronously on auth transitions. No plaintext
fallback, migration-error deletion workaround or cached auth approval. Web private
persistence stays disabled. Logout clears only Dearly's disposable cache/key.

Preserve read invalidation, forced refresh, bounded saved-copy windows and unsaved
settings. Discard appended pages when page one changes; stop timers on blur. Every
reusable media open authorizes online. Keep the seven-day/250 MiB LRU bounds,
encrypted index/files, temporary-player cleanup and explicit Settings clearing.

## Current platform scope

Android is the only requested testing and release target. Use Android exports,
the signed ARM64 APK and an authorized physical Android device for acceptance.
Do not launch iOS or require iOS/APNs checks during current work. Preserve existing
iOS source/configuration without claiming it tested. Shared lint/typechecks remain
required. Private progress/context records belong in ../.local-notes/, not public docs.
