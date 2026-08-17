use std::path::Path;

use crate::error::SkillsageError;

use super::model::{ParsedSkill, SkillManifest};

pub fn parse_skill_md(content: &str) -> Result<ParsedSkill, SkillsageError> {
    let normalized = content.replace("\r\n", "\n");
    let mut lines = normalized.splitn(2, '\n');
    if lines.next() != Some("---") {
        return Err(SkillsageError::InvalidSkill(
            "缺少 YAML frontmatter 开始标记".to_string(),
        ));
    }

    let rest = lines.next().ok_or_else(|| {
        SkillsageError::InvalidSkill("SKILL.md 没有 frontmatter 内容".to_string())
    })?;
    let end = rest.find("\n---").ok_or_else(|| {
        SkillsageError::InvalidSkill("缺少 YAML frontmatter 结束标记".to_string())
    })?;
    let frontmatter = &rest[..end];
    let body = rest[end + "\n---".len()..]
        .trim_start_matches('\n')
        .to_string();
    let manifest: SkillManifest = serde_yaml::from_str(frontmatter)?;
    validate_manifest(&manifest)?;

    Ok(ParsedSkill { manifest, body })
}

pub fn read_skill_md(path: &Path) -> Result<ParsedSkill, SkillsageError> {
    if !path.is_file() {
        return Err(SkillsageError::PathNotFound(path.to_path_buf()));
    }
    let content = std::fs::read_to_string(path)?;
    parse_skill_md(&content)
}

fn validate_manifest(manifest: &SkillManifest) -> Result<(), SkillsageError> {
    if !is_kebab_case(&manifest.name) {
        return Err(SkillsageError::InvalidSkill(
            "name 必须是 kebab-case（例如 web-research）".to_string(),
        ));
    }
    if manifest.description.trim().is_empty() {
        return Err(SkillsageError::InvalidSkill(
            "description 不能为空".to_string(),
        ));
    }
    if manifest.description.chars().count() > 1024 {
        return Err(SkillsageError::InvalidSkill(
            "description 不能超过 1024 个字符".to_string(),
        ));
    }
    Ok(())
}

fn is_kebab_case(value: &str) -> bool {
    if value.is_empty() || value.starts_with('-') || value.ends_with('-') {
        return false;
    }

    let mut previous_was_separator = false;
    for character in value.chars() {
        if character == '-' {
            if previous_was_separator {
                return false;
            }
            previous_was_separator = true;
            continue;
        }
        if !character.is_ascii_lowercase() && !character.is_ascii_digit() {
            return false;
        }
        previous_was_separator = false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::parse_skill_md;

    #[test]
    fn parses_valid_skill_frontmatter() {
        let parsed = parse_skill_md(
            "---\nname: web-research\ndescription: Research the web.\nlicense: MIT\n---\n# Instructions\n",
        )
        .expect("valid skill should parse");

        assert_eq!(parsed.manifest.name, "web-research");
        assert_eq!(parsed.manifest.license.as_deref(), Some("MIT"));
        assert_eq!(parsed.body, "# Instructions\n");
    }

    #[test]
    fn rejects_invalid_skill_name() {
        let result = parse_skill_md("---\nname: Bad_Name\ndescription: test\n---\n");
        assert!(result.is_err());
    }

    #[test]
    fn rejects_missing_frontmatter() {
        let result = parse_skill_md("# no frontmatter");
        assert!(result.is_err());
    }
}
