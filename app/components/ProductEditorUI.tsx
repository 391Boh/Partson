"use client";

import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { FileText, ImageIcon, Package } from "lucide-react";

export type ProductEditorTab = "main" | "description" | "photos";
const TABS = [{ id: "main", label: "Основне", icon: Package }, { id: "description", label: "Опис", icon: FileText }, { id: "photos", label: "Фото", icon: ImageIcon }] as const;

export function ProductEditorTabs({ prefix, value, onChange }: { prefix: string; value: ProductEditorTab; onChange: (value: ProductEditorTab) => void }) {
  return <div className="product-editor-tabs" role="tablist" aria-label="Розділи товару">
    {TABS.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" role="tab" id={`${prefix}-tab-${id}`} aria-selected={value === id} aria-controls={`${prefix}-panel-${id}`} tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)} onKeyDown={(event) => {
      let next: number;
      if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
      else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = TABS.length - 1;
      else return;
      event.preventDefault(); onChange(TABS[next].id);
      document.getElementById(`${prefix}-tab-${TABS[next].id}`)?.focus();
    }}><Icon size={15} aria-hidden="true" />{label}</button>)}
  </div>;
}

export const productEditorFieldClass = "product-editor-input";

// Link labels to real inputs even when the input sits in a suggestion wrapper.
// Upload buttons and quantity controls remain outside labels.
const isFieldControl = (node: { type?: unknown; props: { type?: string } }) =>
  (["input", "textarea", "select"].includes(String(node.type)) && node.props.type !== "file") ||
  (typeof node.type === "function" && (node.type as { isFieldControl?: boolean }).isFieldControl === true);

