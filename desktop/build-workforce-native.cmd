@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set "PATH=C:\Users\larsi\.rustup\toolchains\1.95.0-x86_64-pc-windows-msvc\bin;%PATH%"
set "CARGO_HOME=C:\Users\larsi\.cargo"
set "CARGO_TARGET_DIR=C:\Users\larsi\Documents\Codex\Hermes\cache\scratch\e2e-trial\target-desktop"
set "BUZZ_BUILD_DEMO_SLUG=workforce-test-20261004"
set "BUZZ_RELAY_URL=ws://127.0.0.1:3190"
set "BUZZ_RELAY_HTTP=http://127.0.0.1:3190"
set "BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY=1"
cd /d C:\Users\larsi\orca\workspaces\buzz\workforce-run-on\desktop
node node_modules\@tauri-apps\cli\tauri.js build --debug --no-bundle --config workforce-native-test.json -- --offline --locked
