//! Temel akışın uçtan uca testi: tara → eşleştir → dry-run → gerçek silme.
//! Ortam değişkenleriyle sahte bir ev dizini kullanır; ayrı süreçte koştuğu
//! için birim testlerdeki env kullanımıyla çakışmaz.

use appcleaner_lib::{deleter, desktop, leftovers};
use std::fs;

#[test]
fn full_flow_scan_match_dryrun_delete() {
    let base = std::env::temp_dir().join(format!("appcleaner-flow-{}", std::process::id()));
    let home = base.join("home");
    let apps = base.join("apps");
    fs::create_dir_all(&apps).unwrap();
    fs::create_dir_all(home.join(".config/vlc")).unwrap();
    fs::write(home.join(".config/vlc/vlcrc"), b"data").unwrap();
    fs::create_dir_all(home.join(".cache/vlc")).unwrap();
    fs::write(home.join(".cache/vlc/art.bin"), vec![0u8; 2048]).unwrap();
    fs::write(
        apps.join("vlc.desktop"),
        "[Desktop Entry]\nType=Application\nName=VLC media player\nExec=/usr/bin/vlc %U\nIcon=vlc\n",
    )
    .unwrap();

    std::env::set_var("APPCLEANER_HOME", &home);
    std::env::set_var("APPCLEANER_APP_DIRS", &apps);

    // 1) uygulamaları tara
    let found = desktop::scan_apps();
    assert_eq!(found.len(), 1);
    let app = &found[0];
    assert_eq!(app.name, "VLC media player");
    assert_eq!(app.exec, "vlc");

    // 2) artıkları bul
    let items = leftovers::find_leftovers(app);
    let paths: Vec<String> = items.iter().map(|i| i.path.clone()).collect();
    assert_eq!(items.len(), 2, "bulunan yollar: {paths:?}");
    assert!(items.iter().all(|i| i.confidence >= 0.99));
    assert!(items.iter().any(|i| i.category == "config"));
    assert!(items
        .iter()
        .any(|i| i.category == "cache" && i.size_bytes == 2048));
    assert!(items.iter().all(|i| i.modified.is_some()));

    // 3) dry-run: rapor üretmeli ama hiçbir şey silmemeli
    let res = deleter::delete_paths(paths.clone(), true);
    assert!(res.iter().all(|r| r.ok && r.dry_run && r.freed_bytes > 0));
    assert!(home.join(".config/vlc/vlcrc").exists());
    assert!(home.join(".cache/vlc/art.bin").exists());

    // 4) gerçek silme
    let res = deleter::delete_paths(paths, false);
    assert!(res.iter().all(|r| r.ok), "{res:?}");
    assert!(!home.join(".config/vlc").exists());
    assert!(!home.join(".cache/vlc").exists());

    // 5) izin verilen kökler dışındaki yol reddedilmeli
    let outside = base.join("apps").join("vlc.desktop");
    let res = deleter::delete_paths(vec![outside.to_string_lossy().to_string()], false);
    assert!(!res[0].ok);
    assert!(outside.exists());

    fs::remove_dir_all(&base).ok();
}
