#!/bin/bash
# Seal the locally built app; retain the official sidecars' existing signatures.
set -euo pipefail
cd "$(dirname "$0")/.."
app="$PWD/.build/target-desktop/debug/bundle/macos/Buzz Workforce.app"
[[ -d "$app" && ! -L "$app" ]] || { echo 'Expected local app bundle' >&2; exit 1; }
codesign --force --sign - --entitlements desktop/src-tauri/Entitlements.plist "$app"
codesign --verify --deep --strict "$app"
