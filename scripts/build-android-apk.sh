#!/bin/sh
set -eu
DEARLY_PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../frontend" && pwd)
cd "$DEARLY_PROJECT_DIR"
command -v eas >/dev/null 2>&1 || { echo 'Install eas-cli and sign in to your Expo account first.' >&2; exit 1; }
[ -f credentials.json ] && [ -f google-services.json ] || { echo 'Private Android signing and Firebase client configuration are required.' >&2; exit 1; }
if [ -z "${JAVA_HOME:-}" ]; then
  JAVA_HOME=$(/usr/libexec/java_home -v 17)
  export JAVA_HOME
fi
ANDROID_HOME=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}
ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-"$ANDROID_HOME"}
export ANDROID_HOME ANDROID_SDK_ROOT
mkdir -p artifacts
umask 077
EAS_NO_VCS=1 exec node ../scripts/environment.mjs run frontend-release -- eas build --platform android --profile preview --local --non-interactive --output "$DEARLY_PROJECT_DIR/artifacts/Dearly-preview.apk"
