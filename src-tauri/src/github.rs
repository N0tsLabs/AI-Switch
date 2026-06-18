use keyring::Entry;
use serde::{Deserialize, Serialize};

const CLIENT_ID: &str = "Ov23liYBSMORhKxeSczi";
const SERVICE_NAME: &str = "ai-switch";
const ACCOUNT_NAME: &str = "github_token";

#[derive(Serialize, Deserialize, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Serialize, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    token_type: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct GithubUser {
    pub login: String,
    pub id: u64,
    pub avatar_url: Option<String>,
}

/// 保存 token 到系统钥匙串
fn save_token(token: &str, username: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("创建钥匙串条目失败: {}", e))?;
    entry
        .set_password(token)
        .map_err(|e| format!("保存 token 失败: {}", e))?;

    // 同时保存用户名到本地文件（用户名不敏感）
    let home = dirs::home_dir().ok_or("无法获取主目录")?;
    let dir = home.join(".ai-switch");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
    let user_file = dir.join("github_user.json");
    let json = serde_json::json!({ "username": username });
    std::fs::write(user_file, json.to_string()).map_err(|e| format!("写入用户名失败: {}", e))?;

    Ok(())
}

/// 读取 token
fn load_token() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("创建钥匙串条目失败: {}", e))?;
    entry
        .get_password()
        .map_err(|e| format!("读取 token 失败: {}", e))
}

/// 读取用户名（用于获取存储的 token 时同时获取用户名）
#[allow(dead_code)]
fn load_username() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("无法获取主目录")?;
    let user_file = home.join(".ai-switch").join("github_user.json");
    if !user_file.exists() {
        return Err("未登录".into());
    }
    let content = std::fs::read_to_string(&user_file).map_err(|e| format!("读取失败: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("解析失败: {}", e))?;
    json["username"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "用户名不存在".into())
}

/// 删除 token
fn delete_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("创建钥匙串条目失败: {}", e))?;
    entry.delete_credential().map_err(|e| format!("删除 token 失败: {}", e))?;

    let home = dirs::home_dir().ok_or("无法获取主目录")?;
    let user_file = home.join(".ai-switch").join("github_user.json");
    if user_file.exists() {
        std::fs::remove_file(&user_file).map_err(|e| format!("删除用户名文件失败: {}", e))?;
    }
    Ok(())
}

// ============ Device Flow ============

/// Step 1: 请求 device code
#[tauri::command]
pub async fn device_flow_start() -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_id": CLIENT_ID,
            "scope": "repo"
        }))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    resp.json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))
}

/// Step 2: 轮询 token（前端每 N 秒调一次）
#[tauri::command]
pub async fn device_flow_poll(device_code: String) -> Result<String, String> {
    let client = reqwest::Client::new();

    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_id": CLIENT_ID,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
        }))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let body: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if let Some(token) = body.access_token {
        // 获取用户名并保存
        let user = fetch_user_from_token(&token).await.unwrap_or_default();
        save_token(&token, &user.login)?;
        Ok(token)
    } else {
        match body.error.as_deref() {
            Some("authorization_pending") => Err("pending".into()),
            Some("slow_down") => Err("slow_down".into()),
            Some("expired_token") => Err("expired".into()),
            Some("access_denied") => Err("denied".into()),
            Some(e) => Err(format!("error: {}", e)),
            None => Err("unknown error".into()),
        }
    }
}

/// 获取当前登录用户
async fn fetch_user_from_token(token: &str) -> Result<GithubUser, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ai-switch")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    resp.json::<GithubUser>()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))
}

/// 获取当前登录用户信息
#[tauri::command]
pub async fn get_github_user() -> Result<GithubUser, String> {
    let token = load_token()?;
    let user = fetch_user_from_token(&token).await?;
    Ok(user)
}

/// 退出登录
#[tauri::command]
pub fn github_logout() -> Result<(), String> {
    delete_token()
}

/// 获取存储的 token（供其他模块使用，如 sync）
#[allow(dead_code)]
pub fn get_stored_token() -> Option<String> {
    load_token().ok()
}

// ============ 云同步 ============

const REPO_NAME: &str = "ai-switch-configs";

