use std::path::{Path, PathBuf};

use crate::error::SkillsageError;

use super::link;

#[derive(Debug, Default)]
pub struct LinkTracker {
    created: Vec<PathBuf>,
}

impl LinkTracker {
    pub fn create(&mut self, source: &Path, target: PathBuf) -> Result<(), SkillsageError> {
        link::create_link(source, &target)?;
        self.created.push(target);
        Ok(())
    }

    pub fn rollback(&mut self) {
        for target in self.created.drain(..).rev() {
            let _ = link::remove_link(&target);
        }
    }

    pub fn into_paths(self) -> Vec<PathBuf> {
        self.created
    }
}
