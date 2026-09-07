use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::core::repo::{atomic, layout::RepoLayout};
use crate::error::SkillsageError;

const KEYRING_SERVICE: &str = "com.skillsage.desktop";
const KEYRING_USER: &str = "github-token";
const MAX_TRANSLATED_DESCRIPTIONS: usize = 1000;
const MAX_TRANSLATED_DESCRIPTION_CHARS: usize = 16_000;
const MAX_TRANSLATION_KEY_CHARS: usize = 512;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSettings {
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub translated_descriptions: BTreeMap<String, String>,
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
    layout.ensure_roots()?;
    let stored = load_stored(layout)?;
    let token = read_token()?;
    Ok(RuntimeSettings {
        proxy_url: normalize_proxy(stored.proxy_url)?,
        github_token: token,
    })
}

pub fn load_view(layout: &RepoLayout) -> Result<SettingsView, SkillsageError> {
    layout.ensure_roots()?;
    let stored = load_stored(layout)?;
    Ok(SettingsView {
        proxy_url: normalize_proxy(stored.proxy_url)?,
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
    layout.ensure_roots()?;
    let previous_token = read_token()?;
    let previous_file = read_settings_file(layout)?;
    let desired_token = if clear_github_token {
        None
    } else {
        github_token
            .as_deref()
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| previous_token.clone())
    };
    let mut stored = load_stored(layout)?;
    stored.proxy_url = proxy_url;
    write_stored(layout, &stored)?;
    if let Err(error) = set_token(desired_token.as_deref()) {
        let restore_file = restore_settings_file(layout, previous_file);
        let restore_token = set_token(previous_token.as_deref());
        let recovery = restore_file.err().or(restore_token.err());
        return Err(with_recovery(error, recovery));
    }
    load_view(layout)
}

pub fn load_translations(layout: &RepoLayout) -> Result<BTreeMap<String, String>, SkillsageError> {
    layout.ensure_roots()?;
    let stored = load_stored(layout)?;
    validate_translations(&stored.translated_descriptions)?;
    Ok(stored.translated_descriptions)
}

pub fn save_translation(
    layout: &RepoLayout,
    skill_id: String,
    translated_description: String,
) -> Result<(), SkillsageError> {
    let skill_id = normalize_translation_key(skill_id)?;
    let translated_description = normalize_translation_value(translated_description)?;
    layout.ensure_roots()?;
    let mut stored = load_stored(layout)?;
    validate_translations(&stored.translated_descriptions)?;
    if !stored.translated_descriptions.contains_key(&skill_id)
        && stored.translated_descriptions.len() >= MAX_TRANSLATED_DESCRIPTIONS
    {
        return Err(SkillsageError::Settings(
            "技能说明翻译缓存已达到上限".into(),
        ));
    }
    stored
        .translated_descriptions
        .insert(skill_id, translated_description);
    write_stored(layout, &stored)
}

pub fn merge_translations(
    layout: &RepoLayout,
    translations: &BTreeMap<String, String>,
) -> Result<usize, SkillsageError> {
    validate_translations(translations)?;
    if translations.is_empty() {
        return Ok(0);
    }
    layout.ensure_roots()?;
    let mut stored = load_stored(layout)?;
    validate_translations(&stored.translated_descriptions)?;
    let new_count = translations
        .keys()
        .filter(|key| !stored.translated_descriptions.contains_key(*key))
        .count();
    if stored.translated_descriptions.len() + new_count > MAX_TRANSLATED_DESCRIPTIONS {
        return Err(SkillsageError::Settings(
            "同步后的技能说明翻译缓存超过上限".into(),
        ));
    }
    let mut changed = 0;
    for (skill_id, translated_description) in translations {
        if stored
            .translated_descriptions
            .get(skill_id)
            .is_some_and(|current| current == translated_description)
        {
            continue;
        }
        stored
            .translated_descriptions
            .insert(skill_id.clone(), translated_description.clone());
        changed += 1;
    }
    if changed > 0 {
        write_stored(layout, &stored)?;
    }
    Ok(changed)
}

pub fn validate_translations(
    translations: &BTreeMap<String, String>,
) -> Result<(), SkillsageError> {
    if translations.len() > MAX_TRANSLATED_DESCRIPTIONS {
        return Err(SkillsageError::Settings("技能说明翻译缓存条目过多".into()));
    }
    for (skill_id, translated_description) in translations {
        normalize_translation_key(skill_id.clone())?;
        normalize_translation_value(translated_description.clone())?;
    }
    Ok(())
}

fn normalize_translation_key(skill_id: String) -> Result<String, SkillsageError> {
    let skill_id = skill_id.trim().to_string();
    if skill_id.is_empty()
        || skill_id.chars().count() > MAX_TRANSLATION_KEY_CHARS
        || !skill_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "/_-.".contains(character))
    {
        return Err(SkillsageError::Settings("技能标识无效".into()));
    }
    Ok(skill_id)
}

