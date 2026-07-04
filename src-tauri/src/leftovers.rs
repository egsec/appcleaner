use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::desktop::AppEntry;

/// Eşleşme eşiği: bunun altındaki güven skorları listelenmez.
const CONFIDENCE_THRESHOLD: f64 = 0.72;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeftoverItem {
    pub path: String,
    pub category: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    /// Unix saniye cinsinden son değişiklik zamanı
    pub modified: Option<i64>,
    /// 0..1 arası güven skoru
    pub confidence: f64,
    /// Hangi adayla eşleşti (id, isim, exec, flatpak-id)
    pub matched_on: String,
}

pub struct SearchRoot {
    pub category: &'static str,
    pub path: PathBuf,
}

/// Artık dosya aranan (ve silmeye izin verilen) kök dizinler.
pub fn search_roots() -> Vec<SearchRoot> {
    let mut roots = Vec::new();
    if let Some(home) = crate::home_dir() {
        roots.push(SearchRoot { category: "config", path: home.join(".config") });
        roots.push(SearchRoot { category: "cache", path: home.join(".cache") });
        roots.push(SearchRoot { category: "data", path: home.join(".local/share") });
        roots.push(SearchRoot { category: "state", path: home.join(".local/state") });
        roots.push(SearchRoot { category: "flatpak", path: home.join(".var/app") });
        roots.push(SearchRoot { category: "autostart", path: home.join(".config/autostart") });
        roots.push(SearchRoot { category: "systemd", path: home.join(".config/systemd/user") });
        roots.push(SearchRoot { category: "systemd", path: home.join(".local/share/systemd/user") });
    }
    roots
}

struct Candidate {
    label: String,
    norm: String,
}

fn normalize(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Çok kısa ya da jenerik adaylar yanlış pozitif üretir; ele.
fn is_generic(norm: &str) -> bool {
    norm.len() < 3
        || matches!(
            norm,
            "app" | "bin" | "run" | "env" | "usr" | "the" | "gnu" | "org" | "com" | "net" | "exe" | "sh"
        )
}

fn build_candidates(app: &AppEntry) -> Vec<Candidate> {
    let mut raw: Vec<(&str, String)> = vec![
        ("id", app.id.clone()),
        ("isim", app.name.clone()),
        ("exec", app.exec.clone()),
    ];
    // Ters-DNS kimliğin son parçası (org.gnome.Builder → builder)
    if app.id.contains('.') {
        if let Some(last) = app.id.rsplit('.').next() {
            raw.push(("id-son", last.to_string()));
        }
    }
    if let Some(fid) = &app.flatpak_id {
        raw.push(("flatpak-id", fid.clone()));
    }

    let mut seen = HashSet::new();
    let mut cands = Vec::new();
    for (label, value) in raw.drain(..) {
        let norm = normalize(&value);
        if is_generic(&norm) || !seen.insert(norm.clone()) {
            continue;
        }
        cands.push(Candidate { label: format!("{label}: {value}"), norm });
    }
    cands
}

/// İki normalize edilmiş ad arasında 0..1 benzerlik skoru.
fn score(entry_norm: &str, cand_norm: &str) -> f64 {
    if entry_norm.is_empty() || cand_norm.is_empty() {
        return 0.0;
    }
    if entry_norm == cand_norm {
        return 1.0;
    }
    let (shorter, longer) = if entry_norm.len() <= cand_norm.len() {
        (entry_norm, cand_norm)
    } else {
        (cand_norm, entry_norm)
    };
    if shorter.len() >= 4 && longer.contains(shorter) {
        let ratio = shorter.len() as f64 / longer.len() as f64;
        return (0.75 + 0.2 * ratio).min(0.95);
    }
    strsim::jaro_winkler(entry_norm, cand_norm)
}

pub fn find_leftovers(app: &AppEntry) -> Vec<LeftoverItem> {
    let cands = build_candidates(app);
    let mut seen_paths = HashSet::new();
    let mut items = Vec::new();

    for root in search_roots() {
        let Ok(rd) = fs::read_dir(&root.path) else { continue };
        for entry in rd.flatten() {
            let path = entry.path();
            if !seen_paths.insert(path.clone()) {
                continue;
            }
            let fname = entry.file_name().to_string_lossy().to_string();
            let Ok(ft) = entry.file_type() else { continue };
            // Dosyalarda uzantıyı atarak eşleştir (foo.service → foo)
            let stem = if ft.is_dir() {
                fname.clone()
            } else {
                Path::new(&fname)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or(fname.clone())
            };
            let entry_norm = normalize(&stem);

            let mut best = 0.0_f64;
            let mut matched = String::new();
            for c in &cands {
                let s = score(&entry_norm, &c.norm);
                if s > best {
                    best = s;
                    matched = c.label.clone();
                }
            }
            if best < CONFIDENCE_THRESHOLD {
                continue;
            }

            let meta = entry.metadata().ok();
            let is_dir = ft.is_dir();
            let size = if is_dir {
                dir_size(&path)
            } else {
                meta.as_ref().map(|m| m.len()).unwrap_or(0)
            };
            let modified = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);

            items.push(LeftoverItem {
                path: path.to_string_lossy().to_string(),
                category: root.category.to_string(),
                is_dir,
                size_bytes: size,
                modified,
                confidence: (best * 100.0).round() / 100.0,
                matched_on: matched,
            });
        }
    }

    items.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.size_bytes.cmp(&a.size_bytes))
    });
    items
}

/// Sembolik bağlantıları izlemeden özyinelemeli dizin boyutu.
pub fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let Ok(rd) = fs::read_dir(path) else { return 0 };
    for entry in rd.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        } else if ft.is_dir() {
            total += dir_size(&entry.path());
        } else if let Ok(meta) = entry.metadata() {
            total += meta.len();
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_scores_one() {
        assert_eq!(score("spotify", "spotify"), 1.0);
    }

    #[test]
    fn reverse_dns_dir_matches_id() {
        // ~/.var/app/com.spotify.Client vs id com.spotify.Client
        assert_eq!(score(&normalize("com.spotify.Client"), &normalize("com.spotify.Client")), 1.0);
    }

    #[test]
    fn containment_scores_high() {
        let s = score("gnomebuilder", "builder");
        assert!(s >= 0.75 && s <= 0.95, "skor: {s}");
    }

    #[test]
    fn unrelated_scores_low() {
        assert!(score("firefox", "libreoffice") < CONFIDENCE_THRESHOLD);
    }

    #[test]
    fn generic_candidates_filtered() {
        let app = AppEntry {
            id: "org.example.App".into(),
            name: "App".into(),
            exec: "sh".into(),
            icon: String::new(),
            source: String::new(),
            flatpak_id: None,
        };
        let cands = build_candidates(&app);
        // "App" ve "sh" jenerik/kısa oldukları için elenmeli; id kalmalı
        assert!(cands.iter().all(|c| c.norm != "app" && c.norm != "sh"));
        assert!(cands.iter().any(|c| c.norm == "orgexampleapp"));
    }
}
