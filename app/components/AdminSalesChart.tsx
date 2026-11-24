"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { analyticsDate, analyticsMoney } from "app/lib/admin-overview-client";

export type SalesDay = { day: string; orders: number; revenue: number };
type Metric = "revenue" | "orders" | "avg";
const METRICS: Record<Metric, string> = { revenue: "Сума", orders: "Замовлення", avg: "Середній чек" };

export default function AdminSalesChart({ series, onSelectDay }: {
  series: SalesDay[];
  onSelectDay: (day: string, origin: HTMLElement) => void;
}) {
  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState<Metric>("revenue");
  const [selected, setSelected] = useState<string | null>(null);
  const visible = series.slice(-days);
  const chosen = visible.find(day => day.day === selected) ?? visible.at(-1);
  const value = (day: SalesDay) => metric === "avg" ? day.orders ? day.revenue / day.orders : 0 : day[metric];
  const total = visible.reduce((sum, day) => sum + day.revenue, 0);
  const count = visible.reduce((sum, day) => sum + day.orders, 0);
  const peak = Math.max(1, ...visible.map(value));
  const best = visible.reduce<SalesDay | null>((leader, day) => !leader || value(day) > value(leader) ? day : leader, null);
  const format = (amount: number) => metric === "orders" ? `${Math.round(amount)} замовлень` : analyticsMoney(amount);
  return <section className="admin-overview-section admin-sales-chart" aria-label="Динаміка замовлень">
    <div className="admin-overview-section-heading"><h3>Динаміка замовлень</h3>
      <div className="analytics-segments" role="group" aria-label="Період графіка">
        {[7, 14, 30].map(range => <button key={range} type="button" aria-pressed={days === range}
          onClick={() => { setDays(range); setSelected(null); }}>{range} днів</button>)}
      </div>
    </div>
    <div className="analytics-chart-toolbar">
      <div className="analytics-segments" role="group" aria-label="Показник графіка">
        {(Object.keys(METRICS) as Metric[]).map(key => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>{METRICS[key]}</button>)}
      </div>
      <span>{metric === "orders" ? `${count} замовлень` : metric === "avg" ? analyticsMoney(count ? total / count : 0) : analyticsMoney(total)}</span>
    </div>
    {visible.length ? <>
      <div className="analytics-chart-scroll" aria-label="Графік по днях">
        <div className="analytics-chart-bars" style={{ minWidth: `${visible.length * 36}px` }}>
          {visible.map(day => <button key={day.day} id={`analytics-day-${day.day}`} type="button" className="analytics-day" aria-pressed={chosen?.day === day.day}
            aria-label={`${analyticsDate(day.day)}: ${format(value(day))}. Відкрити аналіз дня`}
            onFocus={() => setSelected(day.day)} onMouseEnter={() => setSelected(day.day)}
            onKeyDown={event => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const neighbor = event.key === "ArrowRight" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
              if (neighbor instanceof HTMLButtonElement) neighbor.focus();
            }}
            onClick={event => onSelectDay(day.day, event.currentTarget)}>
            <span className="analytics-day-column"><span style={{ height: `${Math.max(2, value(day) / peak * 100)}%` }} /></span>
            <span className="analytics-day-label">{day.day.slice(8)}</span>
          </button>)}
        </div>
      </div>
      {chosen && <div className="analytics-chart-caption" aria-live="polite">
        <span>{analyticsDate(chosen.day)} · <b>{format(value(chosen))}</b></span>
        <button type="button" onClick={event => onSelectDay(chosen.day, event.currentTarget)}>Аналіз дня <ArrowUpRight size={14} aria-hidden="true" /></button>
      </div>}
      <p className="analytics-note">{best && value(best) > 0 ? `Найбільше: ${analyticsDate(best.day)} · ${format(value(best))}. ` : "За цей період замовлень немає. "}Натисніть день для деталей.</p>
    </> : <p className="analytics-note">Поки немає даних для графіка.</p>}
  </section>;
}
