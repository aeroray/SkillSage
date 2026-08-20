use std::path::PathBuf;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SkillsageError {
    #[error("网络请求失败，请检查网络或代理：{0}")]
    Network(String),
    #[error("GitHub 请求失败（HTTP {0}）")]
    GithubApi(u16),
    #[error("skills.sh 请求失败（HTTP {0}）")]
    StoreApi(u16),
    #[error("skills.sh 返回的数据无法识别：{0}")]
    InvalidStoreData(String),
    #[error("远程响应过大，已停止处理：{0}")]
    ResponseTooLarge(String),
    #[error("GitHub API 需要 Token，请在设置中配置")]
    GithubAuthMissing,
    #[error("GitHub Token 无效或已过期，请在设置中更新")]
    GithubAuthInvalid,
    #[error("请求过于频繁，请稍后重试；GitHub 请求可在设置中配置 Token")]
    RateLimited,
    #[error("暂时无法连接 skills.sh，请检查网络或代理后重试")]
    StoreUnavailable,
    #[error("GitHub 仓库不存在，或当前 Token 无权访问")]
    RepositoryNotFound,
    #[error("GitHub 地址无效：{0}")]
    InvalidGithubUrl(String),
    #[error("SKILL.md 无效：{0}")]
    InvalidSkill(String),
    #[error("技能名称已存在：{0}")]
    NameConflict(String),
    #[error("保存设置失败：{0}")]
    Settings(String),
    #[error("导入失败：{0}")]
    ImportFailed(String),
    #[error("同步数据文件无效：{0}")]
    SyncInvalid(String),
    #[error("导出失败：{0}")]
    ExportFailed(String),
    #[error("安装目标路径已被占用：{0}")]
    InstallConflict(String),
    #[error("技能已安装：{0}")]
    AlreadyInstalled(String),
    #[error("技能未安装：{0}")]
    NotInstalled(String),
    #[error("路径不存在：{0}")]
    PathNotFound(PathBuf),
    #[error("没有可用的用户目录")]
    HomeDirectoryUnavailable,
    #[error("文件操作失败：{0}")]
    Io(String),
    #[error("后台任务失败：{0}")]
    Task(String),
    #[error("清理应用数据失败：{0}")]
    CleanupFailed(String),
}

impl Serialize for SkillsageError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for SkillsageError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<serde_json::Error> for SkillsageError {
    fn from(value: serde_json::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<serde_yaml::Error> for SkillsageError {
    fn from(value: serde_yaml::Error) -> Self {
        Self::InvalidSkill(value.to_string())
    }
}

impl From<reqwest::Error> for SkillsageError {
    fn from(value: reqwest::Error) -> Self {
        Self::Network(value.to_string())
    }
}

impl SkillsageError {
    pub fn github_status(status: u16, has_token: bool) -> Self {
        match status {
            401 if !has_token => Self::GithubAuthMissing,
            401 => Self::GithubAuthInvalid,
            403 | 429 => Self::RateLimited,
            404 => Self::RepositoryNotFound,
            _ => Self::GithubApi(status),
        }
    }

    pub fn store_status(status: u16) -> Self {
        match status {
            429 => Self::RateLimited,
            500..=599 => Self::StoreUnavailable,
            _ => Self::StoreApi(status),
        }
    }

    pub fn store_network(error: reqwest::Error) -> Self {
        if error.is_connect() || error.is_timeout() {
            Self::StoreUnavailable
        } else {
            Self::Network(error.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SkillsageError;

    #[test]
    fn classifies_github_auth_rate_limit_and_not_found() {
        assert!(matches!(
            SkillsageError::github_status(401, false),
            SkillsageError::GithubAuthMissing
        ));
        assert!(matches!(
            SkillsageError::github_status(401, true),
            SkillsageError::GithubAuthInvalid
        ));
        assert!(matches!(
            SkillsageError::github_status(403, true),
            SkillsageError::RateLimited
        ));
        assert!(matches!(
            SkillsageError::github_status(404, true),
            SkillsageError::RepositoryNotFound
        ));
    }

    #[test]
    fn classifies_store_availability() {
        assert!(matches!(
            SkillsageError::store_status(429),
            SkillsageError::RateLimited
        ));
        assert!(matches!(
            SkillsageError::store_status(503),
            SkillsageError::StoreUnavailable
        ));
        assert!(SkillsageError::StoreUnavailable
            .to_string()
            .contains("无法连接"));
    }
}
