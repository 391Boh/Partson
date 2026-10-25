import { AlertTriangle, ArrowRightLeft, Check, FolderTree, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The products of one 1C group as a table, from the admin "Каталог" tab
// (AdminCatalogPanel.tsx): pick products and move them to another group.
// Data: /api/admin/catalog-groups/products.

export type DialogGroup = { code: string; name: string; path: string[] };
type GroupProduct = { code: string; name: string; article: string; producer: string };
type Result = { tone: "success" | "error"; text: string; skipped?: Array<{ code: string; reason: string }> } | null;

const MOVE_MAX = 500;
const searchKey = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");
const formatCount = (value: number) => value.toLocaleString("uk-UA");

type AuthorizedFetch = (url: string, init?: RequestInit) => Promise<Record<string, unknown>>;

function TargetPicker({
  groups,
  excludeCode,
  value,
  onChange,
}: {
  groups: DialogGroup[];
  excludeCode: string;
  value: DialogGroup | null;
  onChange: (group: DialogGroup | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const key = searchKey(query);
  const matches = useMemo(
    () =>
      groups
        .filter((group) => group.code !== excludeCode && (!key || searchKey([...group.path, group.name].join(" ")).includes(key)))
        .slice(0, 30),
    [groups, excludeCode, key]
  );

  if (value) {
    return (
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-emerald-300/30 bg-emerald-500/10 px-3">
        <FolderTree className="h-4 w-4 shrink-0 text-emerald-200" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-white">
          {value.path.length > 0 && <span className="text-slate-300">{value.path.join(" › ")} › </span>}
          {value.name}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Змінити цільову групу"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1">
      <label className="relative block">
        <span className="sr-only">Цільова група</span>
        <FolderTree className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/75" />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) { event.preventDefault(); onChange(matches[0]); setQuery(""); }
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Куди перенести: почніть вводити назву групи"
          role="combobox"
          aria-expanded={open}
          aria-controls="admin-move-target-list"
          aria-autocomplete="list"
          className="h-11 w-full min-w-0 rounded-[12px] border border-[#2c3d5a] bg-[#0a1220] pl-10 pr-3 text-[16px] font-semibold text-white placeholder:text-[13px] placeholder:font-medium placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none sm:text-[13px]"
        />
      </label>
      {open && (
        <ul
          id="admin-move-target-list"
          role="listbox"
          className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-10 max-h-72 overflow-y-auto overscroll-contain rounded-[14px] border border-white/12 bg-slate-900 p-1 shadow-[0_18px_40px_rgba(2,6,23,0.6)]"
        >
          {matches.length ? (
            matches.map((group) => (
              <li key={group.code} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { onChange(group); setQuery(""); setOpen(false); }}
                  className="block w-full rounded-[10px] px-3 py-2 text-left transition hover:bg-sky-400/15"
                >
                  {group.path.length > 0 && <span className="block truncate text-[10px] font-medium text-slate-300">{group.path.join(" › ")}</span>}
                  <span className="block text-[13px] font-semibold text-white">{group.name}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-[12px] text-slate-300">Групу не знайдено</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function AdminGroupProductsDialog({
  group,
  groups,
  authorizedFetch,
  onClose,
  onMoved,
}: {
  group: DialogGroup;
  groups: DialogGroup[];
  authorizedFetch: AuthorizedFetch;
  onClose: () => void;
  onMoved: (fromCode: string, toCode: string, count: number) => void;
}) {
  const [products, setProducts] = useState<GroupProduct[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<DialogGroup | null>(null);
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const lastClickedRef = useRef<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await authorizedFetch(`/api/admin/catalog-groups/products?code=${encodeURIComponent(group.code)}`);
      setProducts(Array.isArray(data.products) ? (data.products as GroupProduct[]) : []);
      setTruncated(data.truncated === true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не вдалося завантажити товари");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, group.code]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !moving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, moving]);

  const key = searchKey(query);
  const visible = useMemo(
    () =>
      (products ?? []).filter(
        (product) => !key || searchKey(`${product.name} ${product.article} ${product.code} ${product.producer}`).includes(key)
      ),
    [products, key]
  );
  const allVisibleSelected = visible.length > 0 && visible.every((product) => selected.has(product.code));

  const toggle = (code: string, withRange: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      const anchor = lastClickedRef.current;
      if (withRange && anchor && anchor !== code) {
        // Shift+click selects the run between the last click and this one.
        const from = visible.findIndex((product) => product.code === anchor);
        const to = visible.findIndex((product) => product.code === code);
        if (from !== -1 && to !== -1) {
          const shouldSelect = !current.has(code);
          for (const product of visible.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            if (shouldSelect) next.add(product.code);
            else next.delete(product.code);
          }
          return next;
        }
      }
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    lastClickedRef.current = code;
  };

  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const product of visible) {
        if (allVisibleSelected) next.delete(product.code);
        else next.add(product.code);
      }
      return next;
    });
  };

  const move = async () => {
    if (!target || !selected.size || selected.size > MOVE_MAX || moving) return;
    setMoving(true);
    setResult(null);
    try {
      const data = await authorizedFetch("/api/admin/catalog-groups/products", {
        method: "POST",
        body: JSON.stringify({ codes: [...selected], groupCode: target.code }),
      });
      const moved = Array.isArray(data.moved) ? (data.moved as string[]) : [];
      const skipped = Array.isArray(data.skipped) ? (data.skipped as Array<{ code: string; reason: string }>) : [];
      const movedSet = new Set(moved);
      setProducts((current) => current?.filter((product) => !movedSet.has(product.code)) ?? current);
      setSelected(new Set(skipped.map((item) => item.code).filter((code) => selected.has(code))));
      if (moved.length) onMoved(group.code, target.code, moved.length);
      setResult({
        tone: moved.length ? "success" : "error",
        text: moved.length
          ? `Перенесено в «${target.name}»: ${formatCount(moved.length)}${skipped.length ? `, не перенесено: ${formatCount(skipped.length)}` : ""}.`
          : "Жодного товару не перенесено.",
        skipped,
      });
    } catch (error) {
      setResult({ tone: "error", text: error instanceof Error ? error.message : "Не вдалося перенести товари" });
    } finally {
      setMoving(false);
    }
  };

  const tooMany = selected.size > MOVE_MAX;

  return createPortal(
    <div data-admin-overlay data-admin-dialog className="fixed inset-0 z-[1200] flex items-stretch justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-group-products-title"
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden border-white/12 bg-[#0b1424] text-white shadow-[0_30px_80px_rgba(2,6,23,0.7)] sm:h-[min(92vh,900px)] sm:rounded-[22px] sm:border"
      >
        <header className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            {group.path.length > 0 && <p className="truncate text-[11px] font-medium text-slate-300">{group.path.join(" › ")}</p>}
            <h2 id="admin-group-products-title" className="text-[16px] font-bold leading-snug [overflow-wrap:anywhere]">
              {group.name}
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-300">
              {products
                ? `Товарів у групі: ${formatCount(products.length)}${truncated ? " (показано перші 2000)" : ""}`
                : loadError ? "Товари не завантажено" : "Завантаження…"}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={moving}
            aria-label="Закрити"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/12 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-2.5 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Пошук товару</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/75" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Назва, артикул, код або виробник"
              className="h-10 w-full min-w-0 rounded-[12px] border border-[#2c3d5a] bg-[#0a1220] pl-10 pr-3 text-[16px] font-medium text-white placeholder:text-[13px] placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none sm:text-[13px]"
            />
          </label>
          <div className="flex items-center gap-2 text-[12px] text-slate-300">
            <span className="tabular-nums">
              Вибрано: <b className={tooMany ? "text-rose-300" : "text-white"}>{formatCount(selected.size)}</b>
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-[10px] px-2 py-1 font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white"
              >
                Зняти вибір
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || moving}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Оновити
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {loadError && !products ? (
            <div className="px-4 py-10 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-rose-200" />
              <p className="mt-3 text-[13px] font-semibold text-rose-100">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-white/12 bg-white/8 px-4 text-[12px] font-bold transition hover:bg-white/14"
              >
                <RefreshCw className="h-4 w-4" />
                Спробувати ще раз
              </button>
            </div>
          ) : !products ? (
            <div className="space-y-1.5 p-4" aria-busy="true">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-[10px] bg-white/[0.05]" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-300">
              {products.length ? "Нічого не знайдено." : "У цій групі немає товарів."}
            </p>
          ) : (
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[13px]">
              <thead className="sticky top-0 z-[1] bg-[#0e192c]">
                <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-300">
                  <th scope="col" className="w-11 border-b border-white/10 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label={key ? "Вибрати всі знайдені" : "Вибрати всі"}
                      className="h-4 w-4 accent-sky-400"
                    />
                  </th>
                  <th scope="col" className="border-b border-white/10 px-2 py-2 font-bold">Артикул</th>
                  <th scope="col" className="border-b border-white/10 px-2 py-2 font-bold">Назва</th>
                  <th scope="col" className="border-b border-white/10 px-2 py-2 font-bold">Виробник</th>
                  <th scope="col" className="border-b border-white/10 px-2 py-2 pr-4 font-bold">Код</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => {
                  const isSelected = selected.has(product.code);
                  return (
                    <tr
                      key={product.code}
                      onClick={(event) => toggle(product.code, event.shiftKey)}
                      className={`cursor-pointer transition-colors ${isSelected ? "bg-sky-400/[0.12]" : "hover:bg-white/[0.04]"}`}
                    >
                      <td className="border-b border-white/[0.06] px-4 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => toggle(product.code, (event.nativeEvent as MouseEvent).shiftKey === true)}
                          aria-label={`Вибрати «${product.name}»`}
                          className="h-4 w-4 accent-sky-400"
                        />
                      </td>
                      <td className="whitespace-nowrap border-b border-white/[0.06] px-2 py-2 font-semibold tabular-nums text-sky-100">{product.article || "—"}</td>
                      <td className="border-b border-white/[0.06] px-2 py-2 font-medium [overflow-wrap:anywhere]">{product.name}</td>
                      <td className="border-b border-white/[0.06] px-2 py-2 text-slate-300">{product.producer || "—"}</td>
                      <td className="whitespace-nowrap border-b border-white/[0.06] px-2 py-2 pr-4 tabular-nums text-slate-300">{product.code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="space-y-2 border-t border-[#23324b] bg-[#0e192c] px-4 py-3">
          {result && (
            <div
              role={result.tone === "error" ? "alert" : "status"}
              className={`rounded-[12px] border px-3 py-2 text-[12px] font-semibold ${
                result.tone === "success" ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-100" : "border-rose-400/30 bg-rose-500/12 text-rose-100"
              }`}
            >
              <p className="flex items-start gap-2">
                {result.tone === "success" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{result.text}</span>
              </p>
              {result.skipped && result.skipped.length > 0 && (
                <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto pl-6 text-[11px] font-medium opacity-90">
                  {result.skipped.map((item) => (
                    <li key={item.code}>{item.code}: {item.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <TargetPicker groups={groups} excludeCode={group.code} value={target} onChange={setTarget} />
            <button
              type="button"
              onClick={() => void move()}
              disabled={!target || !selected.size || tooMany || moving}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-[image:linear-gradient(135deg,#38bdf8,#2563eb)] px-4 text-[13px] font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            >
              {moving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              {moving ? "Переношу…" : `Перенести ${selected.size ? formatCount(selected.size) : ""}`.trim()}
            </button>
          </div>
          {tooMany && <p className="text-[11px] font-semibold text-rose-200">За один раз можна перенести не більше {MOVE_MAX} товарів.</p>}
        </footer>
      </div>
    </div>,
    document.body
  );
}
