"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Factory,
  FolderTree,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAdminIdToken } from "app/lib/get-admin-token";

// Admin "Каталог" tab: rename 1C product groups and add producers.
// Data comes from /api/admin/catalog-groups and /api/admin/producers.

type CatalogGroup = { code: string; name: string; parentCode: string; products: number };
type CatalogProducer = { id: string; name: string; products: number };
type GroupNode = CatalogGroup & { children: GroupNode[]; total: number; path: string[] };
type Section = "groups" | "producers";
type Notice = { tone: "success" | "info" | "error"; text: string } | null;

const NAME_MAX_LENGTH = 100;
const normalizeName = (value: string) => value.replace(/\s+/g, " ").trim();
const searchKey = (value: string) => value.toLocaleLowerCase("uk-UA");
const collator = new Intl.Collator("uk", { sensitivity: "base", numeric: true });
const formatCount = (value: number) => value.toLocaleString("uk-UA");

const authorizedFetch = async (url: string, init?: RequestInit) => {
  const token = await getAdminIdToken();
  if (!token) throw new Error("Не авторизовано. Увійдіть як адміністратор.");
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.ok !== true) {
    throw new Error(typeof data.error === "string" && data.error ? data.error : "Запит не вдався");
  }
  return data;
};

const buildGroupTree = (groups: CatalogGroup[]) => {
  const nodes = new Map<string, GroupNode>();
  for (const group of groups) nodes.set(group.code, { ...group, children: [], total: group.products, path: [] });
  const roots: GroupNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentCode ? nodes.get(node.parentCode) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const finish = (node: GroupNode, path: string[]): number => {
    node.path = path;
    node.children.sort((a, b) => collator.compare(a.name, b.name));
    node.total = node.products + node.children.reduce((sum, child) => sum + finish(child, [...path, node.name]), 0);
    return node.total;
  };
  roots.sort((a, b) => collator.compare(a.name, b.name));
  for (const root of roots) finish(root, []);
  return { roots, all: [...nodes.values()] };
};

