# Mobile authentication — Phase 5

Phone login, profile setup and session recovery use the Phase 4 API, extended in
Phase 13 with real WhatsApp OTP. The local backend now selects `AUTH_MODE=whatsapp`.
After requesting a code, the screen directs users to WhatsApp; real responses
contain no development code. Failed or uncertain requests never retry silently.
The explicit local simulation remains available for isolated development; it is
not phone-possession verification. No SMS OTP is configured.

## Try the flow

Start the backend on port 8080 and Expo on 8081, using the existing private env
files. The home screen opens sign-in with an explicit country picker and phone
field. Local development shows a clearly labeled test code when the server returns
`dispatch: simulated`; no code is put in the URL, logs or persisted storage.
Release builds and explicit production configuration reject simulated challenges.

Enter the six-digit code, then add your name and timezone on first login. The
phone is read-only. Optional email is an unverified delivery destination; phone
is the only login identity. Profile changes save through `PATCH /auth/me`.
Returning users can open Your profile from home and sign out there.

The resend delay and expiry come from the server response. Countdown display is
local and conservative; the server remains authoritative for expiry, attempts and
phone quotas. Resends replace the challenge/code. Duplicate taps are latched
before rendering disabled controls. Requests and verification do not retry
automatically. Wrong/expired/reused codes produce a safe recovery message.

## Session behavior

- Native credentials use Expo SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
  A single small JSON value atomically stores the token pair, expiry timestamps,
  API scope and refresh-intent flag. No profile, OTP or message content is persisted.
  No credentials are stored in AsyncStorage or public environment settings.
- Web uses memory only; browser reload loses the session. There is no localStorage
  bearer-token fallback. Production URL selection still requires the hosted HTTPS
  URL, which remains empty until deployment.
- Startup and foreground recovery gate the navigator until `GET /auth/me` verifies
  the saved session. Failed/offline recovery hides protected content and offers
  retry or local sign-out. It does not show a cached profile offline.
- Route guards remove profile access and signed-in navigation history on sign-out;
  login is available only while signed out. A missing first-login name redirects
  home to profile setup. Client guards complement server authorization; they do
  not replace ownership checks.
- Session/profile operations are serialized. Expiring access tokens refresh before
  a protected request; a 401 read may renew and retry once. Profile writes are never
  automatically repeated: after a 401 renewal, the user must save again.
- Refresh intent is securely persisted before dispatch. If renewal times out, fails,
  returns malformed tokens, or was interrupted by a process exit, the session is
  cleared and login is required. The app never replays an old refresh token after
  an uncertain rotation. This deliberately favors safe recovery over silent retries.
- Scope binding prevents using saved credentials against a changed API address.
  In-flight responses have an epoch guard and cannot restore a signed-out session.
- Sign-out hides protected content immediately and clears secure credentials before
  attempting server revocation. An expired access token may renew solely to revoke
  the session; that temporary pair is neither persisted nor published. Offline or
  unconfirmed server sign-out shows a warning; local credentials stay cleared.
- A native-storage clear failure blocks navigation and asks to retry sign-out;
  it does not claim that credential removal succeeded. Storage/transport errors
  never echo raw native errors, server messages, URLs or tokens.

Keychain data may survive iOS app uninstall/reinstall. The app always checks server
session validity rather than assuming reinstall implies logout. Android backup
exclusion is configured through the SecureStore plugin. Biometric gating is not
introduced; no biometric permission is requested.

See the version-matched [Expo SecureStore documentation](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)
and [Router protected routes](https://docs.expo.dev/router/advanced/protected/).

## Implementation map

| File/folder | Responsibility |
| --- | --- |
| `frontend/src/services/auth/contracts.js` | Safe response parsing, release simulation guard and resend deadline |
| `frontend/src/services/auth/authService.js` | OTP request/resend/verify transport |
| `frontend/src/services/auth/secureSessionStorage.js` | Native secure store and web memory adapter |
| `frontend/src/services/auth/sessionManager.js` | Serialized session state, refresh journal, scope binding and logout |
| `frontend/src/context/AuthContext.js` | React subscription and application lifecycle recovery |
| `frontend/src/hooks/useAsyncAction.js` | Duplicate-submit latch, cancellation and safe inline errors |
| `frontend/src/screens/auth/LoginScreen.js` | Country/phone, OTP, expiry, resend and error states |
| `frontend/src/screens/profile/ProfileScreen.js` | First-login setup, own profile and sign-out |
| `frontend/src/components/forms/CountryPicker.js` | Searchable country/calling-code selection |
| `frontend/src/app/_layout.js` | Recovery gate and Router guards |

The existing Paper themes/components, NativeWind pipeline and SDK 58 remain.
Keyboard-aware scrolling and field labels are retained. React Navigation imports
now use Expo Router's documented `expo-router/react-navigation` entry point.
Only compatible SecureStore plus phone metadata and English country-name data
were added. Country data is imported as JSON so it works when native Intl lacks
DisplayNames. These libraries are free/open source; no paid provider was added.

## Verification commands

From `frontend/`:

```bash
npm run check
npx expo install --check
npx expo-doctor
npm audit
npx expo export --platform all --output-dir dist --max-workers 2
```

The 34 standard tests include environment/API safety, single refresh across
concurrent calls, write non-replay, uncertain rotation, offline/expired/revoked
restoration, malformed storage, API scope changes, sign-out races and storage
failure. They do not send messages or connect to Neon.

For real API/PostgreSQL integration, first install/build the backend, then set
`AUTH_TEST_DATABASE_URL` privately for `npm run test:integration` in `frontend/`.
Do not expose the URL in terminal history or logs. This opt-in test requires
permission to create/drop a dedicated schema; it creates a random
`dearly_mobile_test_<uuid>` schema and qualifies every migration table. It starts
an ephemeral local HTTP server, exercises the actual mobile client/session manager
against Prisma/PostgreSQL, then removes only that schema. It verifies login,
wrong code, profile update, simulated restart, forced access expiry/refresh,
concurrent reads, logout and revoked-session recovery. It never sends messages.
A forced process termination may require cleanup of that exact test schema.

Native iPhone functional evidence and remaining device limits are recorded in the
[current project documentation](README.md). The user requested no preview
or design review; no screenshots, visual review, additional simulators, Android
launch, physical-device or VoiceOver audit is implied by these checks.
