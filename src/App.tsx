import { useEffect, useMemo, useRef, useState } from "react";
import { deletePaths, findLeftovers, scanApps } from "./backend";
import type { AppEntry, DeleteResult, LeftoverItem } from "./types";
import { CATEGORY_LABELS, formatBytes, formatDate } from "./types";

function BroomGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <path
        d="M34 8 L26 24"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M21 24 h9 l-2 13 l-14 -5 z"
        fill="currentColor"
        opacity="0.9"
      />
      <circle cx="35" cy="31" r="1.6" fill="currentColor" opacity="0.7" />
      <circle cx="32" cy="38" r="1.2" fill="currentColor" opacity="0.5" />
      <circle cx="40" cy="37" r="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function confidenceColor(c: number): string {
  if (c >= 0.9) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (c >= 0.8) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-zinc-50 text-zinc-600 border-zinc-200";
}

export default function App() {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AppEntry | null>(null);
  const [leftovers, setLeftovers] = useState<LeftoverItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [results, setResults] = useState<DeleteResult[] | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scanApps().then(setApps).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.exec.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [apps, query]);

  async function selectApp(app: AppEntry) {
    setSearchOpen(false);
    setQuery("");
    setSelected(app);
    setChecked(new Set());
    setResults(null);
    setLoading(true);
    try {
      setLeftovers(await findLeftovers(app));
    } catch (e) {
      setError(String(e));
      setLeftovers([]);
    } finally {
      setLoading(false);
    }
  }

  function goHome() {
    setSelected(null);
    setLeftovers([]);
    setChecked(new Set());
    setResults(null);
  }

  function toggle(path: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const selectedItems = leftovers.filter((l) => checked.has(l.path));
  const selectedSize = selectedItems.reduce((s, l) => s + l.size_bytes, 0);

  async function runDelete() {
    setDeleting(true);
    try {
      const res = await deletePaths(
        selectedItems.map((l) => l.path),
        dryRun,
      );
      setResults(res);
      setModalOpen(false);
      if (!dryRun && selected) {
        setLeftovers(await findLeftovers(selected));
        setChecked(new Set());
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Başlık çubuğu */}
      <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-zinc-200 bg-[#f7f7f8]">
        <span className="text-sm font-semibold text-zinc-600">AppCleaner</span>
        <button
          onClick={() => setSearchOpen(true)}
          title="Uygulama ara (Ctrl+F)"
          className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-zinc-700"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13.5 13.5 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {selected && (
          <button
            onClick={goHome}
            title="Geri"
            className="absolute left-3 flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-zinc-700"
          >
            ‹
          </button>
        )}
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>Hata: {error}</span>
          <button className="underline" onClick={() => setError(null)}>
            kapat
          </button>
        </div>
      )}

      {/* Ana içerik */}
      {!selected ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-white">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-40 w-40 items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 text-zinc-300 transition-colors hover:border-teal-400 hover:text-teal-400"
          >
            <BroomGlyph className="h-20 w-20" />
          </button>
          <p className="text-2xl font-light text-zinc-500">
            Uygulamanızı <span className="font-semibold text-zinc-700">arayın</span>.
          </p>
          <p className="-mt-6 text-sm text-zinc-400">
            Kutuya veya sağ üstteki büyütece tıklayın · {apps.length} uygulama bulundu
          </p>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col bg-white">
          <div className="border-b border-zinc-100 px-6 py-4">
            <h2 className="font-semibold">{selected.name}</h2>
            <p className="truncate text-xs text-zinc-400">{selected.source}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {loading ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-400">Taranıyor…</p>
            ) : leftovers.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-400">
                Artık dosya bulunamadı. 🎉
              </p>
            ) : (
              <>
                <div className="flex justify-end px-3 pb-1">
                  <button
                    onClick={() =>
                      setChecked(
                        checked.size === leftovers.length
                          ? new Set()
                          : new Set(leftovers.map((l) => l.path)),
                      )
                    }
                    className="text-xs text-teal-600 hover:underline"
                  >
                    {checked.size === leftovers.length ? "Tümünü bırak" : "Tümünü seç"}
                  </button>
                </div>
                <ul>
                  {leftovers.map((item) => (
                    <li key={item.path}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={checked.has(item.path)}
                          onChange={() => toggle(item.path)}
                          className="h-4 w-4 accent-teal-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-xs text-zinc-700">
                            {item.path}
                            {item.is_dir ? "/" : ""}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {CATEGORY_LABELS[item.category] ?? item.category} ·{" "}
                            {formatDate(item.modified)}
                          </span>
                        </span>
                        <span
                          title={`Eşleşme: ${item.matched_on}`}
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-xs ${confidenceColor(item.confidence)}`}
                        >
                          %{Math.round(item.confidence * 100)}
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs text-zinc-500">
                          {formatBytes(item.size_bytes)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {results && (
              <div className="mx-3 my-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-700">
                  {results[0]?.dry_run
                    ? "Dry-run sonucu — hiçbir şey silinmedi"
                    : "Silme sonucu"}
                </h3>
                <ul className="space-y-1 text-xs">
                  {results.map((r) => (
                    <li key={r.path} className="flex items-center gap-2">
                      <span>{r.ok ? "✅" : "❌"}</span>
                      <span className="truncate font-mono text-zinc-600">{r.path}</span>
                      <span className="ml-auto whitespace-nowrap text-zinc-400">
                        {r.ok
                          ? `${formatBytes(r.freed_bytes)}${r.dry_run ? " silinecek" : " boşaltıldı"}`
                          : r.error}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Alt çubuk */}
          <footer className="flex items-center justify-between border-t border-zinc-200 bg-[#f7f7f8] px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={() => setDryRun(!dryRun)}
                className="h-3.5 w-3.5 accent-teal-600"
              />
              Dry-run (önce silmeden raporla)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">
                {checked.size} öğe · {formatBytes(selectedSize)}
              </span>
              <button
                disabled={checked.size === 0}
                onClick={() => setModalOpen(true)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium shadow-sm ${
                  checked.size === 0
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-400"
                    : dryRun
                      ? "bg-teal-600 text-white hover:bg-teal-500"
                      : "bg-red-600 text-white hover:bg-red-500"
                }`}
              >
                {dryRun ? "Önizle" : "Sil"}
              </button>
            </div>
          </footer>
        </main>
      )}

      {/* Arama paneli */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/20 pt-20"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Uygulama adı, komut ya da kimlik…"
              className="w-full border-b border-zinc-100 px-4 py-3 text-sm outline-none"
            />
            <ul className="max-h-72 overflow-y-auto py-1">
              {matches.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-zinc-400">
                  {apps.length === 0 ? "Hiç uygulama bulunamadı." : "Eşleşme yok."}
                </li>
              )}
              {matches.slice(0, 50).map((app) => (
                <li key={app.id + app.source}>
                  <button
                    onClick={() => selectApp(app)}
                    className="flex w-full items-baseline gap-2 px-4 py-2 text-left hover:bg-teal-50"
                  >
                    <span className="text-sm font-medium text-zinc-700">{app.name}</span>
                    <span className="truncate text-xs text-zinc-400">
                      {app.exec || app.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Onay modalı */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-800">
              {dryRun ? "Dry-run önizleme" : "Silme onayı"}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {checked.size} öğe · toplam {formatBytes(selectedSize)}
            </p>
            {dryRun ? (
              <p className="mt-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                Dry-run modu açık — hiçbir dosya silinmeyecek, yalnızca ne
                silineceği raporlanacak.
              </p>
            ) : (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                ⚠️ Bu işlem <strong>geri alınamaz</strong>! Seçilen dosya ve
                klasörler kalıcı olarak silinecek.
              </p>
            )}
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
              {selectedItems.map((l) => (
                <li key={l.path} className="flex gap-2">
                  <span className="truncate font-mono text-zinc-600">{l.path}</span>
                  <span className="ml-auto whitespace-nowrap text-zinc-400">
                    {formatBytes(l.size_bytes)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Vazgeç
              </button>
              <button
                onClick={runDelete}
                disabled={deleting}
                className={`rounded-md px-4 py-1.5 text-sm font-medium text-white ${
                  dryRun ? "bg-teal-600 hover:bg-teal-500" : "bg-red-600 hover:bg-red-500"
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
