//! Opens the operator's Workforce console in an isolated Buzz window.
//! The console keeps its own authentication and receives no native IPC permissions.
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const CONSOLE_ORIGIN: &str = "http://127.0.0.1:4600";

fn is_console_url(url: &url::Url) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(4600)
        && url.username().is_empty()
        && url.password().is_none()
}

/// Show the existing Workforce console without importing employee keys or duplicating schedules.
#[tauri::command]
pub async fn open_workforce_console(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Open Workforce from the main Buzz window.".into());
    }
    let url = format!("{CONSOLE_ORIGIN}/schedules")
        .parse()
        .map_err(|e| format!("Workforce 주소 오류: {e}"))?;
    if let Some(existing) = app.get_webview_window("workforce-console") {
        // A failed first load stays blank after the loopback tunnel reconnects.
        existing.navigate(url).map_err(|e| e.to_string())?;
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "workforce-console", WebviewUrl::External(url))
        .title("Buzz · Workforce")
        .inner_size(1280.0, 850.0)
        .min_inner_size(760.0, 560.0)
        .on_navigation(is_console_url)
        .build()
        .map_err(|e| format!("Workforce 창을 열지 못했습니다: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn console_navigation_stays_on_the_configured_loopback_origin() {
        for path in [
            "/",
            "/schedules",
            "/workflow?project=miju-post",
            "/projects",
        ] {
            assert!(is_console_url(
                &format!("{CONSOLE_ORIGIN}{path}").parse().unwrap()
            ));
        }
        for address in [
            "https://evil.example",
            "http://127.0.0.1:3000/",
            "http://localhost:4600/",
            "http://127.0.0.1.evil.example:4600/",
            "http://user@127.0.0.1:4600/",
            "file:///C:/Users/test/key",
            "javascript:alert(1)",
        ] {
            assert!(!is_console_url(&address.parse().unwrap()), "{address}");
        }
    }
}
