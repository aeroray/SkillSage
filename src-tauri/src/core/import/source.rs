use std::path::{Path, PathBuf};

use crate::core::limits::{MAX_LOCAL_SKILL_FILES, MAX_LOCAL_SKILL_TOTAL_BYTES};
use crate::error::SkillsageError;

#[derive(Debug, Clone)]
pub struct ResolvedSource {
    pub root: PathBuf,
    pub skill_md: PathBuf,
    pub kind: &'static str,
}

#[derive(Debug, Clone)]
pub struct SourceFile {
    pub relative_path: PathBuf,
    pub source_path: PathBuf,
}

pub fn resolve(path: &Path) -> Result<ResolvedSource, SkillsageError> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| SkillsageError::PathNotFound(path.to_path_buf()))?;
    if metadata.file_type().is_symlink() {
        return Err(SkillsageError::ImportFailed(
            "不支持符号链接或目录联接作为导入来源".into(),
        ));
    }
    if metadata.is_file() {
        if path.file_name().and_then(|name| name.to_str()) != Some("SKILL.md") {
            return Err(SkillsageError::ImportFailed(
                "单文件导入必须选择 SKILL.md".into(),
            ));
        }
        return Ok(ResolvedSource {
            root: path
                .parent()
                .ok_or_else(|| SkillsageError::ImportFailed("找不到技能目录".into()))?
                .to_path_buf(),
            skill_md: path.to_path_buf(),
            kind: "file",
        });
    }
    if !metadata.is_dir() {
        return Err(SkillsageError::ImportFailed(
            "导入来源不是文件或目录".into(),
        ));
    }

    let direct_skill_md = path.join("SKILL.md");
    if is_regular_file(&direct_skill_md)? {
        return Ok(ResolvedSource {
            root: path.to_path_buf(),
            skill_md: direct_skill_md,
            kind: "directory",
        });
    }

    let mut candidates = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let child = entry.path();
        if is_regular_dir(&child)? {
            let skill_md = child.join("SKILL.md");
            if is_regular_file(&skill_md)? {
                candidates.push((child, skill_md));
            }
        }
    }
    match candidates.len() {
        1 => {
            let (root, skill_md) = candidates.remove(0);
            Ok(ResolvedSource {
                root,
                skill_md,
                kind: "directory",
            })
        }
        0 => Err(SkillsageError::ImportFailed(
            "所选目录中没有 SKILL.md".into(),
        )),
        _ => Err(SkillsageError::ImportFailed(
            "所选目录包含多个技能，请选择一个技能目录".into(),
        )),
    }
}

pub fn collect_files(root: &Path) -> Result<Vec<SourceFile>, SkillsageError> {
    let mut files = Vec::new();
    let mut total_bytes = 0u64;
    collect_files_inner(root, root, &mut files, &mut total_bytes)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

pub fn validate_tree(root: &Path) -> Result<(), SkillsageError> {
    let mut ignored = Vec::new();
    let mut total_bytes = 0u64;
    collect_files_inner(root, root, &mut ignored, &mut total_bytes).map(|_| ())
}

pub fn collect_resolved_files(source: &ResolvedSource) -> Result<Vec<SourceFile>, SkillsageError> {
    if source.kind == "file" {
        let metadata = std::fs::symlink_metadata(&source.skill_md)?;
        ensure_file_budget(0, 0, metadata.len(), &source.skill_md)?;
        return Ok(vec![SourceFile {
            relative_path: PathBuf::from("SKILL.md"),
            source_path: source.skill_md.clone(),
        }]);
    }
    collect_files(&source.root)
}

fn collect_files_inner(
    root: &Path,
    current: &Path,
    files: &mut Vec<SourceFile>,
    total_bytes: &mut u64,
) -> Result<(), SkillsageError> {
    for entry in std::fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            return Err(SkillsageError::ImportFailed(format!(
                "导入内容包含不支持的符号链接: {}",
                path.display()
            )));
        }
        if metadata.is_dir() {
            collect_files_inner(root, &path, files, total_bytes)?;
        } else if metadata.is_file() {
            ensure_file_budget(files.len(), *total_bytes, metadata.len(), &path)?;
            *total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or_else(|| SkillsageError::ImportFailed("导入内容大小超过限制".into()))?;
            let relative_path = path
                .strip_prefix(root)
                .map_err(|error| SkillsageError::Io(error.to_string()))?
                .to_path_buf();
            files.push(SourceFile {
                relative_path,
                source_path: path,
            });
        }
    }
    Ok(())
}

fn ensure_file_budget(
    file_count: usize,
    total_bytes: u64,
    next_bytes: u64,
    path: &Path,
) -> Result<(), SkillsageError> {
    if file_count >= MAX_LOCAL_SKILL_FILES {
        return Err(SkillsageError::ImportFailed(format!(
            "技能目录包含超过 {MAX_LOCAL_SKILL_FILES} 个文件: {}",
            path.display()
        )));
    }
    if total_bytes.saturating_add(next_bytes) > MAX_LOCAL_SKILL_TOTAL_BYTES {
        return Err(SkillsageError::ImportFailed(format!(
            "技能目录内容超过 {} MiB: {}",
            MAX_LOCAL_SKILL_TOTAL_BYTES / 1024 / 1024,
            path.display()
        )));
    }
    Ok(())
}

/// Copy a validated local file while checking that it stays a normal file.
/// The second metadata check narrows the validation/copy race and prevents a
/// swapped symlink from being retained in the imported tree.
pub fn copy_regular_file(source: &Path, destination: &Path) -> Result<(), SkillsageError> {
    let before = std::fs::symlink_metadata(source)?;
    if before.file_type().is_symlink() || !before.is_file() {
        return Err(SkillsageError::ImportFailed(format!(
            "导入文件必须是普通文件: {}",
            source.display()
        )));
    }
    std::fs::copy(source, destination)?;
    let after = std::fs::symlink_metadata(source)?;
    if after.file_type().is_symlink() || !after.is_file() || after.len() != before.len() {
        let _ = std::fs::remove_file(destination);
        return Err(SkillsageError::ImportFailed(format!(
            "导入文件在复制期间发生变化: {}",
            source.display()
        )));
    }
    Ok(())
}

fn is_regular_file(path: &Path) -> Result<bool, SkillsageError> {
    Ok(std::fs::symlink_metadata(path)
        .map(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
        .unwrap_or(false))
}

fn is_regular_dir(path: &Path) -> Result<bool, SkillsageError> {
    Ok(std::fs::symlink_metadata(path)
        .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
        .unwrap_or(false))
}
