use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::Instant;

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

// ============ Key-level merge (only touch model-related keys) ============

/// 读取 settings.json，返回其中的 `env` 字段（缺失或非对象时返回空对象）
#[tauri::command]
pub fn extract_claude_env() -> Result<Value, String> {
    let path = claude_dir()
        .ok_or("无法获取主目录")?
        .join("settings.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let full = read_json(&path)?;
    let env = full.get("env").cloned().unwrap_or_else(|| serde_json::json!({}));
    Ok(env)
}

/// 把传入的 env 合并进 settings.json 的 env 字段：
/// - 仅按 key 逐个插入/覆盖，**保留** settings.json 中其他顶层字段
/// - 传入值为空字符串时，删除该 key
/// - 整体为空对象时，移除 settings.json 的 env 字段
#[tauri::command]
pub fn merge_claude_env(env: Value) -> Result<(), String> {
    let path = claude_dir()
        .ok_or("无法获取主目录")?
        .join("settings.json");

    let mut root = if path.exists() {
        read_json(&path)?
    } else {
        serde_json::json!({})
    };
    let root_obj = root
        .as_object_mut()
        .ok_or_else(|| "settings.json 顶层不是对象，无法合并".to_string())?;

    let incoming = env
        .as_object()
        .ok_or_else(|| "传入的 env 不是对象".to_string())?;

    // 提取（或新建）env 对象
    let env_obj = root_obj
        .entry("env".to_string())
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| "settings.json 的 env 不是对象".to_string())?;

    for (k, v) in incoming {
        if v.is_string() && v.as_str().map(|s| s.is_empty()).unwrap_or(false) {
            env_obj.remove(k);
        } else {
            env_obj.insert(k.clone(), v.clone());
        }
    }

    // 若 env 已被清空，从根对象移除
    if env_obj.is_empty() {
        root_obj.remove("env");
    }

    write_json(&path, &root)
}

/// 读取 oh-my-openagent.json，返回其中的 `agents` 和 `categories` 字段
#[tauri::command]
pub fn extract_opencode_managed() -> Result<Value, String> {
    let path = opencode_dir()
        .ok_or("无法获取主目录")?
        .join("oh-my-openagent.json");
    if !path.exists() {
        return Ok(serde_json::json!({ "agents": null, "categories": null }));
    }
    let full = read_json(&path)?;
    Ok(serde_json::json!({
        "agents": full.get("agents").cloned().unwrap_or(Value::Null),
        "categories": full.get("categories").cloned().unwrap_or(Value::Null),
    }))
}

/// 把传入的 `{ agents, categories }` 按顶层字段合并进 oh-my-openagent.json
/// 保留其他顶层字段（如插件、provider 等）
#[tauri::command]
pub fn merge_opencode_managed(payload: Value) -> Result<(), String> {
    let path = opencode_dir()
        .ok_or("无法获取主目录")?
        .join("oh-my-openagent.json");

    let mut root = if path.exists() {
        read_json(&path)?
    } else {
        serde_json::json!({})
    };
    let root_obj = root
        .as_object_mut()
        .ok_or_else(|| "oh-my-openagent.json 顶层不是对象，无法合并".to_string())?;

    let incoming = payload
        .as_object()
        .ok_or_else(|| "传入的 payload 不是对象".to_string())?;

    for key in ["agents", "categories"] {
        if let Some(v) = incoming.get(key) {
            if v.is_null() {
                root_obj.remove(key);
            } else {
                root_obj.insert(key.to_string(), v.clone());
            }
        }
    }

    write_json(&path, &root)
}

// ============ Claude Code 任意路径读写（用于 4 个开关） ============

/// 单个键操作：`path` 是 JSON 路径（如 ["permissions", "defaultMode"]），
/// `value = None` 表示删除该路径，`Some(_)` 表示写入（自动创建中间对象）
#[derive(Deserialize)]
pub struct ExtraOp {
    pub path: Vec<String>,
    #[serde(default)]
    pub value: Option<Value>,
}

fn set_at_path(root: &mut Value, path: &[String], value: Value) {
    if path.is_empty() {
        return;
    }
    let mut current = root;
    for (i, key) in path.iter().enumerate() {
        let obj = match current.as_object_mut() {
            Some(o) => o,
            None => return,
        };
        if i == path.len() - 1 {
            obj.insert(key.clone(), value.clone());
            return;
        } else {
            let need_init = !obj.contains_key(key) || !obj[key].is_object();
            if need_init {
                obj.insert(key.clone(), serde_json::json!({}));
            }
            match obj.get_mut(key) {
                Some(v) => current = v,
                None => return,
            }
        }
    }
}

fn remove_at_path(root: &mut Value, path: &[String]) {
    if path.is_empty() {
        return;
    }
    if path.len() == 1 {
        if let Some(obj) = root.as_object_mut() {
            obj.remove(&path[0]);
        }
        return;
    }
    let mut current = root;
    for key in &path[..path.len() - 1] {
        match current.as_object_mut().and_then(|o| o.get_mut(key)) {
            Some(v) if v.is_object() => current = v,
            _ => return,
        }
    }
    if let Some(obj) = current.as_object_mut() {
        obj.remove(&path[path.len() - 1]);
    }
}

