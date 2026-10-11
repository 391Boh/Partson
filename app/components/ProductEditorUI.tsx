"use client";

import { Children, cloneElement, isValidElement, useEffect, useId, useRef, type ReactNode } from "react";
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
export function ProductEditorField({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  const id = useId();
  const findControl = (nodes: ReactNode): ReactNode => {
    for (const node of Children.toArray(nodes)) {
      if (!isValidElement<{ children?: ReactNode; type?: string }>(node)) continue;
      if (["input", "textarea", "select"].includes(String(node.type)) && node.props.type !== "file") return node;
      const nested = findControl(node.props.children);
      if (nested) return nested;
    }
    return null;
  };
  const control = findControl(children);
  const attach = (nodes: ReactNode): ReactNode => Children.map(nodes, (node) => {
    if (!isValidElement<{ children?: ReactNode; type?: string; id?: string; "aria-required"?: boolean }>(node)) return node;
    if (["input", "textarea", "select"].includes(String(node.type)) && node.props.type !== "file") return cloneElement(node, { id, "aria-required": required });
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
