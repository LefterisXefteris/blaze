use serde::{Deserialize, Serialize};
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
    pub cursor_handoff: String,
    pub cursor_rules: bool,
    pub poll_interval_secs: u64,
    pub delivered_action_ids: Vec<String>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            api_url: "http://127.0.0.1:8000".to_string(),
            app_url: "http://localhost:3000".to_string(),
            access_token: None,
            handoff_dir: None,
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

pub fn load_config(app: &AppHandle) -> DesktopConfig {
    let path = match config_path(app) {
        Ok(path) => path,
        Err(_) => return DesktopConfig::default(),
    };

    if !path.exists() {
        return DesktopConfig::default();
    }

    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => DesktopConfig::default(),
    }
}

pub fn save_config(app: &AppHandle, config: &DesktopConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}
