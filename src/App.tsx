import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppEntry, DeleteResult, LeftoverItem } from "./types";
import { CATEGORY_LABELS, formatBytes, formatDate } from "./types";

function confidenceColor(c: number): string {
  if (c >= 0.9) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (c >= 0.8) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
}

export default function App() {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<AppEntry | null>(null);
  const [leftovers, setLeftovers] = useState<LeftoverItem[]>([]);
  const [loadingLeftovers, setLoadingLeftovers] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [results, setResults] = useState<DeleteResult[] | null>(null);

  useEffect(() => {
    invoke<AppEntry[]>("scan_apps")
      .then(setApps)
      .catch((e) => setScanError(String(e)));
  }, []);

  const filteredApps = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.exec.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [apps, filter]);

  async function selectApp(app: AppEntry) {
    setSelected(app);
    setChecked(new Set());
    setResults(null);
    setLoadingLeftovers(true);
    try {
      const items = await invoke<LeftoverItem[]>("find_leftovers", { app });
      setLeftovers(items);
    } catch (e) {
      setScanError(String(e));
      setLeftovers([]);
    } finally {
      setLoadingLeftovers(false);
    }
  }

  function toggle(path: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleAll() {
    setChecked((prev) =>
      prev.size === leftovers.length
        ? new Set()
        : new Set(leftovers.map((l) => l.path)),
    );
  }

  const selectedItems = leftovers.filter((l) => checked.has(l.path));
  const selectedSize = selectedItems.reduce((s, l) => s + l.size_bytes, 0);

  async function runDelete() {
    setDeleting(true);
    try {
      const res = await invoke<DeleteResult[]>("delete_paths", {
        paths: selectedItems.map((l) => l.path),
        dryRun,
      });
      setResults(res);
      setModalOpen(false);
      if (!dryRun && selected) {
        // gerçek silme sonrası listeyi tazele
        const items = await invoke<LeftoverItem[]>("find_leftovers", {
          app: selected,
        });
        setLeftovers(items);
        setChecked(new Set());
      }
    } catch (e) {
      setScanError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Üst çubuk */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧹</span>
          <h1 className="text-lg font-semibold">AppCleaner</h1>
          <span className="text-xs text-zinc-500">
            Linux uygulama artıkları temizleyici
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <span className={dryRun ? "text-emerald-400" : "text-zinc-400"}>
            Dry-run {dryRun ? "açık" : "kapalı"}
          </span>
          <button
            role="switch"
            aria-checked={dryRun}
            onClick={() => setDryRun(!dryRun)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              dryRun ? "bg-emerald-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                dryRun ? "left-5.5" : "left-0.5"
              }`}
            />
          </button>
        </label>
      </header>

      {scanError && (
        <div className="border-b border-red-900 bg-red-950/60 px-4 py-2 text-sm text-red-300">
          Hata: {scanError}
          <button
            className="ml-3 underline"
            onClick={() => setScanError(null)}
          >
            kapat
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Sol: uygulama listesi */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
          <div className="p-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Uygulama ara…"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredApps.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">
                {apps.length === 0
                  ? "Hiç uygulama bulunamadı. .desktop dizinleri boş olabilir."
                  : "Aramayla eşleşen uygulama yok."}
              </p>
            )}
            {filteredApps.map((app) => (
              <button
                key={app.id + app.source}
                onClick={() => selectApp(app)}
                className={`block w-full px-4 py-2 text-left hover:bg-zinc-900 ${
                  selected?.id === app.id ? "bg-zinc-900" : ""
                }`}
              >
                <div className="truncate text-sm font-medium">{app.name}</div>
                <div className="truncate text-xs text-zinc-500">
                  {app.exec || app.id}
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
            {apps.length} uygulama bulundu
          </div>
        </aside>

        {/* Sağ: artıklar */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-zinc-500">
              Soldan bir uygulama seçin; artık dosyaları burada listelenecek.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h2 className="font-semibold">{selected.name}</h2>
                  <p className="text-xs text-zinc-500">
                    {selected.id} · {selected.source}
                  </p>
                </div>
                {leftovers.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-900"
                  >
                    {checked.size === leftovers.length
                      ? "Tümünü bırak"
                      : "Tümünü seç"}
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loadingLeftovers ? (
                  <p className="px-4 py-6 text-sm text-zinc-500">
                    Taranıyor…
                  </p>
                ) : leftovers.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-zinc-500">
                    Bu uygulama için artık dosya bulunamadı. 🎉
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-950 text-left text-xs text-zinc-500">
                      <tr>
                        <th className="w-8 px-4 py-2"></th>
                        <th className="py-2">Yol</th>
                        <th className="py-2">Kategori</th>
                        <th className="py-2 text-right">Boyut</th>
                        <th className="px-3 py-2">Değişme</th>
                        <th className="px-3 py-2">Güven</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leftovers.map((item) => (
                        <tr
                          key={item.path}
                          onClick={() => toggle(item.path)}
                          className="cursor-pointer border-t border-zinc-900 hover:bg-zinc-900/60"
                        >
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={checked.has(item.path)}
                              onChange={() => toggle(item.path)}
                              onClick={(e) => e.stopPropagation()}
                              className="accent-emerald-500"
                            />
                          </td>
                          <td className="max-w-0 truncate py-2 pr-2 font-mono text-xs">
                            {item.path}
                            {item.is_dir ? "/" : ""}
                          </td>
                          <td className="whitespace-nowrap py-2 pr-2 text-xs text-zinc-400">
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </td>
                          <td className="whitespace-nowrap py-2 text-right text-xs">
                            {formatBytes(item.size_bytes)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">
                            {formatDate(item.modified)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              title={`Eşleşme: ${item.matched_on}`}
                              className={`inline-block rounded border px-1.5 py-0.5 text-xs ${confidenceColor(item.confidence)}`}
                            >
                              %{Math.round(item.confidence * 100)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {results && (
                  <div className="m-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                    <h3 className="mb-2 text-sm font-semibold">
                      {results[0]?.dry_run
                        ? "Dry-run sonucu (hiçbir şey silinmedi)"
                        : "Silme sonucu"}
                    </h3>
                    <ul className="space-y-1 text-xs">
                      {results.map((r) => (
                        <li key={r.path} className="flex items-center gap-2">
                          <span>{r.ok ? "✅" : "❌"}</span>
                          <span className="truncate font-mono">{r.path}</span>
                          <span className="ml-auto whitespace-nowrap text-zinc-400">
                            {r.ok
                              ? `${formatBytes(r.freed_bytes)}${r.dry_run ? " (silinecek)" : " boşaltıldı"}`
                              : r.error}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-zinc-400">
                      Toplam:{" "}
                      {formatBytes(
                        results
                          .filter((r) => r.ok)
                          .reduce((s, r) => s + r.freed_bytes, 0),
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Alt çubuk */}
              <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
                <span className="text-sm text-zinc-400">
                  {checked.size} öğe seçili · {formatBytes(selectedSize)}
                </span>
                <button
                  disabled={checked.size === 0}
                  onClick={() => setModalOpen(true)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                    checked.size === 0
                      ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                      : dryRun
                        ? "bg-emerald-600 hover:bg-emerald-500"
                        : "bg-red-600 hover:bg-red-500"
                  }`}
                >
                  {dryRun ? "Dry-run önizleme" : "Sil"}
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Onay modalı */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold">
              {dryRun ? "Dry-run önizleme" : "Silme onayı"}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              {checked.size} öğe · toplam {formatBytes(selectedSize)}
            </p>
            {dryRun ? (
              <p className="mt-3 rounded-md border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
                Dry-run modu açık — hiçbir dosya silinmeyecek, yalnızca ne
                silineceği raporlanacak.
              </p>
            ) : (
              <p className="mt-3 rounded-md border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                ⚠️ Bu işlem <strong>geri alınamaz</strong>! Seçilen dosya ve
                klasörler kalıcı olarak silinecek.
              </p>
            )}
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
              {selectedItems.map((l) => (
                <li key={l.path} className="flex gap-2">
                  <span className="truncate font-mono">{l.path}</span>
                  <span className="ml-auto whitespace-nowrap text-zinc-500">
                    {formatBytes(l.size_bytes)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-zinc-700 px-4 py-1.5 text-sm hover:bg-zinc-800"
              >
                Vazgeç
              </button>
              <button
                onClick={runDelete}
                disabled={deleting}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  dryRun
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-red-600 hover:bg-red-500"
                } ${deleting ? "opacity-60" : ""}`}
              >
                {deleting
                  ? "Çalışıyor…"
                  : dryRun
                    ? "Dry-run başlat"
                    : "Evet, kalıcı olarak sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
