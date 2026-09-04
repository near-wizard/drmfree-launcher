mod axis_test;
mod commands;
mod community;
mod drm_axes;
mod http;
mod icon;
mod plugins;
mod providers;
mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_games,
            commands::list_providers,
            commands::launch_game,
            commands::open_install_folder,
            providers::gog::get_gog_cover_art,
            providers::steam::get_steam_cover_art,
            icon::get_exe_icon,
            providers::steam::get_steam_wishlist,
            providers::steam::get_steam_price,
            store::search_store,
            store::list_store_sources,
            store::gog::find_gog_match,
            community::submit_drm_report,
            community::get_community_consensus,
            axis_test::structural_axes,
            axis_test::run_launch_smoke_test,
            plugins::list_plugins,
            plugins::open_plugin_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
