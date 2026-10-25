"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Factory,
  FolderPlus,
  FolderTree,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DialogGroup } from "app/components/AdminGroupProductsDialog";
import { getAdminIdToken } from "app/lib/get-admin-token";

// Admin "Каталог" tab: create, rename and delete 1C product groups and move
// their products; add, rename and delete producers. Data comes from
// /api/admin/catalog-groups(/products) and /api/admin/producers.

const AdminGroupProductsDialog = dynamic(() => import("app/components/AdminGroupProductsDialog"), { ssr: false });

type CatalogGroup = { code: string; name: string; parentCode: string; products: number };
type CatalogProducer = { id: string; name: string; products: number };
type GroupNode = CatalogGroup & { children: GroupNode[]; total: number; path: string[] };
type Section = "groups" | "producers";
type Notice = { tone: "success" | "info" | "error"; text: string } | null;
type GroupPanel = { kind: "create" | "delete"; code: string } | null;

const NAME_MAX_LENGTH = 100;
const normalizeName = (value: string) => value.replace(/\s+/g, " ").trim();
const searchKey = (value: string) => value.toLocaleLowerCase("uk-UA");
const collator = new Intl.Collator("uk", { sensitivity: "base", numeric: true });
const formatCount = (value: number) => value.toLocaleString("uk-UA");
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

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
  return { roots, all: [...nodes.values()], byCode: nodes };
};

// Row actions stay in place (counts line up in one column) but recede until
// the row is hovered or focused.
const rowActionsClass = "flex shrink-0 items-center gap-0.5";

