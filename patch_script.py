from pathlib import Path
p = Path('app/components/Data.tsx')
text = p.read_text(encoding='utf-8')
old = '''        const res = await fetch(${PROXY_ROUTE}?endpoint=getdata, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Помилка сервера");

        const raw = await res.json();
        if (cancelled) return;

        const itemsArray = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.items)
          ? (raw as { items: unknown[] }).items
          : [];

        const normalized = itemsArray.map(normalizeProduct);

        setData((prev) => (page === 1 ? normalized : [...prev, ...normalized]));
        setHasMore(normalized.length === ITEMS_PER_PAGE);

        if (page === 1 && normalized.length > 0) {
          try {
            window.sessionStorage.setItem(
              cacheKey,
              JSON.stringify({ items: normalized })
            );
          } catch {}
        }
'''
new = '''        const runRequest = async (payload: Record<string, unknown>) => {
          const res = await fetch(${PROXY_ROUTE}?endpoint=getdata, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("Помилка сервера");
          const raw = await res.json();
          const itemsArray = Array.isArray(raw)
            ? raw
            : Array.isArray((raw as Record<string, unknown>)?.items)
            ? (raw as { items: unknown[] }).items
            : [];
          return itemsArray.map(normalizeProduct);
        };

        let normalized = await runRequest(makeBody(primaryKeys));
        if (!cancelled && normalized.length === 0 && fallbackKeys) {
          normalized = await runRequest(makeBody(fallbackKeys));
        }
        if (cancelled) return;

        setData((prev) => (page === 1 ? normalized : [...prev, ...normalized]));
        setHasMore(normalized.length === ITEMS_PER_PAGE);

        if (page === 1 && normalized.length > 0) {
          try {
            window.sessionStorage.setItem(
              cacheKey,
              JSON.stringify({ items: normalized })
            );
          } catch {}
        }
'''
if old not in text:
    raise SystemExit('target block not found')
p.write_text(text.replace(old, new), encoding='utf-8')