fn normalize_translation_value(value: String) -> Result<String, SkillsageError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.chars().count() > MAX_TRANSLATED_DESCRIPTION_CHARS {
        return Err(SkillsageError::Settings("技能说明译文无效".into()));
    }
    Ok(value)
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
    match std::fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(StoredSettings::default());
        }
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SkillsageError::Settings(
                "设置文件不能是符号链接".to_string(),
            ));
        }
        Err(error) => return Err(error.into()),
        Ok(_) => {}
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

fn read_settings_file(layout: &RepoLayout) -> Result<Option<Vec<u8>>, SkillsageError> {
    match std::fs::symlink_metadata(layout.settings_path()) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(SkillsageError::Settings(
            "设置文件不能是符号链接".to_string(),
        )),
        Ok(metadata) if !metadata.is_file() => {
            Err(SkillsageError::Settings("设置路径不是普通文件".to_string()))
        }
        Ok(_) => Ok(Some(std::fs::read(layout.settings_path())?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn write_stored(layout: &RepoLayout, stored: &StoredSettings) -> Result<(), SkillsageError> {
    let temporary_path = layout.settings_path().with_extension("json.tmp");
    match std::fs::symlink_metadata(&temporary_path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SkillsageError::Settings(
                "设置文件临时路径不能是符号链接".to_string(),
            ))
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err(SkillsageError::Settings(
                "设置文件临时路径不是普通文件".to_string(),
            ))
        }
        Ok(_) => std::fs::remove_file(&temporary_path)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    let content = serde_json::to_string_pretty(stored)?;
    std::fs::write(&temporary_path, format!("{content}\n"))?;
    atomic::replace_file(&temporary_path, &layout.settings_path())
}

fn restore_settings_file(
    layout: &RepoLayout,
    previous: Option<Vec<u8>>,
) -> Result<(), SkillsageError> {
    match previous {
        Some(content) => {
            let temporary_path = layout.settings_path().with_extension("json.restore.tmp");
            std::fs::write(&temporary_path, content)?;
            atomic::replace_file(&temporary_path, &layout.settings_path())
        }
        None => remove_settings_file(layout),
    }
}

fn remove_settings_file(layout: &RepoLayout) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(layout.settings_path()) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SkillsageError::Settings(
                "设置文件不能是符号链接".to_string(),
            ));
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err(SkillsageError::Settings("设置路径不是普通文件".to_string()));
        }
        Ok(_) => std::fs::remove_file(layout.settings_path())?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
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

fn set_token(token: Option<&str>) -> Result<(), SkillsageError> {
    match token {
        Some(token) => write_token(token),
        None => delete_token(),
    }
}

fn with_recovery(primary: SkillsageError, recovery: Option<SkillsageError>) -> SkillsageError {
    match recovery {
        Some(recovery) => SkillsageError::Settings(format!("{primary}; 恢复失败: {recovery}")),
        None => primary,
    }
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
    use std::fs;

    use super::{load_translations, normalize_proxy, save_translation};
    use crate::core::repo::layout::RepoLayout;

    #[test]
    fn normalizes_empty_and_rejects_invalid_proxy_values() {
        assert_eq!(normalize_proxy(Some("  ".into())).unwrap(), None);
        assert_eq!(
            normalize_proxy(Some("http://127.0.0.1:8080".into())).unwrap(),
            Some("http://127.0.0.1:8080".into())
        );
        assert!(normalize_proxy(Some("not a url".into())).is_err());
    }

    #[test]
    fn persists_translations_in_settings_file() {
        let root = std::env::temp_dir().join(format!(
            "skillsage-settings-translations-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));

        save_translation(
            &layout,
            "local/local-research".into(),
            "用于整理本地研究资料。".into(),
        )
        .expect("translation should be saved");
        let translations = load_translations(&layout).expect("translations should load");
        assert_eq!(
            translations.get("local/local-research"),
            Some(&"用于整理本地研究资料。".to_string())
        );

        fs::remove_dir_all(root).expect("remove settings test root");
    }
}
