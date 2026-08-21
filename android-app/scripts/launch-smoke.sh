#!/usr/bin/env bash
set -euo pipefail

readonly APP_ID="com.elementeracoast.app"
readonly ACTIVITY="${APP_ID}/.MainActivity"
readonly APK_PATH="android-app/app/build/outputs/apk/debug/app-debug.apk"

dump_diagnostics() {
  local exit_status=$?
  if (( exit_status != 0 )); then
    echo "Android shell launch diagnostics"
    adb shell dumpsys activity activities | grep -E -B 4 -A 12 "${APP_ID}|mResumedActivity|topResumedActivity" || true
    adb logcat -d -v threadtime | grep -E -B 20 -A 100 "FATAL EXCEPTION|Process: ${APP_ID}|${APP_ID}" || true
  fi
  exit "${exit_status}"
}
trap dump_diagnostics EXIT

./android-app/gradlew -p android-app assembleDebug --stacktrace
adb install -r "${APK_PATH}"
adb logcat -c
adb shell am force-stop "${APP_ID}"
adb shell am start -W -n "${ACTIVITY}"
sleep 10

app_pid="$(adb shell pidof "${APP_ID}" || true)"
if [[ -z "${app_pid}" ]]; then
  echo "Application process exited during the launch window."
  exit 1
fi

activity_dump="$(adb shell dumpsys activity activities)"
if ! grep -Fq "${ACTIVITY}" <<< "${activity_dump}"; then
  echo "MainActivity is not present after launch."
  exit 1
fi

fatal_log="$(adb logcat -d -v brief AndroidRuntime:E '*:S' || true)"
if grep -Fq "FATAL EXCEPTION" <<< "${fatal_log}"; then
  echo "${fatal_log}"
  exit 1
fi

adb shell uiautomator dump /sdcard/coastgpt-a4-home.xml >/dev/null
home_dump="$(adb shell cat /sdcard/coastgpt-a4-home.xml)"
for expected_home_copy in 'CoastGPT' '主聊天' '海岸日报'; do
  if ! grep -Fq "${expected_home_copy}" <<< "${home_dump}"; then
    echo "A4 local home is missing expected copy: ${expected_home_copy}"
    exit 1
  fi
done

echo "Android shell remained alive with the A4 local home visible (pid ${app_pid})."
