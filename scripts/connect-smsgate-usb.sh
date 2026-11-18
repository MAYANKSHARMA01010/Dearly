#!/bin/sh
set -eu
task_adb=$(command -v adb || true)
if [ -z "$task_adb" ]; then task_adb="$HOME/Library/Android/sdk/platform-tools/adb"; fi
if [ ! -x "$task_adb" ]; then echo 'Android platform tools are unavailable.' >&2; exit 1; fi
task_devices=$("$task_adb" devices | awk '$2 == "device" && $1 !~ /^emulator-/ { print $1 }')
task_count=$(printf '%s\n' "$task_devices" | awk 'NF { n++ } END { print n+0 }')
if [ "$task_count" -ne 1 ]; then echo 'Connect and authorize exactly one physical Android phone. No emulator is needed.' >&2; exit 1; fi
task_serial=$task_devices
if ! "$task_adb" forward --list | awk -v serial="$task_serial" '$1 == serial && $2 == "tcp:3102" && $3 == "tcp:8080" { found=1 } END { exit !found }'; then
  "$task_adb" -s "$task_serial" forward --no-rebind tcp:3102 tcp:8080 >/dev/null
fi
task_listener=$(lsof -nP -iTCP:3102 -sTCP:LISTEN 2>/dev/null || true)
case "$task_listener" in
  *"*:3102"*|*"0.0.0.0:3102"*) "$task_adb" -s "$task_serial" forward --remove tcp:3102; echo 'Stopped non-private phone forwarding.' >&2; exit 1 ;;
  *"127.0.0.1:3102"*|*"[::1]:3102"*) ;;
  *) echo 'Could not verify loopback phone forwarding.' >&2; exit 1 ;;
esac
if ! "$task_adb" -s "$task_serial" reverse --list | awk '$2 == "tcp:3103" && $3 == "tcp:8080" { found=1 } END { exit !found }'; then
  "$task_adb" -s "$task_serial" reverse --no-rebind tcp:3103 tcp:8080 >/dev/null
fi
echo 'Private SMSGate USB links prepared: Mac 3102 to phone; phone 3103 to backend. No SMS submitted.'
