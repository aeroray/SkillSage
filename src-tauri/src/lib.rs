mod commands;
mod core;
mod error;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::distribution::check_distribution_conflicts,
            commands::install::install_test_skill,
            commands::install::install_skill,
            commands::import::preview_local_import,
            commands::import::import_local,
            commands::migrate::scan_migrate,
            commands::migrate::execute_migrate,
            commands::manage::list_installed,
            commands::manage::refresh_installed,
            commands::manage::check_updates,
            commands::manage::update_skill,
            commands::manage::rollback_skill,
            commands::manage::adjust_distribution,
            commands::manage::distribute_skills,
            commands::manage::uninstall_skill,
            commands::store::get_leaderboard,
            commands::store::get_skill_detail,
            commands::store::search_skills,
            commands::tools::detect_tools,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::sync::export_package,
            commands::sync::preview_import_package,
            commands::sync::import_package,
            commands::url_install::inspect_github_url,
            commands::url_install::url_install,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
