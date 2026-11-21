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
`../scripts/build-android-apk.sh` and `../docs/releases/README.md`; preserve private
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

Phases 20–22 in `../docs/follow-up-phases.md` own SQLite, synchronization and
persistent media. Phase 22 deliberately separates retained encrypted downloads from temporary
playback files; follow `../docs/persistent-media.md`. Before retaining private content, define
account/backend namespacing, expiry checked before reads, encryption/key handling,
logout/account-change purge, bounded disk use and stale/revoked access handling.
Do not persist session tokens in SQLite or automatically replay writes offline.
Use SDK-matched Expo docs before adding native modules; verify with rebuilt native
apps, not Expo Go or browser checks alone.

Phase 20 now provides SQLCipher-backed SQLite snapshots under `services/cache/`.
Follow `../docs/mobile-cache.md`: require cipher_version before writing private
content, keep the random key in device-only SecureStore, serialize migrations and
queries, scope by account/API origin, check TTL before reads and revoke cache
leases synchronously on auth transitions. Server authentication remains required.
Web persistence is disabled. Never migrate private values into plaintext as a
fallback or delete a database to conceal a migration failure. Logout clears only
Dearly's disposable cache/key. Phase 21 now connects eligible screen reads,
invalidation, refresh
and bounded saved-copy presentation; follow `../docs/mobile-synchronization.md`.
Do not extend copy validity on failure or cache auth/schedule decisions. Keep
manual refresh authoritative, preserve unsaved settings, discard appended mailbox
pages when their first page changes, and stop timers on blur. Phase 22 adds encrypted media files/index, per-open online access, seven-day/250 MiB
LRU bounds and Settings cleanup. Preserve those boundaries.
