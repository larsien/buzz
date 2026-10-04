@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set "PATH=C:\Users\larsi\.rustup\toolchains\1.95.0-x86_64-pc-windows-msvc\bin;%PATH%"
set "CARGO_HOME=C:\Users\larsi\.cargo"
set "CARGO_TARGET_DIR=C:\Users\larsi\Documents\Codex\Hermes\cache\scratch\e2e-trial\target-desktop"
set "TAURI_CONFIG={"bundle":{"externalBin":[],"active":false}}"
cd /d C:\Users\larsi\orca\workspaces\buzz\workforce-run-on
rustfmt --edition 2021 --check desktop/src-tauri/src/commands/workforce.rs || exit /b 1
cargo test --manifest-path desktop/src-tauri/Cargo.toml --locked --lib commands::workforce::tests > desktop\workforce-native-test.log 2>&1 || exit /b 1
cargo clippy --manifest-path desktop/src-tauri/Cargo.toml --locked --lib > desktop\workforce-native-clippy.log 2>&1
