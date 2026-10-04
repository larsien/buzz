@echo off
rem Local Windows build. Run pnpm build first; sidecars are installed alongside the executable.
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set "PATH=C:\Users\larsi\.rustup\toolchains\1.95.0-x86_64-pc-windows-msvc\bin;%PATH%"
set "CARGO_HOME=C:\Users\larsi\.cargo"
set "CARGO_TARGET_DIR=C:\Users\larsi\Documents\Codex\Hermes\cache\scratch\e2e-trial\target-desktop"
set "BUZZ_BUILD_DEMO_SLUG="
set "BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY="
set "BUZZ_RELAY_URL=wss://desktop-ej9tpvh.tail5d264a.ts.net"
set "BUZZ_RELAY_HTTP=https://desktop-ej9tpvh.tail5d264a.ts.net"
cd /d C:\Users\larsi\orca\workspaces\buzz\workforce-run-on\desktop
node node_modules\@tauri-apps\cli\tauri.js build --debug --no-bundle --config workforce-local.json -- --offline --locked