/// 确保仓库存在（不存在则创建私有仓库）
async fn ensure_repo(client: &reqwest::Client, token: &str, user: &str) -> Result<(), String> {
    // 检查仓库是否存在
    let check = client
        .get(format!("https://api.github.com/repos/{}/{}", user, REPO_NAME))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ai-switch")
        .send()
        .await
        .map_err(|e| format!("检查仓库失败: {}", e))?;

    if check.status().is_success() {
        return Ok(()); // 已存在
    }

    // 创建私有仓库
    let create = client
        .post("https://api.github.com/user/repos")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ai-switch")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "name": REPO_NAME,
            "description": "AI-Switch 配置同步仓库",
            "private": true,
            "auto_init": true
        }))
        .send()
        .await
        .map_err(|e| format!("创建仓库失败: {}", e))?;

    if !create.status().is_success() {
        let body = create.text().await.unwrap_or_default();
        return Err(format!("创建仓库失败: {}", body));
    }
    Ok(())
}

/// 获取文件的 SHA（用于更新已有文件）
async fn get_file_sha(
    client: &reqwest::Client,
    token: &str,
    user: &str,
    path: &str,
) -> Option<String> {
    let resp = client
        .get(format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            user, REPO_NAME, path
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ai-switch")
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let body: serde_json::Value = resp.json().await.ok()?;
    body["sha"].as_str().map(|s| s.to_string())
}

/// 上传文件到仓库
async fn upload_file(
    client: &reqwest::Client,
    token: &str,
    user: &str,
    path: &str,
    content: &str,
    message: &str,
) -> Result<(), String> {
    let encoded = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        content.as_bytes(),
    );

    let mut body = serde_json::json!({
        "message": message,
        "content": encoded,
    });

    // 如果文件已存在，需要带上 SHA
    if let Some(sha) = get_file_sha(client, token, user, path).await {
        body["sha"] = serde_json::Value::String(sha);
    }

    let resp = client
        .put(format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            user, REPO_NAME, path
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ai-switch")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("上传文件失败: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("上传 {} 失败: {}", path, body));
    }
    Ok(())
}

