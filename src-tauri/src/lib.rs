mod commands;
mod providers;
mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_games,
            commands::list_providers,
            commands::launch_game,
            store::search_store
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
