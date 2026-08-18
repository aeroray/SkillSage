use serde::{Deserialize, Serialize};

use crate::core::repo::layout::RepoLayout;
use crate::error::SkillsageError;

const KEYRING_SERVICE: &str = "com.skillsage.desktop";
const KEYRING_USER: &str = "github-token";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSettings {
    #[serde(default)]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct RuntimeSettings {
    pub proxy_url: Option<String>,
    pub github_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub proxy_url: Option<String>,
    pub github_token_configured: bool,
}

pub fn load_runtime(layout: &RepoLayout) -> Result<RuntimeSettings, SkillsageError> {
    let stored = load_stored(layout)?;
    let token = read_token()?;
    Ok(RuntimeSettings {
        proxy_url: stored.proxy_url,
        github_token: token,
    })
}

pub fn load_view(layout: &RepoLayout) -> Result<SettingsView, SkillsageError> {
    let stored = load_stored(layout)?;
    Ok(SettingsView {
        proxy_url: stored.proxy_url,
        github_token_configured: read_token()?.is_some(),
    })
}

pub fn save(
    layout: &RepoLayout,
    proxy_url: Option<String>,
    github_token: Option<String>,
    clear_github_token: bool,
) -> Result<SettingsView, SkillsageError> {
    let proxy_url = normalize_proxy(proxy_url)?;
    if let Some(token) = github_token {
        let token = token.trim();
        if !token.is_empty() {
            write_token(token)?;
        }
    }
    if clear_github_token {
        delete_token()?;
    }

    layout.ensure_roots()?;
    let stored = StoredSettings { proxy_url };
    let temporary_path = layout.settings_path().with_extension("json.tmp");
    let content = serde_json::to_string_pretty(&stored)?;
    std::fs::write(&temporary_path, format!("{content}\n"))?;
    if layout.settings_path().exists() {
        std::fs::remove_file(layout.settings_path())?;
    }
    std::fs::rename(temporary_path, layout.settings_path())?;
    load_view(layout)
}

pub fn normalize_proxy(proxy_url: Option<String>) -> Result<Option<String>, SkillsageError> {
    let Some(proxy_url) = proxy_url else {
        return Ok(None);
    };
    let proxy_url = proxy_url.trim().to_string();
    if proxy_url.is_empty() {
        return Ok(None);
    }
    reqwest::Proxy::all(&proxy_url)
        .map_err(|error| SkillsageError::Settings(format!("代理地址无效: {error}")))?;
    Ok(Some(proxy_url))
}

fn load_stored(layout: &RepoLayout) -> Result<StoredSettings, SkillsageError> {
    let path = layout.settings_path();
    if !path.exists() {
        return Ok(StoredSettings::default());
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

fn keyring_entry() -> Result<keyring::Entry, SkillsageError> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| SkillsageError::Settings(error.to_string()))
}

fn read_token() -> Result<Option<String>, SkillsageError> {
    match keyring_entry()?.get_password() {
        Ok(token) if !token.is_empty() => Ok(Some(token)),
        Ok(_) => Ok(None),
        Err(error) => match error {
            keyring::Error::NoEntry => Ok(None),
            other => Err(SkillsageError::Settings(other.to_string())),
        },
    }
}

fn write_token(token: &str) -> Result<(), SkillsageError> {
    keyring_entry()?
        .set_password(token)
        .map_err(|error| SkillsageError::Settings(error.to_string()))
}

fn delete_token() -> Result<(), SkillsageError> {
    match keyring_entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(SkillsageError::Settings(error.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_proxy;

    #[test]
    fn normalizes_empty_and_rejects_invalid_proxy_values() {
        assert_eq!(normalize_proxy(Some("  ".into())).unwrap(), None);
        assert_eq!(
            normalize_proxy(Some("http://127.0.0.1:8080".into())).unwrap(),
            Some("http://127.0.0.1:8080".into())
        );
        assert!(normalize_proxy(Some("not a url".into())).is_err());
    }
}