/// 从仓库下载文件
async fn download_file(
    client: &reqwest::Client,
    token: &str,
    user: &str,
    path: &str,
) -> Result<String, String> {
    let resp = client
        .get(format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            user, REPO_NAME, path
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ai-switch")
        .header("Accept", "application/vnd.github.raw+json")
        .send()
        .await
        .map_err(|e| format!("下载文件失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("文件 {} 不存在或下载失败", path));
    }

    resp.text().await.map_err(|e| format!("读取响应失败: {}", e))
}

/// 上传配置到云端
#[tauri::command]
pub async fn sync_upload() -> Result<String, String> {
    let token = load_token()?;
    let user_info = fetch_user_from_token(&token).await?;
    let client = reqwest::Client::new();

    // 确保仓库存在
    ensure_repo(&client, &token, &user_info.login).await?;

    let home = dirs::home_dir().ok_or("无法获取主目录")?;
    let mut uploaded = Vec::new();

    // 上传 Claude settings.json
    let claude_path = home.join(".claude").join("settings.json");
    if claude_path.exists() {
        let content = std::fs::read_to_string(&claude_path)
            .map_err(|e| format!("读取 claude settings 失败: {}", e))?;
        upload_file(
            &client, &token, &user_info.login,
            "claude/settings.json", &content, "Sync Claude Code settings"
        ).await?;
        uploaded.push("claude/settings.json");
    }

    // 上传 Claude .mcp.json
    let mcp_path = home.join(".claude").join(".mcp.json");
    if mcp_path.exists() {
        let content = std::fs::read_to_string(&mcp_path)
            .map_err(|e| format!("读取 claude mcp 失败: {}", e))?;
        upload_file(
            &client, &token, &user_info.login,
            "claude/.mcp.json", &content, "Sync Claude Code MCP config"
        ).await?;
        uploaded.push("claude/.mcp.json");
    }

    // 上传 OpenCode oh-my-openagent.json
    let opencode_path = home.join(".config").join("opencode").join("oh-my-openagent.json");
    if opencode_path.exists() {
        let content = std::fs::read_to_string(&opencode_path)
            .map_err(|e| format!("读取 opencode agents 失败: {}", e))?;
        upload_file(
            &client, &token, &user_info.login,
            "opencode/oh-my-openagent.json", &content, "Sync OpenCode agents config"
        ).await?;
        uploaded.push("opencode/oh-my-openagent.json");
    }

    // 上传 OpenCode opencode.json
    let opencode_cfg = home.join(".config").join("opencode").join("opencode.json");
    if opencode_cfg.exists() {
        let content = std::fs::read_to_string(&opencode_cfg)
            .map_err(|e| format!("读取 opencode config 失败: {}", e))?;
        upload_file(
            &client, &token, &user_info.login,
            "opencode/opencode.json", &content, "Sync OpenCode config"
        ).await?;
        uploaded.push("opencode/opencode.json");
    }

    Ok(format!("已上传 {} 个文件到 {}/{}", uploaded.len(), user_info.login, REPO_NAME))
}

/// 从云端拉取配置
#[tauri::command]
pub async fn sync_download() -> Result<String, String> {
    let token = load_token()?;
    let user_info = fetch_user_from_token(&token).await?;
    let client = reqwest::Client::new();
    let home = dirs::home_dir().ok_or("无法获取主目录")?;
    let mut downloaded = Vec::new();

    // 拉取 Claude settings.json
    match download_file(&client, &token, &user_info.login, "claude/settings.json").await {
        Ok(content) => {
            let path = home.join(".claude").join("settings.json");
            std::fs::create_dir_all(path.parent().unwrap()).ok();
            std::fs::write(&path, content).map_err(|e| format!("写入 claude settings 失败: {}", e))?;
            downloaded.push("claude/settings.json");
        }
        Err(e) => eprintln!("跳过 claude/settings.json: {}", e),
    }

    // 拉取 Claude .mcp.json
    match download_file(&client, &token, &user_info.login, "claude/.mcp.json").await {
        Ok(content) => {
            let path = home.join(".claude").join(".mcp.json");
            std::fs::write(&path, content).map_err(|e| format!("写入 claude mcp 失败: {}", e))?;
            downloaded.push("claude/.mcp.json");
        }
        Err(e) => eprintln!("跳过 claude/.mcp.json: {}", e),
    }

    // 拉取 OpenCode oh-my-openagent.json
    match download_file(&client, &token, &user_info.login, "opencode/oh-my-openagent.json").await {
        Ok(content) => {
            let path = home.join(".config").join("opencode").join("oh-my-openagent.json");
            std::fs::create_dir_all(path.parent().unwrap()).ok();
            std::fs::write(&path, content).map_err(|e| format!("写入 opencode agents 失败: {}", e))?;
            downloaded.push("opencode/oh-my-openagent.json");
        }
        Err(e) => eprintln!("跳过 opencode/oh-my-openagent.json: {}", e),
    }

    // 拉取 OpenCode opencode.json
    match download_file(&client, &token, &user_info.login, "opencode/opencode.json").await {
        Ok(content) => {
            let path = home.join(".config").join("opencode").join("opencode.json");
            std::fs::write(&path, content).map_err(|e| format!("写入 opencode config 失败: {}", e))?;
            downloaded.push("opencode/opencode.json");
        }
        Err(e) => eprintln!("跳过 opencode/opencode.json: {}", e),
    }

    Ok(format!("已从云端拉取 {} 个文件", downloaded.len()))
}

// ============ 版本更新检查 ============

const REPO_OWNER: &str = "n0tssss";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 从 GitHub 读取远程 VERSION 文件
async fn fetch_remote_version(client: &reqwest::Client) -> Result<String, String> {
    let url = format!(
        "https://raw.githubusercontent.com/{}/{}/master/VERSION",
        REPO_OWNER, REPO_NAME
    );
    let resp = client
        .get(&url)
        .header("User-Agent", "ai-switch")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let version = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?
        .trim()
        .to_string();

    Ok(version)
}

/// 比较版本号，返回远程是否更新
fn is_newer(remote: &str, local: &str) -> bool {
    let remote_parts: Vec<u32> = remote.split('.').filter_map(|s| s.parse().ok()).collect();
    let local_parts: Vec<u32> = local.split('.').filter_map(|s| s.parse().ok()).collect();

    for i in 0..3.max(remote_parts.len()).max(local_parts.len()) {
        let r = remote_parts.get(i).unwrap_or(&0);
        let l = local_parts.get(i).unwrap_or(&0);
        if r > l { return true; }
        if r < l { return false; }
    }
    false
}

#[derive(Serialize)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub remote_version: String,
    pub download_url: String,
}

/// 检查是否有新版本
#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::new();
    let remote_version = fetch_remote_version(&client).await.unwrap_or_default();

    let has_update = if remote_version.is_empty() {
        false
    } else {
        is_newer(&remote_version, CURRENT_VERSION)
    };

    Ok(UpdateInfo {
        has_update,
        current_version: CURRENT_VERSION.to_string(),
        remote_version,
        download_url: format!(
            "https://github.com/{}/{}/releases/latest",
            REPO_OWNER, REPO_NAME
        ),
    })
}
