use std::path::PathBuf;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SkillsageError {
    #[error("网络请求失败: {0}")]
    Network(String),
    #[error("GitHub API 返回错误状态: {0}")]
    GithubApi(u16),
    #[error("skills.sh API error status: {0}")]
    StoreApi(u16),
    #[error("invalid skills.sh response: {0}")]
    InvalidStoreData(String),
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
