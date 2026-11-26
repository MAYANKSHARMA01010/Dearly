# Dearly Android app

Dearly is a digital time capsule app for capturing memories, feelings and wishes
and scheduling them for your future self or chosen people. The mobile experience
covers capsule creation, attachments, review, scheduling and access to due content.
Existing route/screen names use drafts, schedules and mailboxes for these features.

Expo SDK 58, React Native, Expo Router, NativeWind v4 and React Native Paper.
Feature screens live in `src/screens/`; `src/app/` owns routes and protected layouts.
`index.js` loads global CSS and Router, with providers in `src/app/_layout.js`.

From the repository root:

```sh
npm ci --prefix frontend
npm run android --prefix frontend
```

Create private frontend/.env from its single safe template first. It contains
public app/build configuration only. Hosted API is preferred even in development;
local testing requires an explicit override and a reachable LAN/USB address.
Backend secrets never belong in the app. SQLCipher/push acceptance requires a
native Android build, not Expo Go.

- [Setup](../docs/setup.md): configuration, startup and checks.
- [Architecture/security](../docs/architecture.md): sessions, permissions, recipient access and encrypted caching.
- [API guide](../docs/api.md): feature workflows and response/error rules.
- [Releases](../docs/releases.md): locally signed ARM64 APK and semantic versions.

`npm run check --prefix frontend` runs lint, JavaScript/JSDoc typechecking and tests.
Native media, permission and push checks need observations on Android separately
from source tests. iOS source remains compatible where implemented, but is outside
current testing/distribution scope. Keep phase history and AI notes out of this file.
