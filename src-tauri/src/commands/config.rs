use serde_json::Value;
use std::path::PathBuf;

/// 获取用户主目录
fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

/// Claude Code 配置目录
fn claude_dir() -> Option<PathBuf> {
    Some(home_dir()?.join(".claude"))
}

/// OpenCode 配置目录
fn opencode_dir() -> Option<PathBuf> {
    Some(home_dir()?.join(".config").join("opencode"))
}

/// 读取 JSON 文件
fn read_json(path: &PathBuf) -> Result<Value, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("读取失败: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("JSON 解析失败: {}", e))
}

/// 写入 JSON 文件
fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let content =
        serde_json::to_string_pretty(value).map_err(|e| format!("JSON 序列化失败: {}", e))?;
    std::fs::write(path, content).map_err(|e| format!("写入失败: {}", e))
}

// ============ Claude Code ============

#[tauri::command]
pub fn read_claude_settings() -> Result<Value, String> {
    let path = claude_dir()
        .ok_or("无法获取主目录")?
        .join("settings.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    read_json(&path)
}

#[tauri::command]
pub fn write_claude_settings(settings: Value) -> Result<(), String> {
    let path = claude_dir()
        .ok_or("无法获取主目录")?
        .join("settings.json");
    write_json(&path, &settings)
}

#[tauri::command]
pub fn read_claude_mcp() -> Result<Value, String> {
    let path = claude_dir()
        .ok_or("无法获取主目录")?
        .join(".mcp.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    read_json(&path)
}

#[tauri::command]
pub fn write_claude_mcp(settings: Value) -> Result<(), String> {
    let path = claude_dir()
        .ok_or("无法获取主目录")?
        .join(".mcp.json");
    write_json(&path, &settings)
}

// ============ OpenCode ============

#[tauri::command]
pub fn read_opencode_config() -> Result<Value, String> {
    let path = opencode_dir()
        .ok_or("无法获取主目录")?
        .join("opencode.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    read_json(&path)
}

#[tauri::command]
pub fn read_opencode_agents() -> Result<Value, String> {
    let path = opencode_dir()
        .ok_or("无法获取主目录")?
        .join("oh-my-openagent.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    read_json(&path)
}

#[tauri::command]
pub fn write_opencode_agents(settings: Value) -> Result<(), String> {
    let path = opencode_dir()
        .ok_or("无法获取主目录")?
        .join("oh-my-openagent.json");
    write_json(&path, &settings)
}

// ============ 读取本机配置（用于导入） ============

#[tauri::command]
pub fn read_local_configs() -> Result<Value, String> {
    let mut result = serde_json::json!({
        "claude": {
            "settings": Value::Null,
            "mcp": Value::Null,
        },
        "opencode": {
            "config": Value::Null,
            "agents": Value::Null,
        },
        "detected": {
            "claude": false,
            "opencode": false,
        }
    });

    // Claude Code
    let claude_settings_path = claude_dir().map(|d| d.join("settings.json"));
    let claude_mcp_path = claude_dir().map(|d| d.join(".mcp.json"));

    if let Some(path) = &claude_settings_path {
        if path.exists() {
            result["claude"]["settings"] = read_json(path)?;
            result["detected"]["claude"] = serde_json::json!(true);
        }
    }
    if let Some(path) = &claude_mcp_path {
        if path.exists() {
            result["claude"]["mcp"] = read_json(path)?;
        }
    }

    // OpenCode
    let opencode_config_path = opencode_dir().map(|d| d.join("opencode.json"));
    let opencode_agents_path = opencode_dir().map(|d| d.join("oh-my-openagent.json"));

    if let Some(path) = &opencode_config_path {
        if path.exists() {
            result["opencode"]["config"] = read_json(path)?;
            result["detected"]["opencode"] = serde_json::json!(true);
        }
    }
    if let Some(path) = &opencode_agents_path {
        if path.exists() {
            result["opencode"]["agents"] = read_json(path)?;
        }
    }

    Ok(result)
}

// ============ 环境变量检测 ============

/// 检测 OpenCode 相关的 API key 环境变量是否存在
#[tauri::command]
pub fn detect_api_keys() -> Result<Value, String> {
    Ok(serde_json::json!({
        "OPENAI_API_KEY": std::env::var("OPENAI_API_KEY").ok(),
        "ANTHROPIC_API_KEY": std::env::var("ANTHROPIC_API_KEY").ok(),
        "GOOGLE_API_KEY": std::env::var("GOOGLE_API_KEY").ok(),
        "GEMINI_API_KEY": std::env::var("GEMINI_API_KEY").ok(),
        "DEEPSEEK_API_KEY": std::env::var("DEEPSEEK_API_KEY").ok(),
        "OPENROUTER_API_KEY": std::env::var("OPENROUTER_API_KEY").ok(),
    }))
}

// ============ 路径查询 ============

#[tauri::command]
pub fn get_config_paths() -> Result<Value, String> {
    let home = home_dir().ok_or("无法获取主目录")?;
    Ok(serde_json::json!({
        "home": home.to_string_lossy(),
        "claude_settings": home.join(".claude").join("settings.json").to_string_lossy(),
        "claude_mcp": home.join(".claude").join(".mcp.json").to_string_lossy(),
        "opencode_config": home.join(".config").join("opencode").join("opencode.json").to_string_lossy(),
        "opencode_agents": home.join(".config").join("opencode").join("oh-my-openagent.json").to_string_lossy(),
    }))
}

// ============ 通用文件编辑器 ============

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))
}

#[tauri::command]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    std::fs::write(&path, &content).map_err(|e| format!("写入失败: {}", e))
}

// ============ 打开浏览器 ============

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("打开浏览器失败: {}", e))
}
