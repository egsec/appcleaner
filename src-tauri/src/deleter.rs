use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct DeleteResult {
    pub path: String,
    pub ok: bool,
    pub dry_run: bool,
    pub freed_bytes: u64,
    pub error: Option<String>,
}

fn allowed_roots() -> Vec<PathBuf> {
    crate::leftovers::search_roots()
        .into_iter()
        .map(|r| r.path)
        .collect()
}

/// Yol, izin verilen köklerden birinin İÇİNDE olmalı (kökün kendisi değil)
/// ve ".." / "." bileşeni içermemeli.
fn is_within_allowed(path: &Path) -> bool {
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return false;
    }
    allowed_roots()
        .iter()
        .any(|root| path.starts_with(root) && path != root.as_path())
}

pub fn delete_paths(paths: Vec<String>, dry_run: bool) -> Vec<DeleteResult> {
    paths
        .into_iter()
        .map(|p| delete_one(p, dry_run))
        .collect()
}

fn delete_one(p: String, dry_run: bool) -> DeleteResult {
    let path = PathBuf::from(&p);
    if !is_within_allowed(&path) {
        return DeleteResult {
            path: p,
            ok: false,
            dry_run,
            freed_bytes: 0,
            error: Some("Yol izin verilen kökler dışında; güvenlik nedeniyle atlandı".into()),
        };
    }
    let meta = match fs::symlink_metadata(&path) {
        Ok(m) => m,
        Err(e) => {
            return DeleteResult {
                path: p,
                ok: false,
                dry_run,
                freed_bytes: 0,
                error: Some(format!("Erişilemedi: {e}")),
            }
        }
    };
    let size = if meta.is_dir() {
        crate::leftovers::dir_size(&path)
    } else {
        meta.len()
    };
    if dry_run {
        return DeleteResult { path: p, ok: true, dry_run, freed_bytes: size, error: None };
    }
    let res = if meta.is_dir() {
        fs::remove_dir_all(&path)
    } else {
        // symlink dahil tekil dosyalar
        fs::remove_file(&path)
    };
    match res {
        Ok(()) => DeleteResult { path: p, ok: true, dry_run, freed_bytes: size, error: None },
        Err(e) => DeleteResult {
            path: p,
            ok: false,
            dry_run,
            freed_bytes: 0,
            error: Some(e.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_dir_traversal() {
        // Kök içinde görünse bile ".." içeren yollar reddedilmeli
        std::env::set_var("APPCLEANER_HOME", if cfg!(windows) { "C:\\fakehome" } else { "/fakehome" });
        let base = crate::home_dir().unwrap();
        let evil = base.join(".config").join("..").join(".ssh");
        assert!(!is_within_allowed(&evil));
        std::env::remove_var("APPCLEANER_HOME");
    }

    #[test]
    fn rejects_root_itself() {
        std::env::set_var("APPCLEANER_HOME", if cfg!(windows) { "C:\\fakehome" } else { "/fakehome" });
        let base = crate::home_dir().unwrap();
        assert!(!is_within_allowed(&base.join(".config")));
        assert!(is_within_allowed(&base.join(".config").join("someapp")));
        std::env::remove_var("APPCLEANER_HOME");
    }
}
