"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { PAYMENT_GROUP_LABEL, type OrderAnalysisResponse, type OrderAnalysisSelection } from "app/lib/admin-order-analytics";
import { analyticsChange, analyticsDate, analyticsMoney, overviewJson } from "app/lib/admin-overview-client";
import { ORDER_STATUS_CLASS, ORDER_STATUS_LABEL } from "app/lib/order-status";

export default function AdminOrderAnalysis({ selection, onBack, onOpenOrder }: {
  selection: OrderAnalysisSelection; onBack: () => void;
  onOpenOrder: (id: string, phone: string) => void;
}) {
  const [data, setData] = useState<OrderAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const loadMoreLock = useRef(false);
  const query = new URLSearchParams({ from: selection.from, to: selection.to });
  for (const key of ["status", "payment", "product", "phone"] as const) if (selection[key]) query.set(key, selection[key]);
  const baseUrl = `/api/admin/orders/analysis?${query}`;
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setData(null); setError(null); setLoadingMore(false); loadMoreLock.current = false;
    headingRef.current?.focus({ preventScroll: true });
    overviewJson<OrderAnalysisResponse>(baseUrl, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Не вдалося завантажити аналіз."); });
    return () => controller.abort();
  }, [baseUrl, revision]);
  const loadMore = async () => {
    if (!data || loadMoreLock.current) return;
    loadMoreLock.current = true; setLoadingMore(true); setError(null);
    const controller = controllerRef.current;
    try {
      const result = await overviewJson<OrderAnalysisResponse>(`${baseUrl}&offset=${data.rows.length}`, { signal: controller?.signal });
      if (!controller?.signal.aborted) setData(previous => previous ? { ...result, rows: [...previous.rows, ...result.rows.filter(row => !previous.rows.some(existing => existing.id === row.id))] } : result);
    } catch (err) {
      if (!controller?.signal.aborted) setError(err instanceof Error ? err.message : "Не вдалося завантажити замовлення.");
    } finally { if (!controller?.signal.aborted) { setLoadingMore(false); loadMoreLock.current = false; } }
  };
  return <div className="admin-analytics-detail">
    <div className="analytics-detail-header">
      <button type="button" className="analytics-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> До огляду</button>
      <h3 ref={headingRef} tabIndex={-1}>{selection.title}</h3>
      <p>{analyticsDate(selection.from)} — {analyticsDate(selection.to)}</p>
    </div>
    {!data && !error && <p className="analytics-loading" role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Завантажуємо аналіз…</p>}
    {error && <div className="analytics-error" role="alert"><p>{error}</p><button type="button" onClick={() => data ? void loadMore() : setRevision(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />Спробувати ще</button></div>}
    {data && <>
      {data.truncated && <p className="analytics-note" role="status">Розрахунок за першими 5000 замовленнями кожного періоду. Порівняння неповне — звузьте період.</p>}
      <dl className="analytics-detail-metrics">
        <div><dt>Сума замовлень</dt><dd>{analyticsMoney(data.totals.revenue)}</dd><span>{analyticsChange(data.totals.revenue, data.previous.totals.revenue)}</span></div>
        <div><dt>Замовлень</dt><dd>{data.totals.orders}</dd><span>{analyticsChange(data.totals.orders, data.previous.totals.orders)}</span></div>
        <div><dt>Середній чек</dt><dd>{analyticsMoney(data.totals.avg)}</dd><span>{analyticsChange(data.totals.avg, data.previous.totals.avg)}</span></div>
      </dl>
      <p className="analytics-note">Порівняння: {analyticsDate(data.previous.from)} — {analyticsDate(data.previous.to)} · {data.previous.totals.orders} замовлень · {analyticsMoney(data.previous.totals.revenue)}. Поточний день може бути незавершеним.</p>
      <dl className="analytics-outcomes">
        <div><dt>Онлайн оплати</dt><dd>{analyticsMoney(data.totals.paidRevenue)}</dd></div>
        <div><dt>Виконано</dt><dd>{data.totals.completed}</dd></div>
        <div><dt>Повернення</dt><dd>{data.totals.returned}</dd></div>
        <div><dt>Скасовано</dt><dd>{data.totals.cancelled}</dd></div>
      </dl>
      <p className="analytics-note">Сума й середній чек — без скасованих замовлень. Це вартість замовлень, а не отримані кошти.{selection.product ? " Показані повні суми замовлень, що містять цей товар." : ""}</p>
      <div className="analytics-order-list-heading"><h4>Замовлення · {data.total}</h4><span>{data.rows.length} з {data.total}</span></div>
      {!data.rows.length ? <p className="analytics-empty">За цими умовами замовлень немає. Поверніться до огляду й оберіть інший день або показник.</p> : <ul className="analytics-order-list">
        {data.rows.map(order => <li key={order.id}>
          <button type="button" onClick={() => onOpenOrder(order.id, order.phone)}>
            <span className="analytics-order-identity"><strong>{order.name || order.phone || order.id}</strong><span>{new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(order.createdAt))} · {order.phone || "Телефон не вказано"}</span><span>{order.itemNames.join(" · ") || "Без переліку товарів"}</span></span>
            <span className="analytics-order-total"><b>{analyticsMoney(order.total)}</b><span className={ORDER_STATUS_CLASS[order.status]}>{ORDER_STATUS_LABEL[order.status]}</span><small>{PAYMENT_GROUP_LABEL[order.payment]}</small></span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </li>)}
      </ul>}
      {data.hasMore && <button type="button" className="analytics-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}Показати ще</button>}
    </>}
  </div>;
}