function SectionSwitch({ section, onChange }: { section: Section; onChange: (section: Section) => void }) {
  const options: Array<{ key: Section; label: string; icon: React.ReactNode }> = [
    { key: "groups", label: "Групи товарів", icon: <FolderTree className="h-4 w-4" /> },
    { key: "producers", label: "Виробники", icon: <Factory className="h-4 w-4" /> },
  ];
  return (
    <div role="tablist" aria-label="Розділ каталогу" className="grid grid-cols-2 gap-1 rounded-[16px] border border-white/10 bg-slate-950/45 p-1">
      {options.map((option) => {
        const active = option.key === section;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.key)}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] px-3 text-[12px] font-bold transition ${
              active
                ? "bg-[image:linear-gradient(135deg,rgba(56,189,248,0.24),rgba(37,99,235,0.2))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/75" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full min-w-0 rounded-[16px] border border-white/12 bg-slate-950/45 pl-10 pr-10 text-[16px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] placeholder:text-[13px] placeholder:text-slate-300/70 focus:border-sky-300/60 focus:bg-slate-950/60 focus:outline-none sm:text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Очистити пошук"
          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/7 text-slate-200 transition hover:bg-white/12"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

function NoticeBanner({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  const tone =
    notice.tone === "success"
      ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-100"
      : notice.tone === "info"
        ? "border-sky-300/30 bg-sky-500/12 text-sky-100"
        : "border-rose-400/30 bg-rose-500/12 text-rose-100";
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-[14px] border px-3 py-2 text-[12px] font-semibold ${tone}`}>
      {notice.tone === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Закрити повідомлення" className="shrink-0 rounded-full p-0.5 opacity-80 transition hover:bg-white/10 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-1.5" aria-busy="true" aria-label="Завантаження">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-[14px] border border-white/6 bg-white/[0.04]" style={{ animationDelay: `${index * 80}ms` }} />
      ))}
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[18px] border border-dashed border-rose-300/25 bg-rose-500/[0.06] px-4 py-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-rose-200" />
      <p className="mx-auto mt-3 max-w-sm text-[13px] font-semibold text-rose-100">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-white/12 bg-white/8 px-4 text-[12px] font-bold text-white transition hover:bg-white/14"
      >
        <RefreshCw className="h-4 w-4" />
        Спробувати ще раз
      </button>
    </div>
  );
}

function CountChip({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[10px] font-bold tabular-nums ${
        muted || value === 0
          ? "border-white/8 bg-white/[0.04] text-slate-400"
          : "border-sky-300/20 bg-sky-400/10 text-sky-100"
      }`}
      title="Кількість товарів"
    >
      {value === 0 ? "без товарів" : `${formatCount(value)} тов.`}
    </span>
  );
}

function RenameForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: string;
  saving: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const name = normalizeName(value);
  const tooLong = name.length > NAME_MAX_LENGTH;
  const unchanged = name === normalizeName(initial);
  const invalid = !name || tooLong;
  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid && !unchanged && !saving) onSave(name);
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Нова назва групи</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
          maxLength={NAME_MAX_LENGTH + 20}
          aria-invalid={tooLong}
          className="h-10 w-full min-w-0 rounded-[12px] border border-sky-300/40 bg-slate-950/70 px-3 text-[16px] font-semibold text-white focus:border-sky-300 focus:outline-none sm:text-[13px]"
        />
      </label>
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-bold tabular-nums ${tooLong ? "text-rose-300" : "text-slate-400"}`}>
          {name.length}/{NAME_MAX_LENGTH}
        </span>
        <button
          type="submit"
          disabled={invalid || unchanged || saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-[12px] border border-emerald-300/30 bg-emerald-500/18 px-3 text-[12px] font-bold text-emerald-50 transition hover:bg-emerald-500/28 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Зберігаю…" : "Зберегти"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label="Скасувати перейменування"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/12 hover:text-white disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function GroupRow({
  node,
  depth,
  showPath,
  expanded,
  onToggle,
  editing,
  saving,
  onEdit,
  onSave,
  onCancel,
}: {
  node: GroupNode;
  depth: number;
  showPath: boolean;
  expanded: boolean;
  onToggle?: () => void;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div
      className={`flex min-h-12 items-center gap-2 rounded-[14px] border px-2 py-1.5 transition-colors ${
        editing ? "border-sky-300/35 bg-sky-400/[0.07]" : "border-white/7 bg-white/[0.035] hover:border-white/14 hover:bg-white/[0.06]"
      }`}
      style={{ marginLeft: depth ? `${Math.min(depth, 3) * 16}px` : undefined }}
    >
      {onToggle && hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? `Згорнути «${node.name}»` : `Розгорнути «${node.name}»`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      ) : (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-slate-500" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {editing ? (
        <RenameForm initial={node.name} saving={saving} onSave={onSave} onCancel={onCancel} />
      ) : (
        <>
          <div className="min-w-0 flex-1">
            {showPath && node.path.length > 0 && (
              <p className="truncate text-[10px] font-medium text-slate-400">{node.path.join(" › ")}</p>
            )}
            <p className={`text-[13px] leading-snug text-white [overflow-wrap:anywhere] ${depth === 0 && !showPath ? "font-bold" : "font-semibold"}`}>
              {node.name}
            </p>
          </div>
          <CountChip value={hasChildren ? node.total : node.products} />
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Перейменувати «${node.name}»`}
            title="Перейменувати"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/5 text-slate-200 transition hover:border-sky-300/30 hover:bg-sky-400/15 hover:text-white"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

