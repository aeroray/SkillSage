use std::path::PathBuf;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SkillsageError {
    #[error("网络请求失败，请检查网络连接或代理配置: {0}")]
    Network(String),
    #[error("GitHub 请求失败（HTTP {0}）")]
    GithubApi(u16),
    #[error("skills.sh 请求失败（HTTP {0}）")]
    StoreApi(u16),
    #[error("skills.sh 返回的数据无法识别: {0}")]
    InvalidStoreData(String),
    #[error("GitHub API 需要认证，请前往设置配置 GitHub Token")]
    GithubAuthMissing,
    #[error("GitHub Token 无效或已过期，请前往设置更新 Token")]
    GithubAuthInvalid,
    #[error("请求受到服务端限流，请稍后重试；GitHub 请求可前往设置配置 Token")]
    RateLimited,
    #[error("skills.sh 暂时不可达，请检查网络或代理配置后重试")]
    StoreUnavailable,
    #[error("GitHub 仓库不存在，或当前 Token 无权访问")]
    RepositoryNotFound,
    #[error("GitHub 地址无效: {0}")]
    InvalidGithubUrl(String),
    #[error("无效的 SKILL.md: {0}")]
    InvalidSkill(String),
    #[error("技能名称冲突: {0}")]
    NameConflict(String),
    #[error("设置保存失败: {0}")]
    Settings(String),
    #[error("本地导入失败: {0}")]
    ImportFailed(String),
    #[error("同步清单无效: {0}")]
    SyncInvalid(String),
    #[error("同步导出失败: {0}")]
    ExportFailed(String),
    #[error("存量迁移失败: {0}")]
    MigrateFailed(String),
    #[error("分发冲突: {0}")]
    DistributionConflict(String),
    #[error("技能已安装: {0}")]
    AlreadyInstalled(String),
    #[error("技能未安装: {0}")]
    NotInstalled(String),
    #[error("工具不存在: {0}")]
    UnknownTool(String),
    #[error("路径不存在: {0}")]
    PathNotFound(PathBuf),
    #[error("没有可用的用户目录")]
    HomeDirectoryUnavailable,
    #[error("文件系统操作失败: {0}")]
    Io(String),
    #[error("分发链接创建失败: {path}: {reason}")]
    LinkCreation { path: PathBuf, reason: String },
    #[error("分发链接删除失败: {path}: {reason}")]
    LinkRemoval { path: PathBuf, reason: String },
    #[error("后台任务失败: {0}")]
    Task(String),
    #[error("应用数据清理失败: {0}")]
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
            .contains("不可达"));
    }
}
