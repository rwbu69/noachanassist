use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandEvent, CommandChild};
use std::sync::Mutex;
use uuid::Uuid;

struct AppState {
    sidecar_child: Mutex<Option<CommandChild>>,
    backend_port: Mutex<Option<String>>,
    backend_token: Mutex<String>,
}

#[tauri::command]
fn get_backend_info(state: tauri::State<AppState>) -> serde_json::Value {
    let port = state.backend_port.lock().unwrap().clone();
    let token = state.backend_token.lock().unwrap().clone();
    serde_json::json!({
        "port": port,
        "token": token
    })
}

#[tauri::command]
fn send_rust_notification(app: tauri::AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    match app.notification()
        .builder()
        .title(title)
        .body(body)
        .show() {
        Ok(_) => println!("Notification shown successfully via Rust!"),
        Err(e) => eprintln!("Failed to show notification via Rust: {}", e),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_backend_info, send_rust_notification])
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            // Generate Secure Token
            let auth_token = Uuid::new_v4().to_string();

            // Spawn the Bun Backend Sidecar
            let resource_dir = app.path().resource_dir().unwrap_or_default();
            let sidecar_command = app.shell().sidecar("noa-backend").unwrap()
                .env("NOA_RESOURCE_DIR", resource_dir.to_string_lossy().to_string())
                .env("NOA_AUTH_TOKEN", &auth_token);
            let (mut rx, child) = sidecar_command.spawn().expect("Failed to spawn noa-backend");

            app.manage(AppState {
                sidecar_child: Mutex::new(Some(child)),
                backend_port: Mutex::new(None),
                backend_token: Mutex::new(auth_token.clone()),
            });

            // Log backend output to terminal and send to frontend
            let app_handle_for_events = app.handle().clone();
            let token_clone = auth_token.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text = String::from_utf8_lossy(&line).to_string();
                            println!("Backend: {}", text);
                            
                            // Check if the backend emitted its port (handle chunked lines)
                            for l in text.lines() {
                                if l.starts_with("PORT=") {
                                    if let Some(port_str) = l.strip_prefix("PORT=") {
                                        let port = port_str.trim().to_string();
                                        
                                        if let Some(state) = app_handle_for_events.try_state::<AppState>() {
                                            if let Ok(mut lock) = state.backend_port.lock() {
                                                *lock = Some(port.clone());
                                            }
                                        }

                                        // Send port and token to frontend
                                        let _ = app_handle_for_events.emit("backend-ready", serde_json::json!({
                                            "port": port,
                                            "token": token_clone
                                        }));
                                    }
                                }
                            }
                            
                            let _ = app_handle_for_events.emit("backend-log", text);
                        }
                        CommandEvent::Stderr(line) => {
                            let text = String::from_utf8_lossy(&line).to_string();
                            eprintln!("Backend Error: {}", text);
                            let _ = app_handle_for_events.emit("backend-log", text);
                        }
                        _ => {}
                    }
                }
            });

            // Tray configuration
            let quit_i = MenuItem::with_id(app, "quit", "Quit Noa-chan", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Interface", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        let state = app.state::<AppState>();
                        if let Ok(mut child_lock) = state.sidecar_child.lock() {
                            if let Some(child) = child_lock.take() {
                                let _ = child.kill();
                            }
                        }
                        std::process::exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Check if launched on startup via autostart
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--autostart".to_string()) || args.contains(&"--hidden".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                    
                    // Fire Notification
                    use tauri_plugin_notification::NotificationExt;
                    app.notification()
                        .builder()
                        .title("Noa-chan")
                        .body("Good morning, Sensei. I am waiting in the background.")
                        .show()
                        .unwrap();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
