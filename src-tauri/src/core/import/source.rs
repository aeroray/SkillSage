use std::path::{Path, PathBuf};

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
                .ok_or_else(|| SkillsageError::ImportFailed("无法确定技能目录".into()))?
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
            "所选目录及其一级子目录中都没有 SKILL.md".into(),
        )),
        _ => Err(SkillsageError::ImportFailed(
            "所选目录包含多个技能，请直接选择其中一个技能目录".into(),
        )),
    }
}

pub fn collect_files(root: &Path) -> Result<Vec<SourceFile>, SkillsageError> {
    let mut files = Vec::new();
    collect_files_inner(root, root, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

pub fn collect_resolved_files(source: &ResolvedSource) -> Result<Vec<SourceFile>, SkillsageError> {
    if source.kind == "file" {
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
            collect_files_inner(root, &path, files)?;
        } else if metadata.is_file() {
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
