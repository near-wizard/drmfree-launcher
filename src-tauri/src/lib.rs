mod axis_test;
mod commands;
mod community;
mod drm_axes;
mod http;
mod icon;
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
        .setup(|_app| {
            // A staging copy from a portability audit that never
            // reached its own cleanup (the app or the copied game's
            // process got killed mid-run) leaves a multi-gigabyte
            // orphan in the user's temp folder — swept here, once per
            // launch, on a background thread so a big scan/delete
            // never delays showing the window. See decision 0032.
            std::thread::spawn(portability_audit::sweep_stale_staging_dirs);
            Ok(())
        })
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
            portability_audit::get_install_size,
            portability_audit::run_portability_audit,
            plugins::list_plugins,
            plugins::open_plugin_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
