import { invoke } from "@tauri-apps/api/core";
import type { AppEntry, DeleteResult, LeftoverItem } from "./types";

// Tauri dışında (tarayıcı önizlemesi) çalışırken gerçek backend yoktur;
// arayüzü gösterebilmek için örnek veri döndürülür.
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const demoApps: AppEntry[] = [
  { id: "org.videolan.VLC", name: "VLC media player", exec: "vlc", icon: "vlc", source: "/usr/share/applications/vlc.desktop", flatpak_id: null },
  { id: "org.gnome.Builder", name: "GNOME Builder", exec: "gnome-builder", icon: "builder", source: "/usr/share/applications/org.gnome.Builder.desktop", flatpak_id: null },
  { id: "com.spotify.Client", name: "Spotify", exec: "spotify", icon: "spotify", source: "/var/lib/flatpak/exports/share/applications/com.spotify.Client.desktop", flatpak_id: "com.spotify.Client" },
  { id: "firefox", name: "Firefox", exec: "firefox", icon: "firefox", source: "/usr/share/applications/firefox.desktop", flatpak_id: null },
];

const demoLeftovers: LeftoverItem[] = [
  { path: "~/.config/vlc", category: "config", is_dir: true, size_bytes: 48_128, modified: 1750000000, confidence: 1.0, matched_on: "exec: vlc" },
  { path: "~/.cache/vlc", category: "cache", is_dir: true, size_bytes: 3_407_872, modified: 1751200000, confidence: 1.0, matched_on: "exec: vlc" },
  { path: "~/.local/share/vlc", category: "data", is_dir: true, size_bytes: 12_288, modified: 1749000000, confidence: 1.0, matched_on: "exec: vlc" },
  { path: "~/.config/autostart/vlc-autostart.desktop", category: "autostart", is_dir: false, size_bytes: 214, modified: 1748000000, confidence: 0.83, matched_on: "exec: vlc" },
];

export async function scanApps(): Promise<AppEntry[]> {
  if (!inTauri) return demoApps;
  return invoke<AppEntry[]>("scan_apps");
}

export async function findLeftovers(app: AppEntry): Promise<LeftoverItem[]> {
  if (!inTauri) return demoLeftovers;
  return invoke<LeftoverItem[]>("find_leftovers", { app });
}

export async function deletePaths(
  paths: string[],
  dryRun: boolean,
): Promise<DeleteResult[]> {
  if (!inTauri) {
    return paths.map((p) => ({
      path: p,
      ok: true,
      dry_run: dryRun,
      freed_bytes: demoLeftovers.find((l) => l.path === p)?.size_bytes ?? 0,
      error: null,
    }));
  }
  return invoke<DeleteResult[]>("delete_paths", { paths, dryRun });
}
