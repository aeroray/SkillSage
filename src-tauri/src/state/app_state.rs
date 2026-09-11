use std::collections::HashMap;

use crate::core::lifecycle::match_local::LocalSkillMatch;
use crate::core::store::models::SkillSearchResult;

#[derive(Default)]
pub struct AppState {
    pub write_lock: tokio::sync::Mutex<()>,
    pub local_match_cache: tokio::sync::Mutex<HashMap<String, Vec<LocalSkillMatch>>>,
    pub local_match_search_cache: tokio::sync::Mutex<HashMap<String, Vec<SkillSearchResult>>>,
}
