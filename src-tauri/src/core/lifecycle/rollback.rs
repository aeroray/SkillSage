use crate::core::repo::{layout::RepoLayout, lockfile::SkillLockRecord};
use crate::core::store::models::SkillFile;
use crate::error::SkillsageError;

use super::update;

pub fn apply_at(
    layout: &RepoLayout,
    skill_id: &str,
    version: String,
    files: Vec<SkillFile>,
) -> Result<SkillLockRecord, SkillsageError> {
    update::apply_at(layout, skill_id, version, files)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::apply_at;
    use crate::core::lifecycle::{install::install_test_skill_at, update};
    use crate::core::repo::{layout::RepoLayout, lockfile};
    use crate::core::store::models::SkillFile;

    #[test]
    fn rollback_restores_a_previous_version_and_records_current_version() {
        let root = std::env::temp_dir().join(format!("skillsage-rollback-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");

        let version_two =
            "---\nname: skillsage-phase2-test\ndescription: Version two.\n---\n\n# Version two\n";
        let version_three = "---\nname: skillsage-phase2-test\ndescription: Version three.\n---\n\n# Version three\n";
        update::apply_at(
            &layout,
            "skillsage/skillsage-phase2-test",
            "commit-v2".to_string(),
            vec![SkillFile {
                path: "SKILL.md".to_string(),
                contents: version_two.to_string(),
            }],
        )
        .expect("version two should apply");
        let version_three_record = update::apply_at(
            &layout,
            "skillsage/skillsage-phase2-test",
            "commit-v3".to_string(),
            vec![SkillFile {
                path: "SKILL.md".to_string(),
                contents: version_three.to_string(),
            }],
        )
        .expect("version three should apply");
        let version_two_record = version_three_record
            .version_history
            .iter()
            .find(|entry| entry.commit == "commit-v2")
            .cloned()
            .expect("version two should be in history");
        let version_two_files =
            update::snapshot_files_at(&layout, &version_three_record, &version_two_record.hash)
                .expect("version two snapshot should be readable");

        let restored = apply_at(
            &layout,
            "skillsage/skillsage-phase2-test",
            "commit-v2".to_string(),
            version_two_files,
        )
        .expect("rollback should succeed");

        assert_eq!(restored.current_version, "commit-v2");
        assert!(restored
            .version_history
            .iter()
            .any(|entry| entry.commit == "commit-v3"));
        assert_eq!(
            fs::read_to_string(
                layout
                    .skill("skillsage-phase2-test")
                    .expect("skill path should resolve")
                    .join("SKILL.md")
            )
            .expect("skill file should be readable"),
            version_two
        );
        assert_eq!(
            lockfile::load(&layout)
                .expect("lock should load")
                .skills
                .get("skillsage/skillsage-phase2-test")
                .expect("skill should remain installed")
                .current_version,
            "commit-v2"
        );

        fs::remove_dir_all(root).expect("remove test root");
    }
}