export function ProductEditorField({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  const id = useId();
  const findControl = (nodes: ReactNode): ReactNode => {
    for (const node of Children.toArray(nodes)) {
      if (!isValidElement<{ children?: ReactNode; type?: string }>(node)) continue;
      if (isFieldControl(node)) return node;
      const nested = findControl(node.props.children);
      if (nested) return nested;
    }
    return null;
  };
  const control = findControl(children);
  const attach = (nodes: ReactNode): ReactNode => Children.map(nodes, (node) => {
    if (!isValidElement<{ children?: ReactNode; type?: string; id?: string; "aria-required"?: boolean }>(node)) return node;
    if (isFieldControl(node)) return cloneElement(node, { id, "aria-required": required });
    return node.props.children ? cloneElement(node, { children: attach(node.props.children) }) : node;
  });
  const linked = Boolean(control);
  const content = attach(children);
  return <div className="product-editor-field">
    {linked ? <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label> : <p className="product-editor-field-label">{label}</p>}
    {content}
  </div>;
}

export function useProductEditorPanel(isOpen: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      frame = 0;
      const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      ref.current?.style.setProperty("--editor-keyboard-inset", `${Math.round(inset)}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); viewport?.addEventListener("resize", schedule); viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);
  return ref;
}

// A titled block of related fields ("Товар", "Каталог", "Ціна і залишок").
export function ProductEditorSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="product-editor-section">
    <div className="product-editor-section-head"><h3>{title}</h3>{aside}</div>
    {children}
  </section>;
}

type SuggestLoader = (query: string, signal: AbortSignal) => Promise<string[]>;

const readSuggestions = (url: string, signal: AbortSignal) =>
  fetch(url, { signal }).then((response) => response.json() as Promise<{ suggestions?: string[] }>).then((data) => data.suggestions ?? []);

export const loadProducerSuggestions: SuggestLoader = (query, signal) =>
  readSuggestions(`/api/producers-suggest?q=${encodeURIComponent(query)}`, signal);

export const loadCatalogMetaSuggestions = (type: "category" | "group" | "subGroup", parent?: string): SuggestLoader => (query, signal) => {
  const params = new URLSearchParams({ type });
  if (query.trim()) params.set("q", query);
  if (parent?.trim()) params.set("parent", parent);
  return readSuggestions(`/api/catalog-meta-suggest?${params}`, signal);
};

// Text input with a suggestion list: opens on focus, filters while typing
// (debounced, the previous request aborted), arrows + Enter pick, Escape
// closes only the list. Escape is marked handled so the panel stays open.
export function ProductSuggestInput({ id, value, onChange, onPick, load, placeholder, inputRef, ...aria }: {
  id?: string;
  "aria-required"?: boolean;
  value: string;
  onChange: (value: string) => void;
  onPick?: (value: string) => void;
  load: SuggestLoader;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();
  useEffect(() => () => { abort.current?.abort(); if (timer.current) clearTimeout(timer.current); }, []);
  const fetchNow = (query: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    load(query, controller.signal).then((next) => { if (!controller.signal.aborted) { setItems(next); setActive(-1); } }).catch(() => {});
  };
  const fetchSoon = (query: string) => {
    abort.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchNow(query), 200);
  };
  const pick = (next: string) => { onChange(next); setItems([]); setActive(-1); onPick?.(next); };
  return <div className="product-editor-suggest">
    <input ref={inputRef} id={id} aria-required={aria["aria-required"]} type="text" value={value} placeholder={placeholder} autoComplete="off"
      role="combobox" aria-expanded={items.length > 0} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      className="product-editor-input"
      onChange={(event) => { onChange(event.target.value); fetchSoon(event.target.value); }}
      onFocus={() => fetchNow(value)}
      onBlur={() => setTimeout(() => setItems([]), 150)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && items.length) { event.preventDefault(); setActive((index) => Math.min(index + 1, items.length - 1)); }
        else if (event.key === "ArrowUp" && items.length) { event.preventDefault(); setActive((index) => Math.max(index - 1, -1)); }
        else if (event.key === "Enter" && active >= 0 && items[active]) { event.preventDefault(); pick(items[active]); }
        else if (event.key === "Escape" && items.length) { event.preventDefault(); event.stopPropagation(); setItems([]); }
      }} />
    {items.length > 0 && <ul id={listId} role="listbox" className="product-editor-suggest-list app-panel-scroll">
      {items.map((item, index) => <li key={item} id={`${listId}-${index}`} role="option" aria-selected={index === active}
        onMouseDown={(event) => { event.preventDefault(); pick(item); }}>{item}</li>)}
    </ul>}
  </div>;
}

ProductSuggestInput.isFieldControl = true;

// Розділ → Група → Підгрупа, each limited to the level above. Changing a
// level clears the ones below it; picking a value moves focus to the next
// field, which opens its suggestions.
export function ProductCatalogPlacement({ category, group, subGroup, onChange }: {
  category: string;
  group: string;
  subGroup: string;
  onChange: (next: { category: string; group: string; subGroup: string }) => void;
}) {
  const groupRef = useRef<HTMLInputElement>(null);
  const subGroupRef = useRef<HTMLInputElement>(null);
  return <div className="product-editor-placement">
    <ProductEditorField label="Розділ">
      <ProductSuggestInput value={category} placeholder="Гальмівна система" load={loadCatalogMetaSuggestions("category")}
        onChange={(value) => onChange({ category: value, group: "", subGroup: "" })}
        onPick={() => setTimeout(() => groupRef.current?.focus(), 0)} />
    </ProductEditorField>
    <ProductEditorField label="Група">
      <ProductSuggestInput inputRef={groupRef} value={group} placeholder="Гальмівні колодки" load={loadCatalogMetaSuggestions("group", category)}
        onChange={(value) => onChange({ category, group: value, subGroup: "" })}
        onPick={() => setTimeout(() => subGroupRef.current?.focus(), 0)} />
    </ProductEditorField>
    <ProductEditorField label="Підгрупа">
      <ProductSuggestInput inputRef={subGroupRef} value={subGroup} placeholder="Якщо є" load={loadCatalogMetaSuggestions("subGroup", group)}
        onChange={(value) => onChange({ category, group, subGroup: value })} />
    </ProductEditorField>
  </div>;
}

// "Націнка 35 %" from sale and purchase price, when both are set.
export function ProductMarkupBadge({ price, cost }: { price: string; cost: string }) {
  const sale = Number(price.replace(",", "."));
  const purchase = Number(cost.replace(",", "."));
  if (!(sale > 0 && purchase > 0)) return null;
  const markup = Math.round(((sale - purchase) / purchase) * 100);
  return <span className={`product-editor-badge ${markup < 0 ? "is-negative" : ""}`}>Націнка {markup} %</span>;
}
