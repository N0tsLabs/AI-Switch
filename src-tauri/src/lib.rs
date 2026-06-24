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
            // Key-level merge（仅动模型相关字段，保留其他 key）
            commands::config::extract_claude_env,
            commands::config::merge_claude_env,
            commands::config::extract_opencode_managed,
            commands::config::merge_opencode_managed,
            // 任意路径读写（开关）
            commands::config::merge_claude_extras,
            commands::config::merge_opencode_extras,
            // 测试服务商 URL
            commands::config::test_provider_url,
            commands::config::get_config_paths,
            commands::config::read_local_configs,
            commands::config::detect_api_keys,
            commands::config::read_file_content,
            commands::config::write_file_content,
            commands::config::open_url,
            // 模型
            commands::model::fetch_openai_models,
            // GitHub
            github::device_flow_start,
            github::device_flow_poll,
            github::get_github_user,
            github::github_logout,
            github::sync_upload,
            github::sync_download,
            github::sync_check_version,
            github::check_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
