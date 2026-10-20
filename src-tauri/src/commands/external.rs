use std::process::Command;

use crate::error::SkillsageError;

/// Opens an external web page in the user's default browser.
///
/// The WebView cannot do this itself: without a new-window handler and without
/// the opener plugin, a renderer-side `target="_blank"` is denied by the
/// runtime, so the anchor rendered as a dead button. Handing the URL to the OS
/// keeps the policy in one place — and that place is here, not the renderer, so
/// a compromised renderer cannot talk the backend into launching a `file:` URL
/// or a program.
///
/// Only `https` is accepted. The URLs this app opens are user-visible links to
/// skills.sh / GitHub; anything else (`http`, `javascript`, `file`, custom
/// schemes, embedded credentials) is refused rather than passed to a shell.
#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), SkillsageError> {
    let target = validated_external_url(&url)?;
    tokio::task::spawn_blocking(move || open_in_browser(&target))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

/// Validates and normalizes a URL that may be handed to the OS browser.
fn validated_external_url(url: &str) -> Result<String, SkillsageError> {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed.len() > 2048 {
        return Err(SkillsageError::InvalidStoreData("外部链接无效".into()));
    }
    let parsed = url::Url::parse(trimmed)
        .map_err(|_| SkillsageError::InvalidStoreData("外部链接无效".into()))?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(SkillsageError::InvalidStoreData(
            "只允许打开不带凭据的 https 链接".into(),
        ));
    }
    Ok(parsed.to_string())
}

fn open_in_browser(url: &str) -> Result<(), SkillsageError> {
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer.exe");
    #[cfg(target_os = "windows")]
    command.arg(url);

    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "macos")]
    command.arg(url);

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    #[cfg(all(unix, not(target_os = "macos")))]
    command.arg(url);

    // `spawn` rather than `output`: opening a browser is fire-and-forget, and a
    // browser process that stays alive must not block the app. The validated
    // URL is passed as a single argv entry, never through a shell.
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| SkillsageError::Io(format!("打开外部链接失败：{error}")))
}

#[cfg(test)]
mod tests {
    use super::validated_external_url;

    #[test]
    fn accepts_plain_https_urls() {
        assert_eq!(
            validated_external_url("https://www.skills.sh/owner/repo/skill").unwrap(),
            "https://www.skills.sh/owner/repo/skill"
        );
        assert!(validated_external_url("  https://github.com/aeroray/SkillSage  ").is_ok());
    }

    #[test]
    fn rejects_non_https_and_embedded_credentials() {
        // The renderer is not trusted to pick the scheme: `file:` would read
        // local files and `javascript:` would run in the browser context.
        assert!(validated_external_url("http://example.com").is_err());
        assert!(validated_external_url("file:///C:/Windows/System32/calc.exe").is_err());
        assert!(validated_external_url("javascript:alert(1)").is_err());
        assert!(validated_external_url("data:text/html,<script>alert(1)</script>").is_err());
        // Credentials in the URL would leak into the browser's address bar.
        assert!(validated_external_url("https://user:pass@example.com").is_err());
        assert!(validated_external_url("https://user@example.com").is_err());
        assert!(validated_external_url("").is_err());
        assert!(validated_external_url("not a url").is_err());
    }
}
