use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfig {
    pub api_url: String,
    pub app_url: String,
    pub access_token: Option<String>,
    pub handoff_dir: Option<String>,
    #[serde(default)]
    pub repo_workspaces: HashMap<String, String>,
    pub cursor_handoff: String,
    pub cursor_rules: bool,
    pub poll_interval_secs: u64,
    pub delivered_action_ids: Vec<String>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            api_url: "http://127.0.0.1:8000".to_string(),
            app_url: "http://localhost:3010/notes".to_string(),
            access_token: None,
            handoff_dir: None,
            repo_workspaces: HashMap::new(),
            cursor_handoff: "auto".to_string(),
            cursor_rules: true,
            poll_interval_secs: 30,
            delivered_action_ids: Vec::new(),
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("blaze-desktop.json"))
}

fn blaze_env_file_paths() -> Vec<PathBuf> {
    vec![
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.env"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../.env"),
    ]
}

fn read_env_key(key: &str) -> Option<String> {
    for path in blaze_env_file_paths() {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let prefix = format!("{key}=");
        for line in content.lines() {
            let trimmed = line.trim();
            if !trimmed.starts_with(&prefix) || trimmed.starts_with('#') {
                continue;
            }
            let raw = trimmed[prefix.len()..].trim();
            let value = raw
                .strip_prefix('"')
                .and_then(|s| s.strip_suffix('"'))
                .or_else(|| raw.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')))
                .unwrap_or(raw)
                .trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn notes_url_from_app_base(base: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    if base.ends_with("/notes") {
        base.to_string()
    } else {
        format!("{base}/notes")
    }
}

fn apply_repo_env(mut config: DesktopConfig) -> DesktopConfig {
    if let Some(url) = read_env_key("NEXT_PUBLIC_APP_URL") {
        config.app_url = notes_url_from_app_base(&url);
    }
    if let Some(api) = read_env_key("API_URL") {
        config.api_url = api;
    }
    config
}

/// Port 3000 is commonly Grafana/docker — Blaze dev runs on 3010. Rewrite it so
/// the notepad webview can never accidentally load Grafana's login page.
fn rewrite_grafana_port(url: &str) -> String {
    url.replace("localhost:3000", "localhost:3010")
        .replace("127.0.0.1:3000", "127.0.0.1:3010")
}

fn normalize_config(mut config: DesktopConfig) -> DesktopConfig {
    if config.app_url.trim().is_empty() {
        config.app_url = DesktopConfig::default().app_url;
    }

    // Apply env overrides first, then rewrite the Grafana port last so a stray
    // `:3000` from .env or a stale config can't survive normalization.
    config = apply_repo_env(config);
    config.app_url = rewrite_grafana_port(&config.app_url);
    config
}

pub fn blaze_notes_url(config: &DesktopConfig) -> String {
    let resolved = apply_repo_env(config.clone());
    notes_url_from_app_base(&rewrite_grafana_port(&resolved.app_url))
}

pub fn load_config(app: &AppHandle) -> DesktopConfig {
    let path = match config_path(app) {
        Ok(path) => path,
        Err(_) => return normalize_config(DesktopConfig::default()),
    };

    if !path.exists() {
        let config = normalize_config(DesktopConfig::default());
        let _ = save_config(app, &config);
        return config;
    }

    let loaded: DesktopConfig = match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => DesktopConfig::default(),
    };

    let before_app_url = loaded.app_url.clone();
    let before_api_url = loaded.api_url.clone();
    let normalized = normalize_config(loaded);
    if normalized.app_url != before_app_url || normalized.api_url != before_api_url {
        let _ = save_config(app, &normalized);
    }
    normalized
}

pub fn save_config(app: &AppHandle, config: &DesktopConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let normalized = normalize_config(config.clone());
    let raw = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}
