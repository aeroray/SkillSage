#[derive(Default)]
pub struct AppState {
    pub write_lock: tokio::sync::Mutex<()>,
}
