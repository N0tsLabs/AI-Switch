mod commands;
mod github;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // 配置读写
            commands::config::read_claude_settings,
            commands::config::write_claude_settings,
            commands::config::read_claude_mcp,
            commands::config::write_claude_mcp,
            commands::config::read_opencode_config,
            commands::config::read_opencode_agents,
            commands::config::write_opencode_agents,
            commands::config::get_config_paths,
            commands::config::read_local_configs,
            commands::config::detect_api_keys,
            commands::config::read_file_content,
            commands::config::write_file_content,
            // 模型
            commands::model::fetch_openai_models,
            // GitHub
            github::device_flow_start,
            github::device_flow_poll,
            github::get_github_user,
            github::github_logout,
            github::sync_upload,
            github::sync_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
