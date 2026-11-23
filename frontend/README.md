# Dearly mobile app

Expo SDK 58, JavaScript, Expo Router, NativeWind v4, and React Native Paper (MD3).
Android is the current APK distribution and acceptance target. The app provides
WhatsApp phone login, verified email linking, private drafts, manual recipients,
media previews, scheduling, mailboxes, preferences and Android push registration.
Encrypted snapshots and reusable media require the project's native build;
Expo Go is not the acceptance target. See [current documentation](../docs/README.md).

## Run locally

Use Node.js 22.16+ (Node 22) and npm. From the repository root:

```bash
cd frontend
npm ci
npm start
```

Keep an existing `.env`. On a new checkout, copy `.env.example` to `.env` first.
Start the backend separately from its own directory with `npm run dev`; it uses
port `8080`. Expo normally uses `8081`. Restart Expo after installing dependencies,
changing app configuration, or editing public environment values; `npm run start:clear`
clears the bundler cache if needed.

```bash
npm run android
```

Expo Go can run the bundled modules used here. App-specific native configuration
such as the `dearly` URL scheme takes effect in a development/standalone build;
Expo Go uses its own `exp://` URL. Do not generate native folders just to edit UI.

## Routes and development

Routes live in src/app; implementation lives in src/screens. Inspect the current
route files instead of relying on a historical screen list. Use manual recipient
entry; no address-book import/search or contacts permission is implemented.
Run npm run check for shared lint, types and tests. CI exports Android only;
standalone iOS/APNs are outside current scope.

## Structure and styling

| Location | Responsibility |
| --- | --- |
| `index.js` | Load global CSS, then register Expo Router |
| `src/app/_layout.js` | Safe Area/Paper/navigation providers, Stack, status bar |
| `src/app/` route files | Thin wrappers importing feature screens |
| `src/screens/home/` | Home and service-status screen UI |
| `src/theme/index.js` | Existing MD3 light/dark colors, platform fonts, spacing, sizing |
| `src/components/layout/Screen.js` | Insets, scrolling, keyboard behavior, centered content up to 600 dp |
| `src/components/common/` | Shared 48 dp minimum button and loading/error/empty-state presentation |
| `src/components/forms/AppTextField.js` | Labeled Paper field and accessible error text for future forms |
| `src/config/api.js` | Local/hosted URL selection and validation |
| `src/api/client.js` | Fetch, deadline/cancellation, envelope validation, safe typed errors |
| `src/services/attachments/` | Attachment contracts, idempotent reservation recovery and native/web file transports |
| `src/components/media/` | Pickers, transfer progress, recorder and media/document previews |
| `src/services/drafts/` | Draft contracts, authenticated API and account-scoped in-memory editor models |
| `src/context/DraftWorkspaceContext.js` | Scope binding and private workspace lifecycle |
| `src/screens/messages/` | Draft list and composer |
| `src/components/recipients/` | Manual recipient entry, normalization and review |
| `src/services/health.js` | Server/storage checks and partial-failure reporting |
| `src/hooks/useServiceHealth.js` | Screen state, retry, cancellation on replacement/unmount |
| `tests/api.test.mjs` | API/configuration/health behavior tests using Node's runner |

Paper's existing Material 3 palette and system fonts are retained. `roundness` is
12, touch targets are at least 48 dp, and shared spacing is 4/8/16/24/32/48 dp.
Navigation and Paper colors agree in light/dark mode. Text follows system scaling;
scrollable screens keep controls reachable at large text sizes. Automatic content
insets prevent content from sitting beneath translucent native headers.

NativeWind remains v4 with the original Babel, Metro, Tailwind, and `global.css`
configuration. Layout utilities remain in use alongside semantic Paper theme colors.
The prior `App.js` was replaced by Router's root layout so there is one app root.
`src/navigation/` is reserved; do not add another navigation container.

