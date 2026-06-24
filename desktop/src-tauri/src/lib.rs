mod api;
mod auth;
mod config;
mod handoff;

use api::{
    check_connection, fetch_actions, fetch_handoff_markdown, fetch_repo_workspaces,
    needs_local_delivery, ConnectionStatus,
};
use auth::{ensure_blaze_webview_auth, extract_token_from_cookies};
use config::{blaze_notes_url, load_config, save_config, DesktopConfig};
use handoff::DeliveryResult;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder,
};

struct AppState {
    config: Mutex<DesktopConfig>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PollResult {
    delivered: Vec<DeliveredHandoff>,
    pending_count: usize,
    message: String,
    connection: ConnectionStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeliveredHandoff {
    action_id: String,
    title: Option<String>,
    delivery: DeliveryResult,
}

fn blaze_window_stale(current: &str, target: &str) -> bool {
    let current = current.trim_end_matches('/');
    let target = target.trim_end_matches('/');
    current != target
}

fn require_token(config: &DesktopConfig) -> Result<String, String> {
    config
        .access_token
        .clone()
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| {
            "Not connected — open the notepad, log into Blaze, then try again.".to_string()
        })
}

async fn sync_repo_workspaces_from_api(
    app: &AppHandle,
    api_url: &str,
    token: &str,
) -> Result<(), String> {
    let mappings = fetch_repo_workspaces(api_url, token).await?;
    if mappings.is_empty() {
        return Ok(());
    }

    let mut updated = {
        let state = app.state::<AppState>();
        let current = state.config.lock().unwrap();
        current.clone()
    };

    let mut changed = false;
    for (repo, path) in mappings {
        if updated.repo_workspaces.get(&repo) != Some(&path) {
            updated.repo_workspaces.insert(repo, path);
            changed = true;
        }
    }

    if changed {
        {
            let state = app.state::<AppState>();
            let mut current = state.config.lock().unwrap();
            *current = updated.clone();
        }
        save_config(app, &updated)?;
    }

    Ok(())
}

async fn sync_auth_from_blaze_inner(app: &AppHandle) -> Result<bool, String> {
    let blaze = app
        .get_webview_window("blaze")
        .ok_or_else(|| "Open the Blaze notepad first.".to_string())?;

    let cookies = blaze.cookies().map_err(|e| e.to_string())?;
    let Some(token) = extract_token_from_cookies(&cookies) else {
        return Ok(false);
    };

    let mut updated = {
        let state = app.state::<AppState>();
        let current = state.config.lock().unwrap();
        current.clone()
    };

    let token_changed = updated.access_token.as_deref() != Some(token.as_str());
    if token_changed {
        updated.access_token = Some(token);
        {
            let state = app.state::<AppState>();
            let mut current = state.config.lock().unwrap();
            *current = updated.clone();
        }
        save_config(app, &updated)?;
    }

    if let Some(token) = updated.access_token.as_deref() {
        let _ = sync_repo_workspaces_from_api(app, &updated.api_url, token).await;
    }

    Ok(token_changed)
}

fn spawn_blaze_page_load_sync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        let _ = restore_blaze_webview_auth(&app);
        if let Ok(changed) = sync_auth_from_blaze_inner(&app).await {
            if changed {
                let _ = app.emit("connection-updated", ());
            }
        }
    });
}

