use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    /// .desktop dosya adı (uzantısız), ör. "org.gnome.Builder"
    pub id: String,
    pub name: String,
    /// Exec satırından çıkarılan çalıştırılabilir adı
    pub exec: String,
    pub icon: String,
    /// Kaynak .desktop dosyasının tam yolu
    pub source: String,
    /// "flatpak run <id>" biçimindeki Exec'lerden çıkarılan flatpak kimliği
    pub flatpak_id: Option<String>,
}

/// Taranacak .desktop dizinleri; test için APPCLEANER_APP_DIRS
/// (PATH ayracıyla ayrılmış liste) ile geçersiz kılınabilir.
pub fn app_dirs() -> Vec<PathBuf> {
    if let Ok(custom) = std::env::var("APPCLEANER_APP_DIRS") {
        return std::env::split_paths(&custom)
            .filter(|p| !p.as_os_str().is_empty())
            .collect();
    }
    let mut list = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
        PathBuf::from("/var/lib/flatpak/exports/share/applications"),
    ];
    if let Some(home) = crate::home_dir() {
        list.push(home.join(".local/share/applications"));
        list.push(home.join(".local/share/flatpak/exports/share/applications"));
    }
    list
}

pub fn scan_apps() -> Vec<AppEntry> {
    let mut seen: HashMap<String, AppEntry> = HashMap::new();
    for dir in app_dirs() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            if let Some(app) = parse_desktop_file(&path) {
                seen.entry(app.id.clone()).or_insert(app);
            }
        }
    }
    let mut apps: Vec<AppEntry> = seen.into_values().collect();
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

fn parse_desktop_file(path: &Path) -> Option<AppEntry> {
    let content = fs::read_to_string(path).ok()?;
    let mut in_entry = false;
    let mut fields: HashMap<String, String> = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry || line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            fields
                .entry(k.trim().to_string())
                .or_insert_with(|| v.trim().to_string());
        }
    }
    if fields.get("Type").map(String::as_str) != Some("Application") {
        return None;
    }
    if fields.get("NoDisplay").map(String::as_str) == Some("true")
        || fields.get("Hidden").map(String::as_str) == Some("true")
    {
        return None;
    }
    let id = path.file_stem()?.to_string_lossy().to_string();
    let raw_exec = fields.get("Exec").cloned().unwrap_or_default();
    let (exec, flatpak_id) = extract_exec(&raw_exec);
    Some(AppEntry {
        id,
        name: fields.get("Name").cloned().unwrap_or_default(),
        exec,
        icon: fields.get("Icon").cloned().unwrap_or_default(),
        source: path.to_string_lossy().to_string(),
        flatpak_id,
    })
}

/// Exec satırından çalıştırılabilir adını (ve varsa flatpak kimliğini) çıkarır.
fn extract_exec(raw: &str) -> (String, Option<String>) {
    let tokens: Vec<&str> = raw.split_whitespace().collect();

    // "flatpak run [--flags] com.example.App" biçimi
    if let Some(pos) = tokens
        .iter()
        .position(|t| t.rsplit('/').next() == Some("flatpak"))
    {
        if tokens.get(pos + 1).copied() == Some("run") {
            for t in tokens.iter().skip(pos + 2) {
                if t.starts_with('-') || t.starts_with('%') {
                    continue;
                }
                let id = t.split('@').next().unwrap_or(t).to_string();
                let last = id.rsplit('.').next().unwrap_or(&id).to_lowercase();
                return (last, Some(id));
            }
        }
    }

    let mut iter = tokens.iter().filter(|t| !t.starts_with('%'));
    let mut first = iter.next().copied().unwrap_or("");
    if first == "env" {
        // env VAR=değer ... gerçek-komut
        for t in iter {
            if !t.contains('=') {
                first = t;
                break;
            }
        }
    }
    let bin = first
        .trim_matches('"')
        .rsplit('/')
        .next()
        .unwrap_or(first)
        .to_string();
    (bin, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exec_plain_binary() {
        assert_eq!(extract_exec("firefox %u").0, "firefox");
    }

    #[test]
    fn exec_with_path() {
        assert_eq!(extract_exec("/usr/bin/gnome-builder --new").0, "gnome-builder");
    }

    #[test]
    fn exec_env_prefix() {
        assert_eq!(extract_exec("env FOO=1 mycmd --opt").0, "mycmd");
    }

    #[test]
    fn exec_flatpak() {
        let (bin, id) = extract_exec(
            "/usr/bin/flatpak run --branch=stable --arch=x86_64 com.spotify.Client @@u %U @@",
        );
        assert_eq!(bin, "client");
        assert_eq!(id.as_deref(), Some("com.spotify.Client"));
    }
}