function IconButton({
  label,
  onClick,
  tone = "default",
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 ${
        pressed
          ? "border-sky-300/40 bg-sky-400/20 text-white"
          : tone === "danger"
            ? "border-transparent text-slate-300 group-hover/row:text-white hover:border-rose-300/35 hover:bg-rose-500/15 hover:!text-white"
            : "border-transparent text-slate-300 group-hover/row:text-white hover:border-sky-300/30 hover:bg-sky-400/15 hover:!text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SectionSwitch({
  section,
  onChange,
  counts,
}: {
  section: Section;
  onChange: (section: Section) => void;
  counts: Record<Section, number | null>;
}) {
  const options: Array<{ key: Section; label: string; icon: React.ReactNode }> = [
    { key: "groups", label: "Групи товарів", icon: <FolderTree className="h-4 w-4" /> },
    { key: "producers", label: "Виробники", icon: <Factory className="h-4 w-4" /> },
  ];
  return (
    <div role="tablist" aria-label="Розділ каталогу" className="grid grid-cols-2 gap-1 rounded-[16px] border border-[#23324b] bg-[#0a1220] p-1">
      {options.map((option) => {
        const active = option.key === section;
        const count = counts[option.key];
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
            {count !== null && (
              <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-white/15" : "bg-white/[0.06] text-slate-300"}`}>
                {formatCount(count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/75" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full min-w-0 rounded-[14px] border border-[#2c3d5a] bg-[#0a1220] pl-10 pr-10 text-[16px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] placeholder:text-[13px] placeholder:text-slate-400 focus:border-sky-300/60  focus:outline-none sm:text-sm"
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

function PrimaryButton({
  onClick,
  type = "button",
  disabled,
  busy,
  icon,
  children,
}: {
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[14px] bg-[image:linear-gradient(135deg,#38bdf8,#2563eb)] px-4 text-[13px] font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.28)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
    >
      {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
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
        <div key={index} className="h-12 animate-pulse rounded-[14px] border border-[#1d2a40] bg-[#111c30]" style={{ animationDelay: `${index * 80}ms` }} />
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

function SummaryBar({ children, loading, onRefresh }: { children: React.ReactNode; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[12px] text-slate-300">
      <div className="min-w-0">{children}</div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        Оновити
      </button>
    </div>
  );
}

function CountChip({ value }: { value: number }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[10px] font-bold tabular-nums ${
        value === 0 ? "border-[#2c3d5a] bg-[#0f192b] text-slate-300" : "border-sky-400/35 bg-[#0c2e4a] text-sky-100"
      }`}
      title="Кількість товарів"
    >
      {value === 0 ? "без товарів" : `${formatCount(value)} тов.`}
    </span>
  );
}

function NameForm({
  initial = "",
  label,
  placeholder,
  submitLabel,
  saving,
  onSave,
  onCancel,
}: {
  initial?: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
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
  const unchanged = Boolean(initial) && name === normalizeName(initial);
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
        <span className="sr-only">{label}</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
          placeholder={placeholder}
          maxLength={NAME_MAX_LENGTH + 20}
          aria-invalid={tooLong}
          className="h-10 w-full min-w-0 rounded-[12px] border border-sky-300/40 bg-[#0a1220] px-3 text-[16px] font-semibold text-white placeholder:text-[13px] placeholder:font-medium placeholder:text-slate-400 focus:border-sky-300 focus:outline-none sm:text-[13px]"
        />
      </label>
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-bold tabular-nums ${tooLong ? "text-rose-300" : "text-slate-300"}`}>
          {name.length}/{NAME_MAX_LENGTH}
        </span>
        <button
          type="submit"
          disabled={invalid || unchanged || saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-[12px] border border-emerald-300/30 bg-emerald-500/18 px-3 text-[12px] font-bold text-emerald-50 transition hover:bg-emerald-500/28 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Зберігаю…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label="Скасувати"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/12 hover:text-white disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

// A search-as-you-type choice from a list (target group, replacing
// producer). The options render inline, so it works inside the panel's
// scroll area.
function InlinePicker<T>({
  items,
  getKey,
  getLabel,
  getHint,
  getSearchText,
  value,
  onChange,
  placeholder,
  label,
}: {
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getHint?: (item: T) => React.ReactNode;
  getSearchText: (item: T) => string;
  value: T | null;
  onChange: (item: T | null) => void;
  placeholder: string;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const key = searchKey(normalizeName(query));
  const options = useMemo(
    () => (key ? items.filter((item) => searchKey(getSearchText(item)).includes(key)).slice(0, 8) : []),
    [items, key, getSearchText]
  );

  if (value) {
    return (
      <div className="flex min-h-10 items-center gap-2 rounded-[10px] border border-emerald-400/50 bg-[#0c2f2b] px-3">
        <span className="min-w-0 flex-1 text-[14px] font-semibold text-slate-50">→ {getLabel(value)}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Обрати інше"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-200 transition hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block">
        <span className="sr-only">{label}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && options[0]) { event.preventDefault(); onChange(options[0]); }
          }}
          placeholder={placeholder}
          className="h-10 w-full rounded-[10px] border border-[#2c3d5a] bg-[#0a1220] px-3 text-[16px] font-semibold text-white placeholder:text-[12px] placeholder:font-medium placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none sm:text-[13px]"
        />
      </label>
      {key && (
        options.length ? (
          <ul className="space-y-0.5 rounded-[10px] border border-white/8 bg-[#0d1626] p-1">
            {options.map((item) => (
              <li key={getKey(item)}>
                <button
                  type="button"
                  onClick={() => onChange(item)}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] font-semibold text-slate-50 transition hover:bg-[#1a2b47]"
                >
                  <span className="min-w-0 flex-1">{getLabel(item)}</span>
                  {getHint?.(item)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-[12px] text-slate-300">Нічого не знайдено</p>
        )
      )}
    </div>
  );
}

const groupLabel = (group: DialogGroup) => [...group.path, group.name].join(" › ");

function GroupDeletePanel({
  node,
  groups,
  busy,
  onConfirm,
  onCancel,
}: {
  node: GroupNode;
  groups: DialogGroup[];
  busy: boolean;
  onConfirm: (target: DialogGroup | null) => void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState<DialogGroup | null>(null);
  const hasChildren = node.children.length > 0;
  const needsTarget = node.products > 0;
  const options = useMemo(() => groups.filter((group) => group.code !== node.code), [groups, node.code]);
  return (
    <div className="mt-1.5 space-y-2 rounded-[12px] border border-rose-400/40 bg-[#2a1220] p-2.5 text-[12px] text-rose-50">
      {hasChildren ? (
        <p className="font-semibold">
          У «{node.name}» є підгрупи ({node.children.length}). Спершу видаліть їх (товари з них можна перенести) — тоді можна буде видалити й цю групу.
        </p>
      ) : (
        <>
          <p className="font-semibold">
            {needsTarget
              ? `У «${node.name}» ${formatCount(node.products)} тов. Оберіть групу, куди їх перенести, — потім «${node.name}» буде позначено на вилучення в 1С, а її сторінка перенаправлятиме на нову групу.`
              : `Позначити «${node.name}» на вилучення в 1С? Товарів у ній немає.`}
          </p>
          {needsTarget && (
            <InlinePicker
              items={options}
              getKey={(group) => group.code}
              getLabel={groupLabel}
              getSearchText={groupLabel}
              value={target}
              onChange={setTarget}
              label="Група для перенесення товарів"
              placeholder="Куди перенести товари: почніть вводити назву групи"
            />
          )}
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        {!hasChildren && (
          <button
            type="button"
            onClick={() => onConfirm(target)}
            disabled={busy || (needsTarget && !target)}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-rose-300/40 bg-rose-500/25 px-3 font-bold text-white transition hover:bg-rose-500/35 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busy ? "Видаляю…" : needsTarget ? "Перенести й видалити" : "Видалити групу"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-[10px] border border-white/10 bg-white/5 px-3 font-semibold text-slate-200 transition hover:bg-white/12 disabled:opacity-50"
        >
          {hasChildren ? "Зрозуміло" : "Скасувати"}
        </button>
      </div>
    </div>
  );
}

function GroupRow({
  node,
  depth,
  showPath,
  expanded,
  onToggle,
  editing,
  highlighted,
  panel,
  busy,
  onEdit,
  onRename,
  onCancelEdit,
  onOpenProducts,
  onTogglePanel,
}: {
  node: GroupNode;
  depth: number;
  showPath: boolean;
  expanded: boolean;
  onToggle?: () => void;
  editing: boolean;
  highlighted: boolean;
  panel: "create" | "delete" | null;
  busy: boolean;
  onEdit: () => void;
  onRename: (name: string) => void;
  onCancelEdit: () => void;
  onOpenProducts: () => void;
  onTogglePanel: (kind: "create" | "delete") => void;
}) {
  const hasChildren = node.children.length > 0;
  const active = editing || panel !== null;
  return (
    <div
      className={`group/row flex min-h-12 items-center gap-2 rounded-[14px] border px-2 py-1.5 transition-colors ${
        active
          ? "border-sky-400/55 bg-[#10294a]"
          : highlighted
            ? "border-emerald-400/55 bg-[#0c2f2b]"
            : "border-[#23324b] bg-[#111c30] hover:border-[#36507a] hover:bg-[#15243d]"
      }`}
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
        <NameForm initial={node.name} label="Нова назва групи" submitLabel="Зберегти" saving={busy} onSave={onRename} onCancel={onCancelEdit} />
      ) : (
        <>
          <div className="min-w-0 flex-1">
            {showPath && node.path.length > 0 && (
              <p className="truncate text-[10px] font-medium text-slate-300">{node.path.join(" › ")}</p>
            )}
            <p className={`text-[14px] leading-snug text-slate-50 [overflow-wrap:anywhere] ${depth === 0 && !showPath ? "font-bold" : "font-semibold"}`}>
              {node.name}
            </p>
          </div>
          <CountChip value={hasChildren ? node.total : node.products} />
          <div className={rowActionsClass}>
            {node.products > 0 ? (
              <IconButton label={`Товари групи «${node.name}»: перенести в іншу групу`} onClick={onOpenProducts}>
                <Table2 className="h-4 w-4" />
              </IconButton>
            ) : (
              <span className="h-8 w-8 shrink-0" aria-hidden="true" />
            )}
            <IconButton label={`Нова підгрупа в «${node.name}»`} onClick={() => onTogglePanel("create")} pressed={panel === "create"}>
              <FolderPlus className="h-4 w-4" />
            </IconButton>
            <IconButton label={`Перейменувати «${node.name}»`} onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton label={`Видалити «${node.name}»`} onClick={() => onTogglePanel("delete")} tone="danger" pressed={panel === "delete"}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </>
      )}
    </div>
  );
}

function GroupsSection({ active, onCount }: { active: boolean; onCount: (count: number) => void }) {
  const [groups, setGroups] = useState<CatalogGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [panel, setPanel] = useState<GroupPanel>(null);
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [productsGroup, setProductsGroup] = useState<DialogGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await authorizedFetch("/api/admin/catalog-groups");
      setGroups(Array.isArray(data.groups) ? (data.groups as CatalogGroup[]) : []);
    } catch (error) {
      setLoadError(errorText(error, "Не вдалося завантажити групи"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && groups === null && !loading && !loadError) void load();
  }, [active, groups, loading, loadError, load]);

  const tree = useMemo(() => buildGroupTree(groups ?? []), [groups]);
  useEffect(() => { if (groups) onCount(tree.all.length); }, [groups, tree, onCount]);

  const totalProducts = useMemo(() => tree.roots.reduce((sum, node) => sum + node.total, 0), [tree]);
  const trimmedQuery = searchKey(normalizeName(query));
  const matches = useMemo(
    () =>
      trimmedQuery
        ? tree.all.filter((node) => searchKey(node.name).includes(trimmedQuery)).sort((a, b) => collator.compare(a.name, b.name))
        : [],
    [tree, trimmedQuery]
  );
  const pickerGroups = useMemo<DialogGroup[]>(
    () =>
      tree.all
        .map((node) => ({ code: node.code, name: node.name, path: node.path }))
        .sort((a, b) => collator.compare(groupLabel(a), groupLabel(b))),
    [tree]
  );
  const expandable = tree.all.filter((node) => node.children.length);
  const allExpanded = expandable.length > 0 && expandable.every((node) => expanded.has(node.code));

  const expandTo = (code: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      let node = tree.byCode.get(code);
      while (node?.parentCode) {
        next.add(node.parentCode);
        node = tree.byCode.get(node.parentCode);
      }
      return next;
    });

  const rename = async (node: GroupNode, name: string) => {
    setBusyCode(node.code);
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/catalog-groups", { method: "POST", body: JSON.stringify({ code: node.code, name }) });
      const newName = typeof data.name === "string" ? data.name : name;
      setGroups((current) => current?.map((group) => (group.code === node.code ? { ...group, name: newName } : group)) ?? current);
      setEditingCode(null);
      setHighlightCode(node.code);
      setNotice({ tone: "success", text: `«${node.name}» → «${newName}». Стара адреса сторінки групи перенаправлятиме на нову.` });
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error, "Не вдалося перейменувати групу") });
    } finally {
      setBusyCode(null);
    }
  };

  const create = async (name: string, parent: GroupNode | null) => {
    setBusyCode(parent?.code ?? "__root");
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/catalog-groups", {
        method: "PUT",
        body: JSON.stringify({ name, ...(parent ? { parentCode: parent.code } : {}) }),
      });
      const group = data.group as { code: string; name: string; parentCode: string };
      setGroups((current) => [...(current ?? []), { code: group.code, name: group.name, parentCode: group.parentCode, products: 0 }]);
      if (parent) setExpanded((current) => new Set(current).add(parent.code));
      setPanel(null);
      setCreatingRoot(false);
      setHighlightCode(group.code);
      setNotice({
        tone: "success",
        text: parent
          ? `Групу «${group.name}» створено в «${parent.name}». На сайті вона з'явиться, щойно в ній будуть товари.`
          : `Розділ «${group.name}» створено. На сайті він з'явиться, щойно в ньому будуть товари.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error, "Не вдалося створити групу") });
    } finally {
      setBusyCode(null);
    }
  };

  const remove = async (node: GroupNode, target: DialogGroup | null) => {
    setBusyCode(node.code);
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/catalog-groups", {
        method: "DELETE",
        body: JSON.stringify({ code: node.code, ...(target ? { targetCode: target.code } : {}) }),
      });
      const moved = typeof data.moved === "number" ? data.moved : 0;
      setGroups((current) =>
        current
          ?.filter((group) => group.code !== node.code)
          .map((group) => (target && group.code === target.code ? { ...group, products: group.products + moved } : group)) ?? current
      );
      setPanel(null);
      if (target) { setHighlightCode(target.code); expandTo(target.code); }
      setNotice({
        tone: "success",
        text: target && moved
          ? `Групу «${node.name}» видалено, ${formatCount(moved)} тов. перенесено до «${target.name}».`
          : `Групу «${node.name}» видалено.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error, "Не вдалося видалити групу") });
    } finally {
      setBusyCode(null);
    }
  };

  // Moved products change both groups' counts without a reload.
  const handleMoved = useCallback((fromCode: string, toCode: string, count: number) => {
    setGroups((current) =>
      current?.map((group) =>
        group.code === fromCode
          ? { ...group, products: Math.max(0, group.products - count) }
          : group.code === toCode
            ? { ...group, products: group.products + count }
            : group
      ) ?? current
    );
  }, []);
  const closeProducts = useCallback(() => setProductsGroup(null), []);

  const renderRow = (node: GroupNode, depth: number, showPath: boolean): React.ReactNode => {
    const rowPanel = panel?.code === node.code ? panel.kind : null;
    const busy = busyCode === node.code;
    const isOpen = expanded.has(node.code);
    const indent = depth ? { marginLeft: `${Math.min(depth, 3) * 18}px` } : undefined;
    return (
      <div key={node.code} className="space-y-1">
        <div style={indent}>
          <GroupRow
            node={node}
            depth={depth}
            showPath={showPath}
            expanded={isOpen}
            onToggle={showPath ? undefined : () =>
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(node.code)) next.delete(node.code);
                else next.add(node.code);
                return next;
              })
            }
            editing={editingCode === node.code}
            highlighted={highlightCode === node.code}
            panel={rowPanel}
            busy={busy}
            onEdit={() => { setEditingCode(node.code); setPanel(null); setNotice(null); }}
            onRename={(name) => void rename(node, name)}
            onCancelEdit={() => setEditingCode(null)}
            onOpenProducts={() => setProductsGroup({ code: node.code, name: node.name, path: node.path })}
            onTogglePanel={(kind) => {
              setEditingCode(null);
              setNotice(null);
              setPanel((current) => (current?.code === node.code && current.kind === kind ? null : { kind, code: node.code }));
            }}
          />
          {rowPanel === "create" && (
            <div className="mt-1.5 rounded-[12px] border border-sky-400/40 bg-[#0f2240] p-2.5">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-sky-100/80">Нова підгрупа в «{node.name}»</p>
              <NameForm
                label="Назва нової підгрупи"
                placeholder="Напр., Ремкомплекти супорта"
                submitLabel="Створити"
                saving={busy}
                onSave={(name) => void create(name, node)}
                onCancel={() => setPanel(null)}
              />
            </div>
          )}
          {rowPanel === "delete" && (
            <GroupDeletePanel
              node={node}
              groups={pickerGroups}
              busy={busy}
              onConfirm={(target) => void remove(node, target)}
              onCancel={() => setPanel(null)}
            />
          )}
        </div>
        {!showPath && isOpen && node.children.map((child) => renderRow(child, depth + 1, false))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <SearchInput value={query} onChange={setQuery} placeholder="Пошук групи за назвою" />
        <PrimaryButton
          onClick={() => { setCreatingRoot((current) => !current); setPanel(null); setNotice(null); }}
          icon={<FolderPlus className="h-4 w-4" />}
          disabled={!groups}
        >
          Новий розділ
        </PrimaryButton>
      </div>
      {creatingRoot && (
        <div className="rounded-[14px] border border-sky-400/40 bg-[#0f2240] p-2.5">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-sky-100/80">Новий розділ верхнього рівня</p>
          <NameForm
            label="Назва нового розділу"
            placeholder="Напр., Аксесуари"
            submitLabel="Створити"
            saving={busyCode === "__root"}
            onSave={(name) => void create(name, null)}
            onCancel={() => setCreatingRoot(false)}
          />
          <p className="mt-1.5 text-[11px] text-slate-300">Підгрупу всередині розділу створюйте кнопкою з плюсом у його рядку.</p>
        </div>
      )}
      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
      {loading && !groups && <LoadingRows />}
      {loadError && !groups && <LoadError message={loadError} onRetry={() => void load()} />}
      {groups && (
        <>
          <SummaryBar loading={loading} onRefresh={() => void load()}>
            {trimmedQuery ? (
              `Знайдено: ${matches.length}`
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>Розділів: <b className="text-white">{tree.roots.length}</b></span>
                <span aria-hidden="true">·</span>
                <span>груп: <b className="text-white">{formatCount(tree.all.length)}</b></span>
                <span aria-hidden="true">·</span>
                <span>товарів: <b className="text-white">{formatCount(totalProducts)}</b></span>
                {expandable.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(allExpanded ? new Set() : new Set(expandable.map((node) => node.code)))}
                    className="ml-1 inline-flex items-center gap-1 rounded-[8px] px-1.5 py-0.5 font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white"
                  >
                    {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
                    {allExpanded ? "Згорнути все" : "Розгорнути все"}
                  </button>
                )}
              </span>
            )}
          </SummaryBar>
          {trimmedQuery ? (
            matches.length ? (
              <div className="space-y-1">{matches.map((node) => renderRow(node, 0, true))}</div>
            ) : (
              <p className="rounded-[14px] border border-dashed border-[#2c3d5a] bg-[#0d1626] px-3 py-6 text-center text-[13px] text-slate-300">
                Групу «{normalizeName(query)}» не знайдено.
              </p>
            )
          ) : (
            <div className="space-y-1">{tree.roots.map((node) => renderRow(node, 0, false))}</div>
          )}
        </>
      )}
      {productsGroup && (
        <AdminGroupProductsDialog
          group={productsGroup}
          groups={pickerGroups}
          authorizedFetch={authorizedFetch}
          onClose={closeProducts}
          onMoved={handleMoved}
        />
      )}
    </div>
  );
}

type ProducerSort = "name" | "products";

function ProducerDeletePanel({
  producer,
  producers,
  busy,
  onConfirm,
  onCancel,
}: {
  producer: CatalogProducer;
  producers: CatalogProducer[];
  busy: boolean;
  onConfirm: (replacement: CatalogProducer | null) => void;
  onCancel: () => void;
}) {
  const [replacement, setReplacement] = useState<CatalogProducer | null>(null);
  const needsReplacement = producer.products > 0;
  const options = useMemo(() => producers.filter((item) => item.id && item.id !== producer.id), [producers, producer.id]);
  return (
    <div className="mt-1.5 space-y-2 rounded-[12px] border border-rose-400/40 bg-[#2a1220] p-2.5 text-[12px] text-rose-50">
      <p className="font-semibold">
        {needsReplacement
          ? `У «${producer.name}» ${formatCount(producer.products)} тов. Оберіть виробника, до якого їх перенести, — потім «${producer.name}» буде позначено на вилучення в 1С, а його сторінка перенаправлятиме на нового.`
          : `Позначити «${producer.name}» на вилучення в 1С? Товарів у нього немає.`}
      </p>
      {needsReplacement && (
        <InlinePicker
          items={options}
          getKey={(item) => item.id}
          getLabel={(item) => item.name}
          getHint={(item) => <CountChip value={item.products} />}
          getSearchText={(item) => item.name}
          value={replacement}
          onChange={setReplacement}
          label="Виробник для перенесення товарів"
          placeholder="Кому передати товари: почніть вводити назву"
        />
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onConfirm(replacement)}
          disabled={busy || (needsReplacement && !replacement)}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-rose-300/40 bg-rose-500/25 px-3 font-bold text-white transition hover:bg-rose-500/35 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {busy ? "Видаляю…" : needsReplacement ? "Перенести й видалити" : "Видалити"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-[10px] border border-white/10 bg-white/5 px-3 font-semibold text-slate-200 transition hover:bg-white/12 disabled:opacity-50"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}

function ProducersSection({ active, onCount }: { active: boolean; onCount: (count: number) => void }) {
  const [producers, setProducers] = useState<CatalogProducer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProducerSort>("name");
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await authorizedFetch("/api/admin/producers");
      setProducers(Array.isArray(data.producers) ? (data.producers as CatalogProducer[]) : []);
    } catch (error) {
      setLoadError(errorText(error, "Не вдалося завантажити виробників"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && producers === null && !loading && !loadError) void load();
  }, [active, producers, loading, loadError, load]);
  useEffect(() => { if (producers) onCount(producers.length); }, [producers, onCount]);

  const name = normalizeName(newName);
  const tooLong = name.length > NAME_MAX_LENGTH;
  const existing = useMemo(
    () => (name ? producers?.find((producer) => searchKey(producer.name) === searchKey(name)) : undefined),
    [producers, name]
  );
  const emptyCount = useMemo(() => (producers ?? []).filter((producer) => producer.products === 0).length, [producers]);
  const filterKey = searchKey(normalizeName(query));
  const visible = useMemo(() => {
    const list = (producers ?? []).filter(
      (producer) => (!filterKey || searchKey(producer.name).includes(filterKey)) && (!emptyOnly || producer.products === 0)
    );
    return sort === "products"
      ? list.sort((a, b) => b.products - a.products || collator.compare(a.name, b.name))
      : list.sort((a, b) => collator.compare(a.name, b.name));
  }, [producers, filterKey, emptyOnly, sort]);

  const create = async () => {
    if (!name || tooLong || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/producers", { method: "POST", body: JSON.stringify({ name }) });
      const producer = data.producer as { id: string; name: string; created: boolean };
      if (producer.created) {
        setProducers((current) => [...(current ?? []), { id: producer.id, name: producer.name, products: 0 }]);
        setNotice({ tone: "success", text: `Виробника «${producer.name}» додано. Його вже можна вибрати в картці товару.` });
      } else {
        setNotice({ tone: "info", text: `Виробник «${producer.name}» уже є в 1С — новий запис не створено.` });
      }
      setHighlightId(producer.id);
      setQuery("");
      setEmptyOnly(false);
      setNewName("");
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error, "Не вдалося додати виробника") });
    } finally {
      setCreating(false);
    }
  };

  const rename = async (producer: CatalogProducer, nextName: string) => {
    setBusyId(producer.id);
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/producers", { method: "PATCH", body: JSON.stringify({ id: producer.id, name: nextName }) });
      const savedName = typeof data.name === "string" ? data.name : nextName;
      setProducers((current) => current?.map((item) => (item.id === producer.id ? { ...item, name: savedName } : item)) ?? current);
      setEditingId(null);
      setHighlightId(producer.id);
      setNotice({
        tone: "success",
        text: `«${producer.name}» → «${savedName}». Товари лишились за ним, стара сторінка виробника перенаправлятиме на нову.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error, "Не вдалося перейменувати виробника") });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (producer: CatalogProducer, replacement: CatalogProducer | null) => {
    setBusyId(producer.id);
    setNotice(null);
    try {
      const data = await authorizedFetch("/api/admin/producers", {
        method: "DELETE",
        body: JSON.stringify({ id: producer.id, ...(replacement ? { replacementId: replacement.id } : {}) }),
      });
      const moved = typeof data.moved === "number" ? data.moved : 0;
      setProducers((current) =>
        current
          ?.filter((item) => item.id !== producer.id)
          .map((item) => (replacement && item.id === replacement.id ? { ...item, products: item.products + moved } : item)) ?? current
      );
      setDeletingId(null);
      if (replacement) setHighlightId(replacement.id);
      setNotice({
        tone: "success",
        text: replacement && moved
          ? `«${producer.name}» видалено, ${formatCount(moved)} тов. перенесено до «${replacement.name}».`
          : `«${producer.name}» видалено.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error, "Не вдалося видалити виробника") });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={(event) => { event.preventDefault(); void create(); }} className="flex flex-col gap-1.5 sm:flex-row">
        <label htmlFor="admin-new-producer" className="relative block min-w-0 flex-1">
          <span className="sr-only">Новий виробник</span>
          <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/75" />
          <input
            id="admin-new-producer"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Новий виробник, напр., KYB або Febi Bilstein"
            autoComplete="off"
            maxLength={NAME_MAX_LENGTH + 20}
            aria-invalid={tooLong}
            aria-describedby={tooLong || existing ? "admin-new-producer-hint" : undefined}
            className="h-11 w-full min-w-0 rounded-[14px] border border-[#2c3d5a] bg-[#0a1220] pl-10 pr-3 text-[16px] font-semibold text-white placeholder:text-[13px] placeholder:font-medium placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none sm:text-[13px]"
          />
        </label>
        <PrimaryButton type="submit" busy={creating} disabled={!name || tooLong || Boolean(existing) || !producers} icon={<Plus className="h-4 w-4" />}>
          {creating ? "Додаю…" : "Додати"}
        </PrimaryButton>
      </form>
      {(tooLong || existing) && (
        <p id="admin-new-producer-hint" className={`px-1 text-[11px] font-semibold ${tooLong ? "text-rose-200" : "text-amber-200"}`}>
          {tooLong ? `Назва довша за ${NAME_MAX_LENGTH} символів` : `«${existing?.name}» уже є в списку (регістр не має значення)`}
        </p>
      )}

      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Пошук виробника" />
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label="Сортування" className="inline-flex h-11 items-center gap-0.5 rounded-[14px] border border-[#23324b] bg-[#0a1220] p-1">
            {([["name", "А–Я"], ["products", "За товарами"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={`h-full rounded-[10px] px-2.5 text-[12px] font-bold transition ${
                  sort === key ? "bg-sky-400/20 text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEmptyOnly((current) => !current)}
            aria-pressed={emptyOnly}
            disabled={!emptyCount && !emptyOnly}
            className={`inline-flex h-11 items-center gap-1.5 rounded-[14px] border px-3 text-[12px] font-bold transition disabled:opacity-40 ${
              emptyOnly ? "border-amber-300/40 bg-amber-400/15 text-amber-50" : "border-white/10 bg-[#0a1220] text-slate-300 hover:text-white"
            }`}
          >
            Без товарів
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">{formatCount(emptyCount)}</span>
          </button>
        </div>
      </div>

      {loading && !producers && <LoadingRows />}
      {loadError && !producers && <LoadError message={loadError} onRetry={() => void load()} />}
      {producers && (
        <>
          <SummaryBar loading={loading} onRefresh={() => void load()}>
            {filterKey || emptyOnly ? `Показано: ${visible.length} з ${producers.length}` : `Виробників у 1С: ${formatCount(producers.length)}`}
          </SummaryBar>
          {visible.length ? (
            <ul className="grid gap-1 lg:grid-cols-2">
              {visible.map((producer) => {
                const editing = editingId === producer.id;
                const deleting = deletingId === producer.id;
                const busy = busyId === producer.id;
                return (
                  <li
                    key={producer.id || producer.name}
                    className={`group/row rounded-[14px] border px-2 py-1.5 transition-colors ${
                      editing || deleting
                        ? "border-sky-400/55 bg-[#10294a] lg:col-span-2"
                        : producer.id === highlightId
                          ? "border-emerald-400/55 bg-[#0c2f2b]"
                          : "border-[#23324b] bg-[#111c30] hover:border-[#36507a] hover:bg-[#15243d]"
                    }`}
                  >
                    {editing ? (
                      <NameForm
                        initial={producer.name}
                        label="Нова назва виробника"
                        submitLabel="Зберегти"
                        saving={busy}
                        onSave={(nextName) => void rename(producer, nextName)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="flex min-h-9 items-center gap-2 pl-1">
                        <span className="min-w-0 flex-1 text-[14px] font-semibold text-slate-50 [overflow-wrap:anywhere]">{producer.name}</span>
                        <CountChip value={producer.products} />
                        {producer.id && (
                          <div className={rowActionsClass}>
                            <IconButton label={`Перейменувати «${producer.name}»`} onClick={() => { setEditingId(producer.id); setDeletingId(null); setNotice(null); }}>
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label={`Видалити «${producer.name}»`}
                              tone="danger"
                              pressed={deleting}
                              onClick={() => { setDeletingId(deleting ? null : producer.id); setEditingId(null); setNotice(null); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    )}
                    {deleting && (
                      <ProducerDeletePanel
                        producer={producer}
                        producers={producers}
                        busy={busy}
                        onConfirm={(replacement) => void remove(producer, replacement)}
                        onCancel={() => setDeletingId(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#2c3d5a] bg-[#0d1626] px-3 py-6 text-center text-[13px] text-slate-300">
              {filterKey ? <>Виробника «{normalizeName(query)}» немає. Додайте його полем угорі.</> : "Таких виробників немає."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminCatalogPanel() {
  const [section, setSection] = useState<Section>("groups");
  const [counts, setCounts] = useState<Record<Section, number | null>>({ groups: null, producers: null });
  const setGroupCount = useCallback((count: number) => setCounts((current) => ({ ...current, groups: count })), []);
  const setProducerCount = useCallback((count: number) => setCounts((current) => ({ ...current, producers: count })), []);
  return (
    <div className="space-y-2 pt-2">
      <SectionSwitch section={section} onChange={setSection} counts={counts} />
      <div hidden={section !== "groups"}>
        <GroupsSection active={section === "groups"} onCount={setGroupCount} />
      </div>
      <div hidden={section !== "producers"}>
        <ProducersSection active={section === "producers"} onCount={setProducerCount} />
      </div>
    </div>
  );
}
