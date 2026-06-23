use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
}

fn auth_header(token: &str) -> String {
    format!("Bearer {token}")
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