fn restore_blaze_webview_auth(app: &AppHandle) -> Result<(), String> {
    let blaze = match app.get_webview_window("blaze") {
        Some(window) => window,
        None => return Ok(()),
    };

    let (app_url, token) = {
        let state = app.state::<AppState>();
        let config = state.config.lock().unwrap();
        (
            blaze_notes_url(&config),
            config.access_token.clone().filter(|t| !t.trim().is_empty()),
        )
    };

    let Some(token) = token else {
        return Ok(());
    };

    if !ensure_blaze_webview_auth(&app_url, &token, &blaze)? {
        return Ok(());
    }

    let target = if app_url.ends_with("/notes") {
        app_url
    } else {
        format!("{app_url}/notes")
    };
    blaze
        .eval(&format!(
            "window.location.replace({});",
            serde_json::to_string(&target).map_err(|e| e.to_string())?
        ))
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn create_blaze_window(app: &AppHandle, app_url: &str) -> Result<(), String> {
    let url = app_url
        .parse()
        .map_err(|_| format!("Invalid app URL: {app_url}"))?;

    let app_handle = app.clone();
    WebviewWindowBuilder::new(app, "blaze", WebviewUrl::External(url))
        .title("Blaze")
        .inner_size(1280.0, 860.0)
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                spawn_blaze_page_load_sync(app_handle.clone());
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn open_blaze_app(app: AppHandle) -> Result<(), String> {
    let app_url = {
        let state = app.state::<AppState>();
        let config = state.config.lock().unwrap();
        blaze_notes_url(&config)
    };
    let label = "blaze";

    if let Some(window) = app.get_webview_window(label) {
        let stale = window
            .url()
            .map(|url| blaze_window_stale(url.as_str(), &app_url))
            .unwrap_or(true);

        if stale {
            let _ = window.close();
            create_blaze_window(&app, &app_url)?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            spawn_blaze_page_load_sync(app.clone());
        }
    } else {
        create_blaze_window(&app, &app_url)?;
    }

    let _ = restore_blaze_webview_auth(&app);

    Ok(())
}

#[tauri::command]
fn get_config(state: State<'_, AppState>) -> DesktopConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn save_desktop_config(
    app: AppHandle,
    state: State<'_, AppState>,
    config: DesktopConfig,
) -> Result<(), String> {
    {
        let mut current = state.config.lock().unwrap();
        *current = config.clone();
    }
    save_config(&app, &config)
}

#[tauri::command]
async fn sync_auth_from_blaze(app: AppHandle) -> Result<ConnectionStatus, String> {
    let changed = sync_auth_from_blaze_inner(&app).await?;
    let status = current_connection_status(&app).await;
    if changed {
        let _ = app.emit("connection-updated", &status);
    }
    Ok(status)
}

async fn current_connection_status(app: &AppHandle) -> ConnectionStatus {
    let (api_url, token) = {
        let state = app.state::<AppState>();
        let config = state.config.lock().unwrap();
        (config.api_url.clone(), config.access_token.clone())
    };
    check_connection(&api_url, token.as_deref()).await
}

#[tauri::command]
async fn check_desktop_connection(app: AppHandle) -> Result<ConnectionStatus, String> {
    let _ = sync_auth_from_blaze_inner(&app).await;
    Ok(current_connection_status(&app).await)
}

#[tauri::command]
async fn deliver_action_handoff(
    app: AppHandle,
    state: State<'_, AppState>,
    action_id: String,
) -> Result<DeliveryResult, String> {
    let (api_url, token, config) = {
        let cfg = state.config.lock().unwrap();
        (cfg.api_url.clone(), require_token(&cfg)?, cfg.clone())
    };

    let (_, _, delivery) =
        deliver_single_handoff(&app, &api_url, &token, &action_id, &config).await?;

    let mut updated = config;
    if !updated.delivered_action_ids.contains(&action_id) {
        updated.delivered_action_ids.push(action_id);
        {
            let mut current = state.config.lock().unwrap();
            *current = updated.clone();
        }
        save_config(&app, &updated)?;
    }

    Ok(delivery)
}

#[tauri::command]
async fn poll_handoffs(app: AppHandle, state: State<'_, AppState>) -> Result<PollResult, String> {
    run_poll_handoffs(&app, &state).await
}

async fn run_poll_handoffs(app: &AppHandle, state: &State<'_, AppState>) -> Result<PollResult, String> {
    let _ = sync_auth_from_blaze_inner(app).await;

    let (api_url, token, mut config) = {
        let cfg = state.config.lock().unwrap();
        (
            cfg.api_url.clone(),
            require_token(&cfg)?,
            cfg.clone(),
        )
    };

    let connection = check_connection(&api_url, Some(&token)).await;
    if !connection.authenticated {
        return Err(connection.message);
    }

    let _ = sync_repo_workspaces_from_api(app, &api_url, &token).await;

    let actions = fetch_actions(&api_url, &token, None).await?;
    let pending_count = actions
        .iter()
        .filter(|a| a.status == "PENDING" && api::is_coding_handoff_action(a))
        .count();

    let delivered_ids_snapshot = config.delivered_action_ids.clone();
    let mut delivered = Vec::new();
    for action in actions
        .iter()
        .filter(|a| needs_local_delivery(a, &delivered_ids_snapshot))
    {
        match deliver_single_handoff(app, &api_url, &token, &action.id, &config).await {
            Ok((action_id, title, delivery)) => {
                if !config.delivered_action_ids.contains(&action_id) {
                    config.delivered_action_ids.push(action_id.clone());
                    save_config(app, &config)?;
                }
                delivered.push(DeliveredHandoff {
                    action_id,
                    title,
                    delivery,
                });
            }
            Err(error) => {
                eprintln!("Handoff delivery failed for {}: {error}", action.id);
            }
        }
    }

    {
        let mut current = state.config.lock().unwrap();
        *current = config;
    }

    let message = if delivered.is_empty() {
        if pending_count > 0 {
            format!("{pending_count} handoff action(s) waiting for approval in Blaze.")
        } else {
            "No new handoffs to deliver.".to_string()
        }
    } else {
        format!("Delivered {} handoff(s) to Cursor.", delivered.len())
    };

    Ok(PollResult {
        delivered,
        pending_count,
        message,
        connection,
    })
}

async fn deliver_single_handoff(
    _app: &AppHandle,
    api_url: &str,
    token: &str,
    action_id: &str,
    config: &DesktopConfig,
) -> Result<(String, Option<String>, DeliveryResult), String> {
    let handoff = fetch_handoff_markdown(api_url, token, action_id).await?;
    let delivery = handoff::deliver_handoff_markdown(
        &handoff.markdown,
        &handoff.action_id,
        handoff.external_id.as_deref(),
        handoff.repo.as_deref(),
        config,
    )?;

    let title = handoff
        .external_id
        .clone()
        .or_else(|| Some(action_id.to_string()));

    Ok((action_id.to_string(), title, delivery))
}

fn spawn_poll_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let interval = {
                let state = app.state::<AppState>();
                let secs = state.config.lock().unwrap().poll_interval_secs.max(15);
                secs
            };

            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

            let _ = sync_auth_from_blaze_inner(&app).await;

            let state = app.state::<AppState>();
            let token_ok = state
                .config
                .lock()
                .unwrap()
                .access_token
                .as_ref()
                .is_some_and(|t| !t.trim().is_empty());

            if !token_ok {
                continue;
            }

            if let Err(error) = run_poll_handoffs(&app, &state).await {
                eprintln!("Background handoff poll failed: {error}");
            }
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open_blaze", "Open notepad", true, None::<&str>)?;
    let poll_item = MenuItem::with_id(app, "poll_handoffs", "Deliver handoffs now", true, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show_shell", "Desktop settings", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &poll_item, &show_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Blaze")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open_blaze" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_blaze_app(handle).await;
                });
            }
            "poll_handoffs" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<AppState>();
                    match run_poll_handoffs(&handle, &state).await {
                        Ok(result) => {
                            let _ = handle.emit("handoff-poll", &result);
                        }
                        Err(error) => {
                            let _ = handle.emit("handoff-error", error);
                        }
                    }
                });
            }
            "show_shell" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_blaze_app(handle).await;
                });
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config = load_config(app.handle());
            app.manage(AppState {
                config: Mutex::new(config),
            });
            build_tray(app.handle())?;
            spawn_poll_loop(app.handle().clone());

            if let Some(shell) = app.get_webview_window("main") {
                let _ = shell.hide();
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = open_blaze_app(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_desktop_config,
            open_blaze_app,
            sync_auth_from_blaze,
            check_desktop_connection,
            deliver_action_handoff,
            poll_handoffs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
