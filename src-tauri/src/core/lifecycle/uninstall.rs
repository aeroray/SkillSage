use crate::core::repo::layout::RepoLayout;
use crate::error::SkillsageError;

pub fn uninstall(skill_id: &str) -> Result<(), SkillsageError> {
    let layout = RepoLayout::from_user_home()?;
    super::install::uninstall_skill_at(&layout, skill_id)
}
