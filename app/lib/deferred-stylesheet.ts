"use client";

import { whenFullStylesheetReady } from "./full-stylesheet";

const pending = new Map<string, Promise<void>>();

/** Load window/admin styles on intent, in parallel with their JavaScript.
 * A rejected CSS request can be retried; an unstyled window never mounts. */
export function whenDeferredStylesheetReady(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const href = document.querySelector<HTMLMetaElement>('meta[name="partson-deferred-css"]')?.content;
  // Standalone fixtures and legacy HTML already load the combined stylesheet.
  if (!href) return Promise.resolve();
  const existing = pending.get(href);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.deferredUiStyles = "";
    const fail = () => {
      clearTimeout(timeout);
      link.onload = link.onerror = null;
      link.remove(); pending.delete(href);
      reject(new Error("Не вдалося завантажити стилі вікна"));
    };
    const timeout = setTimeout(fail, 15_000);
    link.onload = () => {
      clearTimeout(timeout);
      for (const previous of document.querySelectorAll<HTMLLinkElement>("link[data-deferred-ui-styles]")) {
        if (previous !== link) previous.remove();
      }
      resolve();
    };
    link.onerror = fail;
    document.head.appendChild(link);
  });
  pending.set(href, promise);
  return promise;
}

export async function loadDeferredUi<T>(load: () => Promise<T>): Promise<T> {
  const [, , module] = await Promise.all([whenDeferredStylesheetReady(), whenFullStylesheetReady(), load()]);
  return module;
}
