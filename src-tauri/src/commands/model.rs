use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ModelItem {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct FetchModelsResult {
    pub models: Vec<ModelItem>,
    pub error: Option<String>,
}

/// 从 OpenAI 兼容接口读取模型列表
/// POST /v1/models 或 GET /v1/models
#[tauri::command]
pub async fn fetch_openai_models(url: String, api_key: String) -> Result<FetchModelsResult, String> {
    let client = reqwest::Client::new();

    // 自动补全 /v1/models 路径
    let base = url.trim_end_matches('/');
    let models_url = if base.ends_with("/v1") {
        format!("{}/models", base)
    } else if base.ends_with("/v1/") {
        format!("{}models", base)
    } else {
        format!("{}/v1/models", base)
    };

    let resp = client
        .get(&models_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Ok(FetchModelsResult {
            models: vec![],
            error: Some(format!("HTTP {}: {}", status, body)),
        });
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let models = body["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let id = item["id"].as_str()?.to_string();
                    let name = item["owned_by"]
                        .as_str()
                        .map(|s| format!("{} ({})", id, s));
                    Some(ModelItem { id, name })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(FetchModelsResult {
        models,
        error: None,
    })
}
