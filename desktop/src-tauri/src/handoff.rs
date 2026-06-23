use crate::config::DesktopConfig;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryResult {
    pub path: String,
    pub filename: String,
    pub cursor: CursorOpenResult,
    pub cursor_rules: CursorRulesResult,
    pub repo_root: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorOpenResult {
    pub opened: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorRulesResult {
    pub written: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

pub fn find_git_root(start: Option<&Path>) -> Option<PathBuf> {
    let mut current = start
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .ok()?;

    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            break;
        }
    }
    None
}

fn slugify(text: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in text.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "task".to_string()
    } else if slug.len() > 48 {
        slug[..48].trim_end_matches('-').to_string()
    } else {
        slug
    }
}

fn handoff_dir(config: &DesktopConfig) -> Result<PathBuf, String> {
    let path = if let Some(raw) = &config.handoff_dir {
        PathBuf::from(raw)
    } else if let Some(git_root) = find_git_root(None) {
        git_root.join(".blaze").join("handoffs")
    } else {
        dirs::home_dir()
            .ok_or_else(|| "Could not resolve home directory for handoffs".to_string())?
            .join(".blaze")
            .join("handoffs")
    };

    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn handoff_path_label(handoff_path: &Path, repo_root: Option<&Path>) -> String {
    let resolved = handoff_path.canonicalize().unwrap_or_else(|_| handoff_path.to_path_buf());
    if let Some(root) = repo_root {
        if let Ok(rel) = resolved.strip_prefix(root.canonicalize().unwrap_or_else(|_| root.to_path_buf())) {
            return rel.to_string_lossy().to_string();
        }
    }
    resolved.to_string_lossy().to_string()
}

fn write_cursor_rules_snippet(
    handoff_path: &Path,
    repo_root: Option<&Path>,
    enabled: bool,
) -> CursorRulesResult {
    if !enabled {
        return CursorRulesResult {
            written: false,
            path: None,
        };
    }

    let Some(repo_root) = repo_root else {
        return CursorRulesResult {
            written: false,
            path: None,
        };
    };

    let rules_dir = repo_root.join(".cursor").join("rules");
    if std::fs::create_dir_all(&rules_dir).is_err() {
        return CursorRulesResult {
            written: false,
            path: None,
        };
    }

    let rules_file = rules_dir.join("blaze-handoff.mdc");
    let label = handoff_path_label(handoff_path, Some(repo_root));
    let body = format!(
        "---\n\
         description: Active Blaze coding handoff — implement this task\n\
         alwaysApply: true\n\
         ---\n\n\
         # Blaze handoff\n\n\
         Implement the coding task described in:\n\n\
         `{label}`\n\n\
         Read that file fully (issue context, notes, transcript) before making changes.\n\
         When done, summarize what you changed and whether a GitHub comment or PR is needed.\n"
    );

    match std::fs::write(&rules_file, body) {
        Ok(_) => CursorRulesResult {
            written: true,
            path: Some(rules_file.to_string_lossy().to_string()),
        },
        Err(_) => CursorRulesResult {
            written: false,
            path: None,
        },
    }
}

fn open_handoff_in_cursor(handoff_path: &Path, mode: &str) -> CursorOpenResult {
    if mode == "off" {
        return CursorOpenResult {
            opened: false,
            method: None,
            skipped: Some(true),
            reason: Some("cursor_handoff=off".to_string()),
            errors: None,
        };
    }

    let resolved = handoff_path
        .canonicalize()
        .unwrap_or_else(|_| handoff_path.to_path_buf());
    let mut errors: Vec<String> = Vec::new();

    if mode == "auto" || mode == "add" {
        if let Ok(output) = Command::new("cursor")
            .args(["--add", resolved.to_string_lossy().as_ref()])
            .output()
        {
            if output.status.success() {
                return CursorOpenResult {
                    opened: true,
                    method: Some("cursor --add".to_string()),
                    skipped: None,
                    reason: None,
                    errors: None,
                };
            }
            errors.push(format!(
                "cursor --add: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        } else {
            errors.push("cursor --add: cursor CLI not found".to_string());
        }
    }

    if cfg!(target_os = "macos") && (mode == "auto" || mode == "open") {
        if let Ok(output) = Command::new("open")
            .args(["-a", "Cursor", resolved.to_string_lossy().as_ref()])
            .output()
        {
            if output.status.success() {
                return CursorOpenResult {
                    opened: true,
                    method: Some("open -a Cursor".to_string()),
                    skipped: None,
                    reason: None,
                    errors: None,
                };
            }
            errors.push(format!(
                "open -a Cursor: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    CursorOpenResult {
        opened: false,
        method: None,
        skipped: None,
        reason: None,
        errors: if errors.is_empty() { None } else { Some(errors) },
    }
}

pub fn deliver_handoff_markdown(
    markdown: &str,
    action_id: &str,
    external_id: Option<&str>,
    config: &DesktopConfig,
) -> Result<DeliveryResult, String> {
    let slug_source = external_id.unwrap_or(action_id);
    let filename = format!("{}-{}.md", slugify(slug_source), &action_id[..action_id.len().min(8)]);
    let dir = handoff_dir(config)?;
    let path = dir.join(&filename);

    std::fs::write(&path, markdown).map_err(|e| e.to_string())?;

    let repo_root = find_git_root(Some(&dir));
    let rules = write_cursor_rules_snippet(&path, repo_root.as_deref(), config.cursor_rules);
    let cursor = open_handoff_in_cursor(&path, &config.cursor_handoff);

    Ok(DeliveryResult {
        path: path.canonicalize().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| path.to_string_lossy().to_string()),
        filename,
        cursor,
        cursor_rules: rules,
        repo_root: repo_root.map(|p| p.to_string_lossy().to_string()),
    })
}
