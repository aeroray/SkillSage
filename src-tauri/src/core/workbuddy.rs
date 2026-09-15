use crate::core::distribution::{self, DistributionTarget};
use crate::core::repo::{layout::RepoLayout, lockfile::SkillLockRecord};
use crate::error::SkillsageError;

pub fn set_at(
    layout: &RepoLayout,
    skill_id: &str,
    distributed: bool,
) -> Result<SkillLockRecord, SkillsageError> {
    distribution::set_at(layout, skill_id, distributed, DistributionTarget::WorkBuddy)
}

pub fn is_distributed_at(
    layout: &RepoLayout,
    record: &SkillLockRecord,
) -> Result<bool, SkillsageError> {
    distribution::is_distributed_at(layout, record, DistributionTarget::WorkBuddy)
}

pub fn remove_link_at(
    layout: &RepoLayout,
    record: &SkillLockRecord,
) -> Result<bool, SkillsageError> {
    distribution::remove_link_at(layout, record, DistributionTarget::WorkBuddy)
}
