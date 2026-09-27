#![allow(linker_messages)]

mod commands;
mod core;
mod error;
mod state;

use std::fs::{self, OpenOptions};

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::conflict::check_install_conflict,
            commands::files::open_path,
            commands::files::open_skill_directory,
            commands::install::install_skill,
            commands::import::preview_local_import,
            commands::import::import_local,
            commands::migrate::scan_migrate,
            commands::migrate::execute_migrate,
            commands::migrate::remove_adopt_candidate,
            commands::migrate::rename_adopt_candidate,
            commands::manage::refresh_installed,
            commands::manage::search_local_skill_matches,
            commands::manage::link_local_skill,
            commands::manage::check_updates,
            commands::manage::update_skill,
            commands::manage::uninstall_skill,
            commands::manage::set_tool_distribution,
            commands::store::get_leaderboard,
            commands::store::get_skill_detail,
            commands::store::search_skills,
            commands::store::translate_skill_description,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::settings::get_skill_translations,
            commands::settings::save_skill_translation,
            commands::settings::list_tools,
            commands::settings::set_tool_override,
            commands::sync::export_package,
            commands::sync::preview_import_package,
            commands::sync::import_package,
            commands::url_install::inspect_github_url,
            commands::url_install::url_install,
        ])
        .setup(|app| {
            let log_dir = app.path().app_log_dir()?;
            fs::create_dir_all(&log_dir)?;
            let trace_path = log_dir.join("skillsage-trace.log");
            let trace_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(trace_path)?;
            let subscriber = tracing_subscriber::fmt()
                .with_ansi(false)
                .with_writer(trace_file)
                .with_max_level(tracing::Level::INFO)
                .finish();
            let _ = tracing::subscriber::set_global_default(subscriber);
            tracing::info!("SkillSage logging initialized");

            // Clean up temp trees left behind by a previous run. Cleanup on the
            // error paths is best-effort, so a crash or a failed early return
            // can leave partial directories under the private tmp root.
            match core::repo::layout::RepoLayout::from_user_home()
                .and_then(|layout| core::repo::atomic::sweep_temp_dirs(&layout))
            {
                Ok(removed) if removed > 0 => {
                    tracing::info!(removed, "已清理上次运行遗留的临时目录")
                }
                Ok(_) => {}
                Err(error) => tracing::warn!(error = %error, "清理临时目录失败"),
            }

            // Remove links left in directories that turned out never to be real
            // (the old `.workbuddy-ai/skills`). A link there pointed at a
            // directory no tool reads, which is why an uninstalled tool could
            // still appear as a valid distribution target.
            if let Ok(layout) = core::repo::layout::RepoLayout::from_user_home() {
                if let Some(home) = dirs::home_dir() {
                    match core::distribution::clean_legacy_links(&layout, &home) {
                        Ok(removed) if removed > 0 => {
                            tracing::info!(removed, "已清理旧版工具目录中的残留链接")
                        }
                        Ok(_) => {}
                        Err(error) => tracing::warn!(error = %error, "清理旧版工具链接失败"),
                    }
                }
                // Bring stored distribution state in line with the new
                // registry, including a lock file upgraded from the old
                // two-boolean format.
                if let Ok(resolver) = commands::manage::tool_resolver(&layout) {
                    if let Err(error) = core::distribution::refresh_all(&layout, &resolver) {
                        tracing::warn!(error = %error, "刷新分发状态失败");
                    }
                }
            }

            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .targets([tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir {
                            file_name: Some("skillsage.log".into()),
                        },
                    )])
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
