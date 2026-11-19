# Local Android APK

The user requests an installable **APK**, built on this Mac, rather than an AAB.
`frontend/eas.json` sets preview distribution to internal, Android buildType to apk,
and credentialsSource to local. The preview Gradle command targets ARM64 Android
phones, including the user's iQOO Neo 9 Pro, to avoid compiling unused emulator
architectures. A different architecture requires its own explicit build profile. The Expo project is `@manku_dada/dearly`, Android
package `com.mayanksharma.dearly`. No cloud build or store submission is required.

From frontend/:

```sh
eas whoami
eas build:configure --platform android
# Use JDK 17 and the installed Android SDK/NDK.
eas build --platform android --profile preview --local
```

Run the equivalent checked helper from the repository root:

```sh
sh scripts/build-android-apk.sh
```

The output is `frontend/artifacts/Dearly-preview.apk`. Keep the generated local
signing keystore and `credentials.json` private and backed up so future APKs can
update this installation. They are excluded from Git and the source archive.
Never share the Firebase service-account key or signing password with the APK.
The Firebase `google-services.json` client configuration must be present for
prebuild; it belongs in the app, while its separate server credential does not.
Root and frontend `.easignore` rules explicitly include the client configuration
and exclude backend files, private environments, runtime artifacts and keys.

The source/native build is local. Expo is contacted to verify the linked project;
FCM credentials are separately stored on its push service by the user's request.
JDK 17 and Android SDK/NDK are local prerequisites. The SDK manager/Gradle may fetch
missing official build components. No Android emulator is started automatically.
Generated native folders remain in temporary build space, outside the repository.

The preview uses release API selection: the hosted backend URL must be remote
HTTPS. It intentionally remains empty until the user supplies hosting. A local
build is not a hosted backend; localhost on a phone refers to the phone. The APK
can be installed, but API sign-in and real push acceptance need that hosted URL
and a fresh build with it configured. The iOS/Metro development setup continues to
use the existing local backend URL. Do not expose the OTP API as a workaround.

Reference: [local EAS builds](https://docs.expo.dev/build-reference/local-builds/),
[APK profiles](https://docs.expo.dev/build-reference/apk/).


## Verified build — 19 November 2026

Local EAS CLI 27.10.0 completed an ARM64 release APK build. APK signature scheme
v2 verification passed; package identity is `com.mayanksharma.dearly`, version
1.0.0 (code 1), size 36,222,168 bytes. The archive and APK were checked for backend
credentials, the Firebase server key and private signing material; none was found.
The APK contains only its public Firebase Android client configuration. No AAB,
cloud build, emulator install or store upload was performed.

SHA-256 for this build:
`5c3adec58bc967b224686dc20967d8c844aa56dbe341479313f70845150118a6`.
Physical installation, backend connection and real push acceptance are separate
checks; they have not been claimed as passed.
