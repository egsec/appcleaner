export interface AppEntry {
  id: string;
  name: string;
  exec: string;
  icon: string;
  source: string;
  flatpak_id: string | null;
}

export interface LeftoverItem {
  path: string;
  category: string;
  is_dir: boolean;
  size_bytes: number;
  modified: number | null;
  confidence: number;
  matched_on: string;
}

export interface DeleteResult {
  path: string;
  ok: boolean;
  dry_run: boolean;
  freed_bytes: number;
  error: string | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  config: "Yapılandırma",
  cache: "Önbellek",
  data: "Veri",
  state: "Durum",
  flatpak: "Flatpak",
  systemd: "Systemd birimi",
  autostart: "Otomatik başlatma",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(unixSeconds: number | null): string {
  if (unixSeconds === null) return "—";
  return new Date(unixSeconds * 1000).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
