// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::compile_file,
            commands::resolve_run_target,
            commands::run_terminal_command,
            commands::resolve_default_projects_directory,
            commands::get_clang_format_status,
            commands::install_clang_format_managed,
            commands::format_document_with_clang,
            commands::start_discord_presence,
            commands::stop_discord_presence,
            commands::update_discord_presence
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}