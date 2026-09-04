mod axis_test;
mod commands;
mod community;
mod drm_axes;
mod http;
mod icon;
mod mods;
mod plugins;
mod portability_audit;
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
            axis_test::run_launch_audit,
            portability_audit::run_portability_audit,
            plugins::list_plugins,
            plugins::open_plugin_window,
            mods::list_mods,
            mods::toggle_mod,
            mods::set_mod_order,
            mods::suggest_mod_dirs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