## API environments

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_SERVER_API_URL=
EXPO_PUBLIC_APP_ENV=development
```

Development uses the local URL. Explicit production mode and every release build
require a remote HTTPS hosted URL; a release never silently falls back to localhost,
even when the app environment label still says development. The hosted URL is
intentionally empty until deployment. Missing configuration is handled in the UI,
not by crashing the home screen. Public API URLs must never contain credentials,
query secrets, or the PostgreSQL connection string.

`localhost` is relative to the running device:

- iOS Simulator on this Mac can use `http://localhost:8080`.
- For the standard Android emulator, use `http://10.0.2.2:8080` in the private env,
  or use `adb reverse tcp:8080 tcp:8080` to preserve the localhost setting. When
  Metro also uses localhost, reverse its port too (usually `8081`).
- A physical device over Wi-Fi needs the computer's LAN IP and a backend explicitly
  bound to `0.0.0.0`; the device/computer must be able to reach each other. The current
  development OTP mode blocks non-loopback binds, so disable auth for health-only
  LAN testing; public login requires real OTP delivery first.
- Web development must use an origin allowed by the backend CORS configuration;
  the default frontend origin is `http://localhost:8081`.

The client has a 10-second request deadline and supports caller cancellation.
`ApiError.kind` distinguishes configuration, network, timeout, aborted, HTTP and
invalid-response failures. HTTP status, allowlisted auth codes and bounded retry
metadata are retained without showing raw server errors. OTP/write operations do
not retry automatically; session recovery can renew and retry one protected read. Phase 5 implements mobile login, secure native storage, serialized refresh and own
profile integration. Browser sessions use memory only. See [mobile auth](../docs/mobile-auth.md).

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run check
npx expo install --check
npx expo-doctor
npx expo export --platform all --output-dir dist
```

Strict checking covers all application JS using JSDoc and Expo's TypeScript base.
Bundler module resolution selects React Native's declaration exports instead of
its Flow source. `maxNodeModuleJsDepth: 0` prevents jsconfig's implicit vendor-JS
checking; dependency declarations are still used. `environment.d.ts` declares
NativeWind's CSS side-effect import. No application type errors are suppressed.
ESLint uses the SDK-compatible Expo flat config; ESLint 9 is retained to satisfy
its React plugin's peer range. Tests exercise production URL isolation, safe errors,
timeouts/cancellation, response parsing, no automatic retries, and health recovery.
The 70 standard tests neither connect to Neon nor send messages. The separate
opt-in `npm run test:integration` requires a built backend and private
`AUTH_TEST_DATABASE_URL`; it exercises the real client/auth/draft/schedule APIs in temporary
PostgreSQL schemas. See [mobile auth verification](../docs/mobile-auth.md#verification-commands).

Narrow minimatch overrides for Expo Fingerprint and TypeScript ESLint use a patched
range for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
without changing SDK versions. Revalidate the overrides when updating those tools.
Platform exports verify bundling, not app-store signing or hardware behavior;
native verification evidence/limits are recorded in the phase plan.

See [environment setup](../docs/environment-setup.md),
[project structure](../docs/project-structure.md), and
[current project documentation](../docs/README.md).

## Scheduling

Save a draft, then choose **Schedule this draft**. Review the server-resolved time,
message and recipients before confirming. **Your schedules** supports edits,
rescheduling, cancellation and returning canceled plans to drafts. The app labels
delivery-service availability and per-message dispatch/delivery states;
SMS/WhatsApp/email choices remain unavailable. Existing paused plans require a new
review to activate delivery. Phase 11 adds the mailbox/dashboard/detail UI, with an explicit opened choice. See [schedule rules and API](../docs/scheduling.md).

## Dashboard and mailboxes

The signed-in home now loads counts for Created, Scheduled, Sent, Received, Drafts
and Needs attention. Mailboxes support state/opened filters, refresh and bounded
pagination. Details show private media and evidence-based outcomes; recipients
choose whether to mark a delivered message opened. Viewing alone does not do so.
Owned history pages show actual recorded activity and preserve the dispatch edit/
cancel boundary. Focus-scoped reads clear private state and ignore late results.
See [mailboxes and tracking](../docs/mailboxes.md).
