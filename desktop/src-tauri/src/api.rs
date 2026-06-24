use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAction {
    pub id: String,
    pub intent_type: String,
    pub status: String,
    pub payload: Value,
    pub result: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffResponse {
    pub action_id: String,
    pub markdown: String,
    pub external_id: Option<String>,
    pub repo: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub api_reachable: bool,
    pub authenticated: bool,
    pub has_token: bool,
    pub message: String,
}

fn auth_header(token: &str) -> String {
    format!("Bearer {token}")
}

pub async fn check_api_health(api_url: &str) -> bool {
    let url = format!("{}/health", api_url.trim_end_matches('/'));
    let Ok(response) = reqwest::Client::new().get(url).send().await else {
        return false;
    };
    response.status().is_success()
}

pub async fn check_connection(api_url: &str, token: Option<&str>) -> ConnectionStatus {
    let has_token = token.is_some_and(|value| !value.trim().is_empty());
    let api_reachable = check_api_health(api_url).await;

    if !api_reachable {
        return ConnectionStatus {
            api_reachable: false,
            authenticated: false,
            has_token,
            message: "API unreachable — start Blaze with npm run dev:all".to_string(),
        };
    }

    let Some(token) = token.filter(|value| !value.trim().is_empty()) else {
        return ConnectionStatus {
            api_reachable: true,
            authenticated: false,
            has_token: false,
            message: "Log into Blaze in the notepad window to connect.".to_string(),
        };
    };

    let url = format!("{}/api/integrations/status", api_url.trim_end_matches('/'));
    let response = reqwest::Client::new()
        .get(url)
        .header(AUTHORIZATION, auth_header(token))
        .send()
        .await;

    match response {
        Ok(res) if res.status().is_success() => ConnectionStatus {
            api_reachable: true,
            authenticated: true,
            has_token: true,
            message: "Connected to Blaze API.".to_string(),
        },
        Ok(res) if res.status() == reqwest::StatusCode::UNAUTHORIZED => ConnectionStatus {
            api_reachable: true,
            authenticated: false,
            has_token: true,
            message: "Session expired — log into Blaze again in the notepad window.".to_string(),
        },
        Ok(res) => ConnectionStatus {
            api_reachable: true,
            authenticated: false,
            has_token: true,
            message: format!("API auth check failed ({})", res.status()),
        },
        Err(error) => ConnectionStatus {
            api_reachable: false,
            authenticated: false,
            has_token: true,
            message: format!("API request failed: {error}"),
        },
    }
}

pub async fn fetch_repo_workspaces(
    api_url: &str,
    token: &str,
) -> Result<HashMap<String, String>, String> {
    let url = format!("{}/api/local/repo-workspaces", api_url.trim_end_matches('/'));
    let response = reqwest::Client::new()
        .get(url)
        .header(AUTHORIZATION, auth_header(token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "GET /api/local/repo-workspaces failed: {}",
            response.status()
        ));
    }

    #[derive(Deserialize)]
    struct RepoWorkspacesResponse {
        mappings: HashMap<String, String>,
    }

    response
        .json::<RepoWorkspacesResponse>()
        .await
        .map(|body| body.mappings)
        .map_err(|e| e.to_string())
}

pub async fn fetch_actions(
    api_url: &str,
    token: &str,
    status: Option<&str>,
) -> Result<Vec<AgentAction>, String> {
    let mut url = format!("{}/api/actions", api_url.trim_end_matches('/'));
    if let Some(status) = status {
        url = format!("{url}?status={status}");
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header(AUTHORIZATION, auth_header(token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GET /api/actions failed: {}", response.status()));
    }

    response
        .json::<Vec<AgentAction>>()
        .await
        .map_err(|e| e.to_string())
}

pub async fn fetch_handoff_markdown(
    api_url: &str,
    token: &str,
    action_id: &str,
) -> Result<HandoffResponse, String> {
    let url = format!(
        "{}/api/actions/{}/handoff",
        api_url.trim_end_matches('/'),
        action_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header(AUTHORIZATION, auth_header(token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GET /api/actions/{action_id}/handoff failed: {}", response.status()));
    }

    response
        .json::<HandoffResponse>()
        .await
        .map_err(|e| e.to_string())
}

pub fn is_coding_handoff_action(action: &AgentAction) -> bool {
    action.intent_type == "GITHUB_NEXT_STEPS"
        && action
            .payload
            .get("suggestedAction")
            .and_then(|v| v.as_str())
            .unwrap_or("handoff_coding")
            == "handoff_coding"
}

pub fn needs_local_delivery(action: &AgentAction, delivered_ids: &[String]) -> bool {
    if delivered_ids.contains(&action.id) {
        return false;
    }

    if action.status != "CONFIRMED" {
        return false;
    }

    let result_type = action
        .result
        .as_ref()
        .and_then(|r| r.get("type"))
        .and_then(|v| v.as_str());

    if result_type != Some("coding_handoff") && !is_coding_handoff_action(action) {
        return false;
    }

    let opened = action
        .result
        .as_ref()
        .and_then(|r| r.get("cursor"))
        .and_then(|c| c.get("opened"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    !opened
}
