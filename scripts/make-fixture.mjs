// Windows/Linux fark etmeksizin uygulamayı elle test etmek için sahte bir
// Linux ev dizini ve .desktop dizini üretir. Kullanım:
//   node scripts/make-fixture.mjs
// sonra çıktıdaki ortam değişkenleriyle `npm run tauri dev` başlatın.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fx = join(root, "fixture");
const home = join(fx, "home");
const apps = join(fx, "apps");

function file(path, content = "") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// --- .desktop girdileri ---
file(
  join(apps, "firefox.desktop"),
  `[Desktop Entry]
Type=Application
Name=Firefox
Exec=/usr/bin/firefox %u
Icon=firefox
`,
);
file(
  join(apps, "org.gnome.Builder.desktop"),
  `[Desktop Entry]
Type=Application
Name=GNOME Builder
Exec=gnome-builder %F
Icon=org.gnome.Builder
`,
);
file(
  join(apps, "com.spotify.Client.desktop"),
  `[Desktop Entry]
Type=Application
Name=Spotify
Exec=/usr/bin/flatpak run --branch=stable --arch=x86_64 com.spotify.Client @@u %U @@
Icon=com.spotify.Client
`,
);
file(
  join(apps, "vlc.desktop"),
  `[Desktop Entry]
Type=Application
Name=VLC media player
Exec=/usr/bin/vlc --started-from-file %U
Icon=vlc
`,
);
file(
  join(apps, "hidden-tool.desktop"),
  `[Desktop Entry]
Type=Application
Name=Gizli Araç
Exec=hidden-tool
NoDisplay=true
`,
);

// --- artık dosyalar ---
const junk = "x".repeat(4096);
// vlc
file(join(home, ".config", "vlc", "vlcrc"), junk);
file(join(home, ".cache", "vlc", "art", "cover.jpg"), junk.repeat(8));
file(join(home, ".local", "share", "vlc", "ml.xspf"), junk);
file(join(home, ".local", "state", "vlc", "history.txt"), "geçmiş");
file(join(home, ".config", "autostart", "vlc-autostart.desktop"), "[Desktop Entry]\nType=Application\n");
// gnome-builder
file(join(home, ".config", "gnome-builder", "settings.ini"), junk);
file(join(home, ".cache", "gnome-builder", "index.db"), junk.repeat(16));
file(join(home, ".config", "systemd", "user", "gnome-builder-daemon.service"), "[Unit]\nDescription=test\n");
// spotify (flatpak)
file(join(home, ".var", "app", "com.spotify.Client", "config", "spotify", "prefs"), junk);
file(join(home, ".var", "app", "com.spotify.Client", "cache", "storage.bin"), junk.repeat(32));
file(join(home, ".config", "systemd", "user", "spotifyd.service"), "[Unit]\nDescription=spotifyd\n");
// firefox
file(join(home, ".cache", "firefox", "cache2.bin"), junk.repeat(4));
// eşleşmemesi gereken gürültü
file(join(home, ".config", "dconf", "user"), junk);
file(join(home, ".cache", "thumbnails", "normal", "a.png"), junk);
file(join(home, ".local", "share", "applications", "yerel.desktop"), "[Desktop Entry]\nType=Application\nName=Yerel\nExec=yerel\n");

const sep = process.platform === "win32" ? ";" : ":";
console.log("Fikstür hazır. Test için:");
if (process.platform === "win32") {
  console.log(`  $env:APPCLEANER_HOME = "${home}"`);
  console.log(`  $env:APPCLEANER_APP_DIRS = "${apps}${sep}${join(home, ".local", "share", "applications")}"`);
} else {
  console.log(`  export APPCLEANER_HOME="${home}"`);
  console.log(`  export APPCLEANER_APP_DIRS="${apps}${sep}${join(home, ".local", "share", "applications")}"`);
}
console.log("  npm run tauri dev");
