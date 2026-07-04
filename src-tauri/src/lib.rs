pub mod deleter;
pub mod desktop;
pub mod leftovers;

use std::path::PathBuf;

/// Ev dizini; test için APPCLEANER_HOME ile geçersiz kılınabilir.
pub fn home_dir() -> Option<PathBuf> {
    if let Ok(h) = std::env::var("APPCLEANER_HOME") {
        if !h.trim().is_empty() {
            return Some(PathBuf::from(h));
        }
    }
    dirs::home_dir()
}

#[tauri::command]
async fn scan_apps() -> Result<Vec<desktop::AppEntry>, String> {
    Ok(desktop::scan_apps())
}

#[tauri::command]
async fn find_leftovers(
    app: desktop::AppEntry,
) -> Result<Vec<leftovers::LeftoverItem>, String> {
    Ok(leftovers::find_leftovers(&app))
}

#[tauri::command]
async fn delete_paths(
    paths: Vec<String>,
    dry_run: bool,
) -> Result<Vec<deleter::DeleteResult>, String> {
    Ok(deleter::delete_paths(paths, dry_run))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_apps,
            find_leftovers,
            delete_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
