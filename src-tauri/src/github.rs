use serde::{Deserialize, Serialize};

const CLIENT_ID: &str = "Ov23liYBSMORhKxeSczi";
const REQUEST_TIMEOUT_SECS: u64 = 30;

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

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

fn ai_switch_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("无法获取主目录")?;
    let dir = home.join(".ai-switch");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
    Ok(dir)
}

/// 保存 token 到本地文件
fn save_token(token: &str, username: &str) -> Result<(), String> {
    let dir = ai_switch_dir()?;
    let token_file = dir.join("github_token.txt");
    std::fs::write(&token_file, token).map_err(|e| format!("保存 token 失败: {}", e))?;
    let user_file = dir.join("github_user.json");
    let json = serde_json::json!({ "username": username });
    std::fs::write(user_file, json.to_string()).map_err(|e| format!("写入用户名失败: {}", e))?;
    Ok(())
}

/// 读取 token
fn load_token() -> Result<String, String> {
    let dir = ai_switch_dir().map_err(|e| e)?;
    let token_file = dir.join("github_token.txt");
    if !token_file.exists() {
        return Err("未登录".into());
    }
    std::fs::read_to_string(&token_file).map_err(|e| format!("读取 token 失败: {}", e))
}

/// 读取用户名
#[allow(dead_code)]
fn load_username() -> Result<String, String> {
    let dir = ai_switch_dir()?;
    let user_file = dir.join("github_user.json");
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
    let dir = ai_switch_dir()?;
    let token_file = dir.join("github_token.txt");
    if token_file.exists() {
        std::fs::remove_file(&token_file).map_err(|e| format!("删除 token 失败: {}", e))?;
    }
    let user_file = dir.join("github_user.json");
    if user_file.exists() {
        std::fs::remove_file(&user_file).map_err(|e| format!("删除用户名文件失败: {}", e))?;
    }
    Ok(())
}

// ============ Device Flow ============

/// Step 1: 请求 device code
#[tauri::command]
pub async fn device_flow_start() -> Result<DeviceCodeResponse, String> {
    let client = build_client()?;
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
    let client = build_client()?;

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
        let user = fetch_user_from_token(&token).await?;
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
    let client = build_client()?;
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
///
/// 入参：`{ schemaVersion: 4, version, providers, profiles, activeProfileId, claudeToggles, opencodeToggles }`
/// 同步完整应用数据：服务商 + Profile + 行为开关。不再触碰本地配置文件 blob。
#[tauri::command]
pub async fn sync_upload(payload: serde_json::Value) -> Result<String, String> {
    let token = load_token()?;
    let user_info = fetch_user_from_token(&token).await?;
    let client = build_client()?;

    // 确保仓库存在
    ensure_repo(&client, &token, &user_info.login).await?;

    // 校验 schema
    let schema = payload
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "payload 缺少 schemaVersion".to_string())?;
    if schema != 4 {
        return Err(format!(
            "不支持的 schemaVersion: {}（仅支持 4）",
            schema
        ));
    }

    let new_version = payload
        .get("version")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "payload 缺少 version".to_string())?;

    if let Ok(existing) = download_file(&client, &token, &user_info.login, "profiles.json").await
    {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&existing) {
            if let Some(curr) = parsed.get("version").and_then(|v| v.as_u64()) {
                if new_version <= curr {
                    return Err(format!(
                        "版本冲突：你的版本 v{} 不超过云端版本 v{}，可能被其他设备更新。请先下载再上传。",
                        new_version, curr
                    ));
                }
            }
        }
    }

    let content = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("序列化 payload 失败: {}", e))?;

    upload_file(
        &client,
        &token,
        &user_info.login,
        "profiles.json",
        &content,
        "Sync AI-Switch profiles",
    )
    .await?;

    Ok(format!(
        "已上传到 {}/{} (profiles.json)",
        user_info.login, REPO_NAME
    ))
}

/// 从云端拉取配置
#[tauri::command]
pub async fn sync_download() -> Result<serde_json::Value, String> {
    let token = load_token()?;
    let user_info = fetch_user_from_token(&token).await?;
    let client = build_client()?;

    let content = match download_file(
        &client,
        &token,
        &user_info.login,
        "profiles.json",
    )
    .await
    {
        Ok(c) => c,
        Err(_) => {
            return Err(
                "云端仓库没有 profiles.json，可能是旧版数据。请在原始机器上点击「上传到云端」覆盖一次。"
                    .to_string(),
            );
        }
    };

    let payload: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析 profiles.json 失败: {}", e))?;

    let schema = payload
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if schema != 4 {
        return Err(format!(
            "云端 schemaVersion 不匹配：{}（需要 4）。v3 旧数据请先用旧版本客户端上传一次升级。",
            schema
        ));
    }

    Ok(payload)
}

/// 轻量级版本探测：从云端 profiles.json 读取 version 字段，不下载完整 payload
/// 用于启动/定时检查云端是否有更新
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudVersionInfo {
    pub version: Option<u64>,
    pub not_found: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn sync_check_version() -> Result<CloudVersionInfo, String> {
    // 8 秒总超时，避免前端永远停在「探测中」
    let fut = sync_check_version_inner();
    match tokio::time::timeout(std::time::Duration::from_secs(8), fut).await {
        Ok(result) => result,
        Err(_) => Ok(CloudVersionInfo {
            version: None,
            not_found: false,
            error: Some("请求超时（8s）".to_string()),
        }),
    }
}

async fn sync_check_version_inner() -> Result<CloudVersionInfo, String> {
    // 任何内部错误都转成 Ok(error=...) 返回，前端能看到具体原因
    let token = match load_token() {
        Ok(t) => t,
        Err(e) => {
            return Ok(CloudVersionInfo {
                version: None,
                not_found: false,
                error: Some(format!("token: {}", e)),
            });
        }
    };

    let user_info = match fetch_user_from_token(&token).await {
        Ok(u) => u,
        Err(e) => {
            return Ok(CloudVersionInfo {
                version: None,
                not_found: false,
                error: Some(format!("GitHub 用户: {}", e)),
            });
        }
    };

    let client = build_client()?;

    let content = match download_file(
        &client,
        &token,
        &user_info.login,
        "profiles.json",
    )
    .await
    {
        Ok(c) => c,
        Err(_) => {
            return Ok(CloudVersionInfo {
                version: None,
                not_found: true,
                error: None,
            });
        }
    };

    let payload: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            return Ok(CloudVersionInfo {
                version: None,
                not_found: false,
                error: Some(format!("profiles.json 解析失败: {}", e)),
            });
        }
    };

    let version = payload.get("version").and_then(|v| v.as_u64());
    Ok(CloudVersionInfo {
        version,
        not_found: false,
        error: None,
    })
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
    let client = build_client()?;
    let remote_version = fetch_remote_version(&client).await?;

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
