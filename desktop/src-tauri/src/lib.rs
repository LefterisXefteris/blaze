mod api;
mod config;
mod handoff;

use api::{fetch_actions, fetch_handoff_markdown, needs_local_delivery};
use config::{load_config, save_config, DesktopConfig};
use handoff::DeliveryResult;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeliveredHandoff {
    action_id: String,
    title: Option<String>,
    delivery: DeliveryResult,
}

fn require_token(config: &DesktopConfig) -> Result<String, String> {
    config
        .access_token
        .clone()
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| "Set your Blaze access token in Settings first.".to_string())
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
async fn open_blaze_app(app: AppHandle) -> Result<(), String> {
    let app_url = app
        .state::<AppState>()
        .config
        .lock()
        .unwrap()
        .app_url
        .clone();
    let label = "blaze";

    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url = app_url
        .parse()
        .map_err(|_| format!("Invalid app URL: {app_url}"))?;

    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
        .title("Blaze")
        .inner_size(1280.0, 860.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn deliver_action_handoff(
    app: AppHandle,
    state: State<'_, AppState>,
    action_id: String,
) -> Result<DeliveryResult, String> {
    let (api_url, token, config) = {
        let cfg = state.config.lock().unwrap();
        (
            cfg.api_url.clone(),
            require_token(&cfg)?,
            cfg.clone(),
        )
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
    let (api_url, token, mut config) = {
        let cfg = state.config.lock().unwrap();
        (
            cfg.api_url.clone(),
            require_token(&cfg)?,
            cfg.clone(),
        )
    };

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
        match deliver_single_handoff(&app, &api_url, &token, &action.id, &config).await {
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
    let open_item = MenuItem::with_id(app, "open_blaze", "Open Blaze", true, None::<&str>)?;
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
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_desktop_config,
            open_blaze_app,
            deliver_action_handoff,
            poll_handoffs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
