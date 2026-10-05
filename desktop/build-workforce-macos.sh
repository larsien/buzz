#!/bin/bash
# Build on the Mac, preserving the installed signed app until validation completes.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# The repository pins these through Hermit; activate it for all repository commands.
source bin/activate-hermit
export CARGO_BUILD_JOBS=2
export CARGO_INCREMENTAL=0
export CARGO_PROFILE_DEV_DEBUG=0
export CARGO_PROFILE_TEST_DEBUG=0
export CARGO_TARGET_DIR="$PWD/.build/target-desktop"
export BUZZ_RELAY_URL="wss://desktop-ej9tpvh.tail5d264a.ts.net"
export BUZZ_RELAY_HTTP="https://desktop-ej9tpvh.tail5d264a.ts.net"
unset BUZZ_BUILD_DEMO_SLUG BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY BUZZ_PRIVATE_KEY BUZZ_AUTH_TAG
target=$(rustc -vV | sed -n 's/^host: //p')
[[ "$target" == aarch64-apple-darwin ]] || { echo 'Expected the inspected Apple Silicon Mac' >&2; exit 1; }
mkdir -p desktop/src-tauri/binaries
for name in buzz buzz-acp buzz-agent buzz-backend-kubernetes buzz-dev-mcp git-credential-nostr; do
  original="/Applications/Buzz.app/Contents/MacOS/$name"
  [[ -s "$original" && -x "$original" ]] || { echo "Missing installed sidecar: $name" >&2; exit 1; }
  cp "$original" "desktop/src-tauri/binaries/$name-$target"
done
# Same upstream version's signed sidecars are retained. The patched ACP that
# handles remote Workforce employees is already installed on the Windows host.
cd desktop
pnpm install --frozen-lockfile
pnpm typecheck > workforce-macos-typecheck.log 2>&1
pnpm test > workforce-macos-frontend-tests.log 2>&1
pnpm build > workforce-macos-frontend-build.log 2>&1
pnpm exec tauri build --debug --bundles app --config workforce-macos.json -- --locked > workforce-macos-native-build.log 2>&1
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib commands::workforce::tests > workforce-macos-native-test.log 2>&1
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --lib > workforce-macos-clippy.log 2>&1
