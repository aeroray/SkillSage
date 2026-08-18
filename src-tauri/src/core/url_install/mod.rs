pub mod parser;
pub mod resolver;

pub use parser::GitHubUrlResult;
pub use resolver::{resolve_detail, resolve_skills, UrlSkillCandidate};