function GroupsSection({ active }: { active: boolean }) {
  const [groups, setGroups] = useState<CatalogGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await authorizedFetch("/api/admin/catalog-groups");
      setGroups(Array.isArray(data.groups) ? (data.groups as CatalogGroup[]) : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не вдалося завантажити групи");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && groups === null && !loading && !loadError) void load();
  }, [active, groups, loading, loadError, load]);

  const tree = useMemo(() => buildGroupTree(groups ?? []), [groups]);
  const trimmedQuery = searchKey(normalizeName(query));
  const matches = useMemo(
    () =>
      trimmedQuery
        ? tree.all
            .filter((node) => searchKey(node.name).includes(trimmedQuery))
            .sort((a, b) => collator.compare(a.name, b.name))
        : [],
    [tree, trimmedQuery]
  );

  const rename = async (node: GroupNode, name: string) => {
    setSavingCode(node.code);
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/catalog-groups", {
        method: "POST",
        body: JSON.stringify({ code: node.code, name }),
      });
      const newName = typeof data.name === "string" ? data.name : name;
      setGroups((current) => current?.map((group) => (group.code === node.code ? { ...group, name: newName } : group)) ?? current);
      setEditingCode(null);
      setNotice({
        tone: "success",
        text: `«${node.name}» → «${newName}». Стара адреса сторінки групи перенаправлятиме на нову.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Не вдалося перейменувати групу" });
    } finally {
      setSavingCode(null);
    }
  };

  const rowProps = (node: GroupNode) => ({
    editing: editingCode === node.code,
    saving: savingCode === node.code,
    onEdit: () => { setEditingCode(node.code); setNotice(null); },
    onSave: (name: string) => void rename(node, name),
    onCancel: () => setEditingCode(null),
  });

  const renderBranch = (node: GroupNode, depth: number): React.ReactNode => {
    const isOpen = expanded.has(node.code);
    return (
      <div key={node.code} className="space-y-1">
        <GroupRow
          node={node}
          depth={depth}
          showPath={false}
          expanded={isOpen}
          onToggle={() =>
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(node.code)) next.delete(node.code);
              else next.add(node.code);
              return next;
            })
          }
          {...rowProps(node)}
        />
        {isOpen && node.children.map((child) => renderBranch(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Пошук групи за назвою" />
      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
      {loading && !groups && <LoadingRows />}
      {loadError && !groups && <LoadError message={loadError} onRetry={() => void load()} />}
      {groups && (
        <>
          <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
            <span>
              {trimmedQuery ? `Знайдено: ${matches.length}` : `Розділів: ${tree.roots.length} · усього груп: ${tree.all.length}`}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Оновити
            </button>
          </div>
          {trimmedQuery ? (
            matches.length ? (
              <div className="space-y-1">
                {matches.map((node) => (
                  <GroupRow key={node.code} node={node} depth={0} showPath expanded={false} {...rowProps(node)} />
                ))}
              </div>
            ) : (
              <p className="rounded-[14px] border border-dashed border-white/12 px-3 py-6 text-center text-[13px] text-slate-300">
                Групу «{normalizeName(query)}» не знайдено.
              </p>
            )
          ) : (
            <div className="space-y-1">{tree.roots.map((node) => renderBranch(node, 0))}</div>
          )}
        </>
      )}
    </div>
  );
}

function ProducersSection({ active }: { active: boolean }) {
  const [producers, setProducers] = useState<CatalogProducer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await authorizedFetch("/api/admin/producers");
      setProducers(Array.isArray(data.producers) ? (data.producers as CatalogProducer[]) : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не вдалося завантажити виробників");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && producers === null && !loading && !loadError) void load();
  }, [active, producers, loading, loadError, load]);

  const name = normalizeName(newName);
  const tooLong = name.length > NAME_MAX_LENGTH;
  const existing = useMemo(
    () => (name ? producers?.find((producer) => searchKey(producer.name) === searchKey(name)) : undefined),
    [producers, name]
  );
  const filterKey = searchKey(normalizeName(query));
  const visible = useMemo(
    () => (producers ?? []).filter((producer) => !filterKey || searchKey(producer.name).includes(filterKey)),
    [producers, filterKey]
  );

  const create = async () => {
    if (!name || tooLong || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/producers", { method: "POST", body: JSON.stringify({ name }) });
      const producer = data.producer as { id: string; name: string; created: boolean };
      if (producer.created) {
        setProducers((current) =>
          [...(current ?? []), { id: producer.id, name: producer.name, products: 0 }].sort((a, b) => collator.compare(a.name, b.name))
        );
        setNotice({ tone: "success", text: `Виробника «${producer.name}» додано. Його вже можна вибрати в картці товару.` });
      } else {
        setNotice({ tone: "info", text: `Виробник «${producer.name}» уже є в 1С — новий запис не створено.` });
      }
      setHighlightId(producer.id);
      setQuery("");
      setNewName("");
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Не вдалося додати виробника" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <form
        onSubmit={(event) => { event.preventDefault(); void create(); }}
        className="rounded-[16px] border border-sky-300/20 bg-[image:linear-gradient(135deg,rgba(56,189,248,0.1),rgba(37,99,235,0.06))] p-2.5"
      >
        <label htmlFor="admin-new-producer" className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.08em] text-sky-100/90">
          Новий виробник
        </label>
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <input
            id="admin-new-producer"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Напр., KYB або Febi Bilstein"
            autoComplete="off"
            maxLength={NAME_MAX_LENGTH + 20}
            aria-invalid={tooLong}
            aria-describedby="admin-new-producer-hint"
            className="h-11 min-w-0 flex-1 rounded-[12px] border border-white/12 bg-slate-950/60 px-3 text-[16px] font-semibold text-white placeholder:text-[13px] placeholder:font-medium placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none sm:text-[13px]"
          />
          <button
            type="submit"
            disabled={!name || tooLong || creating || Boolean(existing)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[12px] bg-[image:linear-gradient(135deg,#38bdf8,#2563eb)] px-4 text-[13px] font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          >
            {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creating ? "Додаю…" : "Додати"}
          </button>
        </div>
        <p id="admin-new-producer-hint" className={`mt-1.5 text-[11px] font-medium ${tooLong ? "text-rose-200" : existing ? "text-amber-200" : "text-slate-400"}`}>
          {tooLong
            ? `Назва довша за ${NAME_MAX_LENGTH} символів`
            : existing
              ? `«${existing.name}» уже є в списку`
              : "Регістр не має значення: «bosch» і «BOSCH» — той самий виробник."}
        </p>
      </form>

      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <SearchInput value={query} onChange={setQuery} placeholder="Пошук виробника" />
      {loading && !producers && <LoadingRows />}
      {loadError && !producers && <LoadError message={loadError} onRetry={() => void load()} />}
      {producers && (
        <>
          <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
            <span>{filterKey ? `Знайдено: ${visible.length}` : `Виробників у 1С: ${producers.length}`}</span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Оновити
            </button>
          </div>
          {visible.length ? (
            <ul className="grid gap-1 sm:grid-cols-2">
              {visible.map((producer) => (
                <li
                  key={producer.id || producer.name}
                  className={`flex min-h-11 items-center gap-2 rounded-[12px] border px-3 py-1.5 transition-colors ${
                    producer.id === highlightId
                      ? "border-emerald-300/40 bg-emerald-500/12"
                      : "border-white/7 bg-white/[0.035]"
                  }`}
                >
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-white [overflow-wrap:anywhere]">{producer.name}</span>
                  <CountChip value={producer.products} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-dashed border-white/12 px-3 py-6 text-center text-[13px] text-slate-300">
              Виробника «{normalizeName(query)}» немає. Додайте його формою вище.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminCatalogPanel() {
  const [section, setSection] = useState<Section>("groups");
  return (
    <div className="space-y-2 pt-2">
      <SectionSwitch section={section} onChange={setSection} />
      <div hidden={section !== "groups"}>
        <GroupsSection active={section === "groups"} />
      </div>
      <div hidden={section !== "producers"}>
        <ProducersSection active={section === "producers"} />
      </div>
    </div>
  );
}