/// 批量应用任意路径操作到 settings.json（Claude Code）
#[tauri::command]
pub fn merge_claude_extras(ops: Vec<ExtraOp>) -> Result<(), String> {
    let path = claude_dir()
        .ok_or("无法获取主目录")?
        .join("settings.json");

    let mut root = if path.exists() {
        read_json(&path)?
    } else {
        serde_json::json!({})
    };

    for op in ops {
        if op.path.is_empty() {
            continue;
        }
        match op.value {
            None => remove_at_path(&mut root, &op.path),
            Some(v) => set_at_path(&mut root, &op.path, v),
        }
    }

    write_json(&path, &root)
}

/// 批量应用任意路径操作到 oh-my-openagent.json（OpenCode）
#[tauri::command]
pub fn merge_opencode_extras(ops: Vec<ExtraOp>) -> Result<(), String> {
    let path = opencode_dir()
        .ok_or("无法获取主目录")?
        .join("oh-my-openagent.json");

    let mut root = if path.exists() {
        read_json(&path)?
    } else {
        serde_json::json!({})
    };

    for op in ops {
        if op.path.is_empty() {
            continue;
        }
        match op.value {
            None => remove_at_path(&mut root, &op.path),
            Some(v) => set_at_path(&mut root, &op.path, v),
        }
    }

    write_json(&path, &root)
}

// ============ 测试服务商 URL 连通性 ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    /// 是否成功（HTTP 2xx）
    pub ok: bool,
    /// HTTP 状态码（连接失败时为 0）
    pub status: u16,
    /// 错误信息或成功时的简短描述
    pub message: String,
    /// 响应耗时（ms）
    pub latency_ms: u64,
}

/// 测试一个 provider URL 是否可用
/// - Anthropic 格式：POST {url}/v1/messages，发 "hi"
/// - OpenAI 格式：POST {url}/v1/chat/completions，发 "hi"
/// `model` 可选，不传则用默认测试模型
#[tauri::command]
pub async fn test_provider_url(
    url: String,
    api_key: String,
    format: String, // "anthropic" | "openai"
    model: Option<String>,
) -> Result<TestResult, String> {
    if url.is_empty() {
        return Err("URL 为空".to_string());
    }
    let url = url.trim_end_matches('/').to_string();
    // 智能处理：用户填的 URL 可能已含 /v1（如 minimaxi 是 https://api.minimaxi.com/v1），
    // 如果再加 /v1 会变成 /v1/v1/chat/completions → 404。剥掉尾部的 /v1 再追加。
    let base = url
        .strip_suffix("/v1")
        .map(String::from)
        .unwrap_or_else(|| url.clone());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    let start = Instant::now();

    let (endpoint, body) = match format.as_str() {
        "anthropic" => {
            let m = model.unwrap_or_else(|| "claude-3-5-haiku-20241022".to_string());
            let endpoint = format!("{}/v1/messages", base);
            let body = serde_json::json!({
                "model": m,
                "max_tokens": 8,
                "messages": [{"role": "user", "content": "hi"}]
            });
            (endpoint, body)
        }
        "openai" => {
            let m = model.unwrap_or_else(|| "gpt-4o-mini".to_string());
            let endpoint = format!("{}/v1/chat/completions", base);
            let body = serde_json::json!({
                "model": m,
                "max_tokens": 8,
                "messages": [{"role": "user", "content": "hi"}]
            });
            (endpoint, body)
        }
        _ => return Err(format!("未知格式: {}", format)),
    };

    let mut req = client.post(&endpoint);
    if !api_key.is_empty() {
        match format.as_str() {
            "anthropic" => {
                req = req
                    .header("x-api-key", &api_key)
                    .header("anthropic-version", "2023-06-01");
            }
            "openai" => {
                req = req.header("Authorization", format!("Bearer {}", api_key));
            }
            _ => unreachable!(),
        }
    }
    req = req.header("Content-Type", "application/json");

    let resp = match req.json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            // reqwest Display 已包含 URL，去掉冗余；常见原因：DNS、TLS、连接被拒、超时
            let raw = e.to_string();
            let msg = raw.split(" for url (").next().unwrap_or(&raw).trim().to_string();
            let with_ctx = if e.is_timeout() {
                format!("请求超时（15s）")
            } else if e.is_connect() {
                format!("连接失败：{}", msg)
            } else if e.is_request() {
                format!("请求错误：{}", msg)
            } else {
                format!("网络错误：{}", msg)
            };
            return Ok(TestResult {
                ok: false,
                status: 0,
                message: with_ctx,
                latency_ms: start.elapsed().as_millis() as u64,
            });
        }
    };

    let status = resp.status().as_u16();
    let latency_ms = start.elapsed().as_millis() as u64;
    if status >= 200 && status < 300 {
        return Ok(TestResult {
            ok: true,
            status,
            message: format!("连接正常（HTTP {}）", status),
            latency_ms,
        });
    }

    // 失败：尝试读 body 提取错误信息
    let err_body = resp.text().await.unwrap_or_default();
    let snippet = if err_body.len() > 200 {
        format!("{}…", &err_body[..200])
    } else {
        err_body
    };
    Ok(TestResult {
        ok: false,
        status,
        message: format!("HTTP {} — {}", status, snippet.trim()),
        latency_ms,
    })
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
