'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ChartNoAxesCombined,
  ClipboardCheck,
  Check,
  ClipboardCopy,
  ExternalLink,
  Pencil,
  Camera,
  Car,
  Download,
  FileText,
  PenLine,
  Loader2,
  PhoneCall,
  RefreshCw,
  SearchX,
  Send,
  Truck,
  X,
} from 'lucide-react';

import { overviewFetch as adminFetch, overviewJson as adminJson, analyticsChange, analyticsDate } from 'app/lib/admin-overview-client';
import { analyticsDayKey, shiftAnalyticsDay, PAYMENT_GROUP_LABEL, type OrderAnalysisSelection, type PaymentGroup } from 'app/lib/admin-order-analytics';
import AdminSalesChart from './AdminSalesChart';
import AdminOrderAnalysis from './AdminOrderAnalysis';
import { ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, type OrderStatus } from 'app/lib/order-status';
import { TELEGRAM_BOT_URL } from 'app/lib/telegram-deeplink';

type Period = { orders: number; revenue: number; avg: number; cancelled: number };
type Alert = {
  id: string;
  name: string;
  phone: string;
  total: number;
  createdAt: number;
  status: OrderStatus;
  reason: 'unread' | 'not_shipped' | 'arrived_waiting' | 'shipped_long';
  sinceMs: number;
};
type Summary = {
  generatedAt: number;
  truncated?: boolean;
  previous?: { today: Period; week: Period; month: Period };
  periods: { today: Period; week: Period; month: Period };
  series: Array<{ day: string; orders: number; revenue: number }>;
  statusCounts: Partial<Record<OrderStatus, number>>;
  alerts: Alert[];
  alertsTotal: number;
  topProducts: Array<{ code: string; article: string; name: string; qty: number; revenue: number; orders: number }>;
  repeatCustomers: Array<{ name: string; phone: string; orders: number; revenue: number }>;
  repeatCustomersTotal: number;
  customersTotal: number;
  payments: { paid: number; pending: number; failed: number; cod: number };
  openCalls: number;
};
type QualityItem = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  group: string;
  subGroup: string;
  priceEuro: number | null;
  category: string;
  costPriceEuro: number | null;
  promoPriceEuro: number | null;
  description: string;
  flags: Record<'stock' | 'visible' | 'price' | 'photo' | 'fitment' | 'description' | 'renamed', boolean>;
  href: string;
};
type MissRow = { query: string; count: number; days: number; lastDay: string };

const SECTION_LABEL = { sales: 'Продажі', catalog: 'Якість каталогу', search: 'Пошук без результатів', telegram: 'Telegram-бот' } as const;
const SECTION_ICON = { sales: ChartNoAxesCombined, catalog: ClipboardCheck, search: SearchX, telegram: Send };
type Section = keyof typeof SECTION_LABEL;

const ALERT_LABEL: Record<Alert['reason'], string> = {
  unread: 'Ніхто не відкрив',
  not_shipped: 'Не відправлено понад добу',
  arrived_waiting: 'Лежить у відділенні',
  shipped_long: 'В дорозі понад 7 днів',
};

const money = (value: number) => `${Math.round(value).toLocaleString('uk-UA')} грн`;

const ageLabel = (sinceMs: number) => {
  const minutes = Math.max(0, Math.round((Date.now() - sinceMs) / 60_000));
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} год`;
  return `${Math.round(hours / 24)} дн`;
};

const kyivToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );
const shiftDay = (day: string, delta: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};

export default function AdminOverview({
  onOpenOrder,
  onOpenCalls,
}: {
  onOpenOrder: (orderId: string, phone: string) => void;
  onOpenCalls: () => void;
}) {
  const [section, setSection] = useState<Section>('sales');
  const tabsId = useId();

  return (
    <div className="admin-overview-content">
      <div className="admin-overview-tabs" role="tablist" aria-label="Розділи огляду"
        onKeyDown={event => {
          const keys = Object.keys(SECTION_LABEL) as Section[];
          const current = keys.indexOf(section);
          const next = event.key === 'ArrowRight' ? (current + 1) % keys.length
            : event.key === 'ArrowLeft' ? (current + keys.length - 1) % keys.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          setSection(keys[next]);
          document.getElementById(`${tabsId}-${keys[next]}`)?.focus();
        }}>
        {(Object.keys(SECTION_LABEL) as Section[]).map((key) => {
          const Icon = SECTION_ICON[key];
          return (
          <button
            key={key}
            id={`${tabsId}-${key}`}
            type="button"
            role="tab"
            aria-selected={section === key}
            aria-controls={`${tabsId}-panel`}
            tabIndex={section === key ? 0 : -1}
            onClick={() => setSection(key)}
          >
            <Icon size={16} aria-hidden="true" /><span>{SECTION_LABEL[key]}</span>
          </button>
        ); })}
      </div>
      <div key={section} id={`${tabsId}-panel`} className="analytics-tab-content" role="tabpanel" aria-labelledby={`${tabsId}-${section}`}>
      {section === 'sales' && <SalesSection onOpenOrder={onOpenOrder} onOpenCalls={onOpenCalls} />}
      {section === 'catalog' && <CatalogQualitySection />}
      {section === 'search' && <SearchMissesSection />}
      {section === 'telegram' && <TelegramBotSection />}
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="admin-overview-section">
      <div className="admin-overview-section-heading">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SmallButton({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="admin-overview-small-button"
    >
      {children}
    </button>
  );
}

function ErrorLine({ message }: { message: string }) {
  return <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{message}</p>;
}

function SalesSection({
  onOpenOrder,
  onOpenCalls,
}: {
  onOpenOrder: (orderId: string, phone: string) => void;
  onOpenCalls: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [npState, setNpState] = useState<{ busy: boolean; text: string | null }>({ busy: false, text: null });
  const [exportFrom, setExportFrom] = useState(() => shiftDay(kyivToday(), -29));
  const [exportTo, setExportTo] = useState(() => kyivToday());
  const [exporting, setExporting] = useState(false);
  const [selection, setSelection] = useState<OrderAnalysisSelection | null>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const scrollPositionRef = useRef(0);
  const openAnalysis = (next: OrderAnalysisSelection, origin: HTMLElement) => {
    originRef.current = origin;
    const scroll = origin.closest<HTMLElement>('.admin-overview-scroll');
    scrollPositionRef.current = scroll?.scrollTop ?? 0;
    setSelection(next);
    if (scroll) scroll.scrollTop = 0;
  };
  const backToOverview = () => {
    setSelection(null);
    requestAnimationFrame(() => {
      const origin = originRef.current;
      const scroll = document.querySelector<HTMLElement>('.admin-overview-scroll');
      if (scroll) scroll.scrollTop = scrollPositionRef.current;
      // Sales overview remounts its controls; restore focus by the stable target id.
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    });
  };


  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await adminJson<Summary>(`/api/admin/orders/summary${refresh ? '?refresh=1' : ''}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося завантажити статистику.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncNp = async () => {
    setNpState({ busy: true, text: null });
    try {
      const result = await adminJson<{ checked: number; statusChanged: number; notified: number; errors: string[]; cached?: boolean }>(
        '/api/admin/orders/np-sync?force=1',
        { method: 'POST' }
      );
      const parts = [`перевірено ТТН: ${result.checked}`, `змінено статусів: ${result.statusChanged}`];
      if (result.notified) parts.push(`повідомлено клієнтів: ${result.notified}`);
      if (result.errors?.length) parts.push(`помилки: ${result.errors.length}`);
      setNpState({ busy: false, text: `Нова Пошта — ${parts.join(', ')}.` });
      void load(true);
    } catch (err) {
      setNpState({ busy: false, text: err instanceof Error ? err.message : 'Не вдалося оновити статуси.' });
    }
  };

  const downloadCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/orders/export?from=${exportFrom}&to=${exportTo}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Не вдалося сформувати файл.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `partson-orders-${exportFrom}_${exportTo}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося сформувати файл.');
    } finally {
      setExporting(false);
    }
  };

  const today = summary ? analyticsDayKey(summary.generatedAt) : exportTo;
  const range = (days: number) => ({ from: shiftAnalyticsDay(today, 1 - days), to: today });


  return (
    <>
    <div className="admin-overview-sales" hidden={Boolean(selection)}>
      <div className="admin-overview-toolbar">
        <SmallButton onClick={() => void load(true)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Оновити
        </SmallButton>
        <SmallButton onClick={() => void syncNp()} disabled={npState.busy} title="Підтягнути статуси ТТН з Нової Пошти">
          {npState.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />} Статуси НП
        </SmallButton>
        {summary && (
          <span className="admin-overview-updated">
            Оновлено {new Date(summary.generatedAt).toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {npState.text && <p className="text-[11px] text-sky-100/90">{npState.text}</p>}
      {error && <ErrorLine message={error} />}
      {!summary && loading && <p role="status" className="py-6 text-center text-sm text-sky-100/80">Завантажуємо показники магазину…</p>}

      {summary && (
        <>
          <div className="admin-overview-periods" aria-label="Продажі за період">
            {([
              ['Сьогодні', 'today', 1], ['7 днів', 'week', 7], ['30 днів', 'month', 30],
            ] as const).map(([label, key, days]) => {
              const period = summary.periods[key];
              const previous = summary.previous?.[key];
              return <button key={key} id={`analytics-period-${key}`} type="button" className="admin-overview-period"
                aria-label={`Аналіз: ${label}`} onClick={event => openAnalysis({ title: label, ...range(days) }, event.currentTarget)}>
                <span className="analytics-period-label">{label}<ArrowUpRight size={13} aria-hidden="true" /></span>
                <strong>{money(period.revenue)}</strong>
                <span>{period.orders} замовлень · чек {money(period.avg)}</span>
                {previous && <span className="analytics-period-comparison">{analyticsChange(period.revenue, previous.revenue)} до попер. {days === 1 ? 'дня' : `${days} днів`}</span>}
              </button>;
            })}
          </div>

          <p className="analytics-note">Сума замовлень без скасованих, а не отримані кошти. Натисніть період для аналізу.{summary.truncated ? ' Дані обмежені першими 5000 замовленнями.' : ''}</p>
          <Card
            title={`Потребує уваги${summary.alertsTotal ? ` · ${summary.alertsTotal}` : ''}`}
            action={
              summary.openCalls > 0 ? (
                <button
                  type="button"
                  onClick={onOpenCalls}
                  className="inline-flex min-h-8 items-center gap-1 rounded-[10px] border border-amber-300/30 bg-amber-500/10 px-2 text-[11px] font-bold text-amber-100 hover:bg-amber-500/20"
                >
                  <PhoneCall className="h-3.5 w-3.5" /> Дзвінки: {summary.openCalls}
                </button>
              ) : null
            }
          >
            {summary.alerts.length === 0 ? (
              <p className="text-xs text-emerald-200">Все опрацьовано — завислих замовлень немає.</p>
            ) : (
              <ul className="space-y-1">
                {summary.alerts.map((alert) => (
                  <li key={alert.id}>
                    <button
                      type="button"
                      onClick={() => onOpenOrder(alert.id, alert.phone)}
                      className="admin-overview-alert"
                    >
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${alert.reason === 'arrived_waiting' ? 'text-rose-300' : 'text-amber-300'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-white">
                          {alert.name || alert.phone || alert.id}
                        </span>
                        <span className="admin-overview-alert-detail">
                          {ALERT_LABEL[alert.reason]} · {ageLabel(alert.sinceMs)} · {money(alert.total)}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${ORDER_STATUS_CLASS[alert.status]}`}>
                        {ORDER_STATUS_LABEL[alert.status]}
                      </span>
                      <ArrowUpRight size={15} className="shrink-0 text-sky-200" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AdminSalesChart series={summary.series} onSelectDay={(day, origin) => openAnalysis({ title: `Аналіз дня · ${analyticsDate(day)}`, from: day, to: day }, origin)} />

          <div className="admin-overview-columns">
            <Card title="Статуси · 60 днів">
              <div className="analytics-breakdown">
                {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).filter(status => summary.statusCounts[status]).map(status => {
                  const total = Object.values(summary.statusCounts).reduce((sum, value) => sum + (value || 0), 0);
                  const count = summary.statusCounts[status] || 0;
                  return <button key={status} id={`analytics-status-${status}`} type="button" onClick={event => openAnalysis({ title: ORDER_STATUS_LABEL[status], status, ...range(60) }, event.currentTarget)}>
                    <span>{ORDER_STATUS_LABEL[status]}</span><span className="analytics-track"><span style={{ width: `${total ? count / total * 100 : 0}%` }} /></span>
                    <b>{count}</b><small>{total ? Math.round(count / total * 100) : 0}%</small><ArrowUpRight size={13} aria-hidden="true" />
                  </button>;
                })}
                {!Object.values(summary.statusCounts).some(Boolean) && <p className="analytics-note">Замовлень за цей період немає.</p>}
              </div>
            </Card>
            <Card title="Оплата · 30 днів">
              <div className="analytics-breakdown">
                {(Object.keys(PAYMENT_GROUP_LABEL) as PaymentGroup[]).map(payment => {
                  const count = summary.payments[payment];
                  const total = Object.values(summary.payments).reduce((sum, value) => sum + value, 0);
                  return <button key={payment} id={`analytics-payment-${payment}`} type="button" onClick={event => openAnalysis({ title: PAYMENT_GROUP_LABEL[payment], payment, ...range(30) }, event.currentTarget)}>
                    <span>{PAYMENT_GROUP_LABEL[payment]}</span><span className="analytics-track"><span style={{ width: `${total ? count / total * 100 : 0}%` }} /></span>
                    <b>{count}</b><small>{total ? Math.round(count / total * 100) : 0}%</small><ArrowUpRight size={13} aria-hidden="true" />
                  </button>;
                })}
              </div>
            </Card>
          </div>

          <div className="admin-overview-columns">
            <Card title="Топ товарів (30 днів)">
              {summary.topProducts.length === 0 ? (
                <p className="text-xs text-slate-400">Продажів ще немає.</p>
              ) : (
                <ol className="space-y-1">
                  {summary.topProducts.map((product, index) => (
                    <li key={`${product.code}-${product.article}-${index}`}>
                      <button type="button" className="analytics-ranked-row" id={`analytics-product-${index}`}
                        onClick={event => openAnalysis({ title: product.name || product.article || product.code, product: product.code || product.article || product.name, ...range(30) }, event.currentTarget)}>
                        <span className="analytics-row-rank">{index + 1}</span>
                        <span className="analytics-row-name"><b>{product.article || product.code}</b><span>{product.name}</span></span>
                        <span className="analytics-row-value"><b>{money(product.revenue)}</b><small>{product.qty} шт · {product.orders} замовл.</small></span>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card title={`Повторні клієнти · ${summary.repeatCustomersTotal} з ${summary.customersTotal}`}>
              {summary.repeatCustomers.length === 0 ? (
                <p className="text-xs text-slate-400">За 30 днів повторних замовлень немає.</p>
              ) : (
                <ul className="space-y-1">
                  {summary.repeatCustomers.map((customer) => (
                    <li key={customer.phone}>
                      <button type="button" className="analytics-ranked-row" id={`analytics-customer-${customer.phone.replace(/\D/g, '')}`}
                        onClick={event => openAnalysis({ title: customer.name || customer.phone, phone: customer.phone, ...range(30) }, event.currentTarget)}>
                        <span className="analytics-row-name"><b>{customer.name || customer.phone}</b><span>{customer.phone}</span></span>
                        <span className="analytics-row-value"><b>{money(customer.revenue)}</b><small>{customer.orders} замовлення</small></span>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <details className="admin-overview-export">
        <summary><Download size={15} aria-hidden="true" />Експорт замовлень у CSV</summary>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-slate-300">
            Від
            <input
              type="date"
              aria-label="Експорт замовлень: від"
              value={exportFrom}
              max={exportTo}
              onChange={(e) => setExportFrom(e.target.value)}
              className="mt-0.5 block h-9 rounded-[10px] border border-white/12 bg-slate-950/50 px-2 text-sm text-white [color-scheme:dark]"
            />
          </label>
          <label className="text-[10px] text-slate-300">
            До
            <input
              type="date"
              aria-label="Експорт замовлень: до"
              value={exportTo}
              min={exportFrom}
              onChange={(e) => setExportTo(e.target.value)}
              className="mt-0.5 block h-9 rounded-[10px] border border-white/12 bg-slate-950/50 px-2 text-sm text-white [color-scheme:dark]"
            />
          </label>
          <SmallButton onClick={() => void downloadCsv()} disabled={exporting || !exportFrom || !exportTo}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Завантажити
          </SmallButton>
        </div>
      </details>
    </div>
    {selection && <AdminOrderAnalysis selection={selection} onBack={backToOverview} onOpenOrder={onOpenOrder} />}
    </>
  );
}

type QualityAttr = 'stock' | 'visible' | 'price' | 'photo' | 'fitment' | 'description' | 'renamed';
type QualityMode = 'any' | 'yes' | 'no';
type QualitySort = 'quantity' | 'name' | 'price' | 'code' | 'issues';
type QualityResponse = {
  catalogTotal: number;
  total: number;
  items: QualityItem[];
  hasMore: boolean;
  facets: Record<QualityAttr, { yes: number; no: number }>;
};

const QUALITY_ATTRS: Array<{ key: QualityAttr; label: string; hint: string }> = [
  { key: 'stock', label: 'Склад', hint: 'Є на складі' },
  { key: 'visible', label: 'Видимий', hint: 'Видимий покупцям і Google (є ціна й фото)' },
  { key: 'price', label: 'Ціна', hint: 'Ціна продажу' },
  { key: 'photo', label: 'Фото', hint: 'Фото товару' },
  { key: 'fitment', label: 'Застосовн.', hint: 'Застосовність (1-й рядок опису)' },
  { key: 'description', label: 'Опис', hint: 'Опис товару' },
  { key: 'renamed', label: 'Назва ред.', hint: 'Назва у форматі: запчастина + модель авто + (артикул/аналоги в дужках)' },
];

const QUALITY_SORTS: Array<{ key: QualitySort; label: string }> = [
  { key: 'quantity', label: 'Залишок' },
  { key: 'price', label: 'Ціна' },
  { key: 'name', label: 'Назва' },
  { key: 'code', label: 'Код' },
  { key: 'issues', label: 'Проблеми' },
];

const EMPTY_MODES: Record<QualityAttr, QualityMode> = {
  stock: 'any', visible: 'any', price: 'any', photo: 'any', fitment: 'any', description: 'any', renamed: 'any',
};

const QUALITY_PRESETS: Array<{ id: string; label: string; modes: Partial<Record<QualityAttr, QualityMode>>; sort: QualitySort; dir: 'asc' | 'desc' }> = [
  { id: 'hidden', label: 'Приховані в наявності', modes: { stock: 'yes', visible: 'no' }, sort: 'quantity', dir: 'desc' },
  { id: 'no-price', label: 'Без ціни в наявності', modes: { stock: 'yes', price: 'no' }, sort: 'quantity', dir: 'desc' },
  { id: 'no-photo', label: 'Без фото в наявності', modes: { stock: 'yes', photo: 'no' }, sort: 'quantity', dir: 'desc' },
  { id: 'no-fitment', label: 'Без застосовності', modes: { stock: 'yes', fitment: 'no' }, sort: 'quantity', dir: 'desc' },
  { id: 'name-todo', label: 'Назви не у форматі (в наявності)', modes: { stock: 'yes', renamed: 'no' }, sort: 'quantity', dir: 'desc' },
  { id: 'renamed', label: 'Назви у форматі', modes: { renamed: 'yes' }, sort: 'name', dir: 'asc' },
  { id: 'worst', label: 'Найменш заповнені', modes: { stock: 'yes' }, sort: 'issues', dir: 'desc' },
];

const FLAG_COLUMNS: Array<{ key: Exclude<QualityAttr, 'stock' | 'visible'>; label: string; icon: React.ReactNode }> = [
  { key: 'price', label: 'Ціна', icon: <span className="text-[10px] font-black leading-none">€</span> },
  { key: 'photo', label: 'Фото', icon: <Camera className="h-3 w-3" /> },
  { key: 'fitment', label: 'Застосовність', icon: <Car className="h-3 w-3" /> },
  { key: 'description', label: 'Опис', icon: <FileText className="h-3 w-3" /> },
  { key: 'renamed', label: 'Назва у форматі (запчастина + авто + аналоги)', icon: <PenLine className="h-3 w-3" /> },
];

const sameModes = (a: Record<QualityAttr, QualityMode>, b: Partial<Record<QualityAttr, QualityMode>>) =>
  QUALITY_ATTRS.every(({ key }) => a[key] === (b[key] ?? 'any'));

const fieldClass =
  'h-8 rounded-[9px] border border-white/12 bg-slate-950/50 text-xs text-white [color-scheme:dark] focus:border-sky-300/60 focus:outline-none';

function FilterPill({
  attr,
  mode,
  counts,
  onChange,
}: {
  attr: (typeof QUALITY_ATTRS)[number];
  mode: QualityMode;
  counts?: { yes: number; no: number };
  onChange: (mode: QualityMode) => void;
}) {
  const toggle = (next: 'yes' | 'no') => onChange(mode === next ? 'any' : next);
  const format = (value?: number) => (value === undefined ? '' : value.toLocaleString('uk-UA'));
  return (
    <div
      className={`inline-flex h-8 items-stretch overflow-hidden rounded-[9px] border text-[11px] ${
        mode === 'any' ? 'border-white/10 bg-white/[0.03]' : 'border-sky-300/40 bg-sky-400/10'
      }`}
      title={attr.hint}
    >
      <span className={`flex items-center px-2 font-bold ${mode === 'any' ? 'text-slate-300' : 'text-white'}`}>{attr.label}</span>
      <button
        type="button"
        aria-pressed={mode === 'yes'}
        aria-label={`${attr.hint}: є`}
        onClick={() => toggle('yes')}
        className={`flex w-[3.9rem] items-center justify-center gap-0.5 border-l border-white/8 px-1.5 tabular-nums transition ${
          mode === 'yes' ? 'bg-emerald-500/30 text-emerald-50' : 'text-emerald-300/80 hover:bg-white/8'
        }`}
      >
        <Check className="h-3 w-3" />
        {format(counts?.yes)}
      </button>
      <button
        type="button"
        aria-pressed={mode === 'no'}
        aria-label={`${attr.hint}: немає`}
        onClick={() => toggle('no')}
        className={`flex w-[3.9rem] items-center justify-center gap-0.5 border-l border-white/8 px-1.5 tabular-nums transition ${
          mode === 'no' ? 'bg-rose-500/30 text-rose-50' : 'text-rose-300/80 hover:bg-white/8'
        }`}
      >
        <X className="h-3 w-3" />
        {format(counts?.no)}
      </button>
    </div>
  );
}

function CatalogQualitySection() {
  const [modes, setModes] = useState<Record<QualityAttr, QualityMode>>({ ...EMPTY_MODES, ...QUALITY_PRESETS[0].modes });
  const [sort, setSort] = useState<QualitySort>('quantity');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      for (const { key } of QUALITY_ATTRS) if (modes[key] !== 'any') params.set(key, modes[key]);
      if (query.trim()) params.set('q', query.trim());
      params.set('sort', sort);
      params.set('dir', dir);
      if (offset) params.set('offset', String(offset));
      return `/api/admin/catalog-quality?${params.toString()}`;
    },
    [modes, query, sort, dir]
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      adminJson<QualityResponse>(buildUrl(0))
        .then((result) => !cancelled && setData(result))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Помилка'))
        .finally(() => !cancelled && setLoading(false));
    }, query ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [buildUrl, query]);

  const loadMore = async () => {
    if (!data) return;
    setLoading(true);
    try {
      const next = await adminJson<QualityResponse>(buildUrl(data.items.length));
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  };

  // After a save in the product editor, reload what is on screen so the row
  // reflects the change (and drops out if it no longer matches the filters).
  const [reloadTick, setReloadTick] = useState(0);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  useEffect(() => {
    const onSaved = () => setReloadTick((value) => value + 1);
    window.addEventListener('partson:product-admin-saved', onSaved);
    return () => window.removeEventListener('partson:product-admin-saved', onSaved);
  }, []);
  const shownCount = data?.items.length ?? 0;
  useEffect(() => {
    if (!reloadTick) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const pages = Math.max(1, Math.ceil(shownCount / 100));
        let merged: QualityResponse | null = null;
        for (let page = 0; page < pages; page += 1) {
          const next: QualityResponse = await adminJson<QualityResponse>(buildUrl(page * 100));
          merged = merged ? { ...next, items: [...merged.items, ...next.items] } : next;
          if (!next.hasMore) break;
        }
        if (!cancelled && merged) setData(merged);
      } catch {
        // Keep the current list; the next filter change reloads it anyway.
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only a save triggers this; filters have their own loader above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick]);

  const openEditor = (item: QualityItem) => {
    setEditingCode(item.code);
    window.dispatchEvent(
      new CustomEvent('partson:open-product-edit', {
        detail: {
          code: item.code,
          article: item.article,
          name: item.name,
          producer: item.producer,
          category: item.category,
          group: item.group,
          subGroup: item.subGroup,
          priceEuro: item.priceEuro,
          costPriceEuro: item.costPriceEuro,
          promoPriceEuro: item.promoPriceEuro,
          quantity: item.quantity,
          description: item.description,
          layer: 'admin',
        },
      })
    );
  };

  const [copyState, setCopyState] = useState<{ busy: boolean; text: string | null }>({ busy: false, text: null });
  const copyArticles = async () => {
    setCopyState({ busy: true, text: null });
    try {
      const result = await adminJson<{ articles: string[] }>(`${buildUrl(0)}&export=articles`);
      const text = result.articles.join('\n');
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        copied = document.execCommand('copy');
        area.remove();
      }
      setCopyState({
        busy: false,
        text: copied ? `Скопійовано ${result.articles.length.toLocaleString('uk-UA')}` : 'Не вдалося скопіювати',
      });
    } catch (err) {
      setCopyState({ busy: false, text: err instanceof Error ? err.message : 'Не вдалося скопіювати' });
    }
    setTimeout(() => setCopyState((state) => (state.busy ? state : { busy: false, text: null })), 2500);
  };

  const activePreset = QUALITY_PRESETS.find((preset) => sameModes(modes, preset.modes))?.id ?? '';
  const applyPreset = (id: string) => {
    const preset = QUALITY_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setModes({ ...EMPTY_MODES, ...preset.modes });
    setSort(preset.sort);
    setDir(preset.dir);
  };
  const activeFilters = QUALITY_ATTRS.filter(({ key }) => modes[key] !== 'any').length;

  return (
    <section className="rounded-[16px] border border-white/7 bg-[image:linear-gradient(180deg,rgba(30,41,59,0.78),rgba(15,23,42,0.7))] text-slate-100 sm:rounded-[20px]">
      <div className="space-y-1.5 border-b border-white/8 p-2 sm:p-2.5">
        <div className="flex flex-wrap gap-1.5">
          <label className="relative min-w-0 flex-[1_1_200px]">
            <span className="sr-only">Пошук товару</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Артикул, назва, виробник, група"
              className={`${fieldClass} w-full px-2.5 text-[16px] placeholder:text-[12px] placeholder:text-slate-500 sm:text-xs`}
            />
          </label>
          <select
            value={activePreset}
            onChange={(e) => applyPreset(e.target.value)}
            aria-label="Швидкий вибір"
            className={`${fieldClass} min-w-0 flex-[1_1_170px] px-2 font-bold`}
          >
            <option value="" disabled>
              Швидкий вибір…
            </option>
            {QUALITY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <div className="flex shrink-0">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as QualitySort)}
              aria-label="Сортування"
              className={`${fieldClass} rounded-r-none px-2 font-bold`}
            >
              {QUALITY_SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  ↕ {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setDir((value) => (value === 'asc' ? 'desc' : 'asc'))}
              aria-label={dir === 'asc' ? 'За зростанням' : 'За спаданням'}
              title={dir === 'asc' ? 'За зростанням' : 'За спаданням'}
              className={`${fieldClass} -ml-px w-8 rounded-l-none font-black hover:bg-white/8`}
            >
              {dir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUALITY_ATTRS.map((attr) => (
            <FilterPill
              key={attr.key}
              attr={attr}
              mode={modes[attr.key]}
              counts={data?.facets[attr.key]}
              onChange={(mode) => setModes((previous) => ({ ...previous, [attr.key]: mode }))}
            />
          ))}
        </div>
        <div className="flex min-h-6 items-center gap-2 text-[11px] text-slate-400">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-sky-300" aria-hidden />}
          <span className="tabular-nums">
            {data ? (
              <>
                Знайдено <b className="text-white">{data.total.toLocaleString('uk-UA')}</b> з{' '}
                {data.catalogTotal.toLocaleString('uk-UA')}
              </>
            ) : (
              'Аналізуємо каталог…'
            )}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={() => setModes({ ...EMPTY_MODES })}
                className="rounded-[7px] px-1.5 py-0.5 font-bold text-slate-300 hover:bg-white/8 hover:text-white"
              >
                Скинути
              </button>
            )}
            <button
              type="button"
              onClick={() => void copyArticles()}
              disabled={copyState.busy || !data?.total}
              title="Скопіювати артикули всіх знайдених товарів у поточному порядку — по одному в рядку"
              className={`inline-flex items-center gap-1 rounded-[7px] border px-2 py-0.5 font-bold transition disabled:opacity-50 ${
                copyState.text?.startsWith('Скопійовано')
                  ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100'
                  : 'border-white/12 bg-white/5 text-slate-100 hover:bg-white/10'
              }`}
            >
              {copyState.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : copyState.text?.startsWith('Скопійовано') ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
              {copyState.text ?? `Артикули${data ? ` (${data.total.toLocaleString('uk-UA')})` : ''}`}
            </button>
          </span>
        </div>
      </div>

      {error && (
        <div className="p-2">
          <ErrorLine message={error} />
        </div>
      )}
      {data && data.items.length === 0 && <p className="p-3 text-xs text-emerald-200">Нічого не знайдено.</p>}
      {data && data.items.length > 0 && (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_4.25rem_2rem] items-center gap-2 border-b border-white/6 py-1 pl-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            <span>Товар</span>
            <span className="flex gap-0.5">
              {FLAG_COLUMNS.map((column) => (
                <span key={column.key} title={column.label} className="flex h-4 w-5 items-center justify-center">
                  {column.icon}
                </span>
              ))}
            </span>
            <span className="text-right">Залишок</span>
            <span aria-hidden />
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {data.items.map((item) => (
              <li key={item.code} className={`flex items-stretch ${editingCode === item.code ? 'bg-violet-500/10' : ''}`}>
                <button
                  type="button"
                  onClick={() => openEditor(item)}
                  title={`Редагувати · код ${item.code} · ${item.subGroup || item.group || 'без групи'}`}
                  className="group grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_4.25rem] items-center gap-2 py-1 pl-2.5 pr-1 text-left text-xs hover:bg-white/[0.06] focus-visible:bg-white/[0.08] focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1 text-slate-100">
                      <span className="truncate">
                        <b className="text-sky-100">{item.article || item.code}</b> {item.name}
                      </span>
                      <Pencil className="h-3 w-3 shrink-0 text-violet-300 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                    </span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {item.producer}
                      {item.subGroup || item.group ? ` · ${item.subGroup || item.group}` : ''}
                    </span>
                  </span>
                  <span className="flex gap-0.5">
                    {FLAG_COLUMNS.map((column) => {
                      const on = item.flags[column.key];
                      return (
                        <span
                          key={column.key}
                          title={`${column.label}: ${on ? 'є' : 'немає'}`}
                          aria-label={`${column.label}: ${on ? 'є' : 'немає'}`}
                          className={`flex h-5 w-5 items-center justify-center rounded-[5px] ${
                            on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/12 text-rose-300/70'
                          }`}
                        >
                          {column.icon}
                        </span>
                      );
                    })}
                  </span>
                  <span className="text-right text-[11px] leading-tight tabular-nums">
                    <span className={`block ${item.quantity > 0 ? 'text-emerald-200' : 'text-slate-500'}`}>
                      {item.quantity > 0 ? `${item.quantity} шт` : '—'}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {item.priceEuro != null ? `€${item.priceEuro.toFixed(2)}` : 'без ціни'}
                    </span>
                  </span>
                </button>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Відкрити ${item.article || item.code} на сайті`}
                  title="Відкрити на сайті"
                  className="flex w-8 shrink-0 items-center justify-center text-slate-500 hover:bg-white/[0.06] hover:text-sky-200"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
          {data.hasMore && (
            <div className="border-t border-white/6 p-2 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loading}
                className="min-h-8 rounded-[9px] px-3 text-[11px] font-bold text-sky-200 hover:bg-white/8 disabled:opacity-60"
              >
                Показати ще ({(data.total - data.items.length).toLocaleString('uk-UA')})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type BotAnalytics = {
  days: number;
  totals: Record<string, number>;
  daily: Array<{ date: string; totalEvents: number; events: Record<string, number> }>;
};

const BOT_SOURCE_LABEL: Record<string, string> = {
  site: 'Сайт', footer: 'Футер сайту', contacts: 'Контакти', product: 'Сторінка товару', outofstock: 'Товар під замовлення',
  landing: 'Сторінка /telegram', order: 'Після замовлення', google: 'Google', gbp: 'Google Карти (профіль)',
  ads: 'Google Ads', email: 'Email', qr: 'QR-код', facebook: 'Facebook', other: 'Інше',
};

// Steps of the bot's sales funnel, as classified in app/api/telegram/bot.
const BOT_FUNNEL: Array<{ key: string; label: string }> = [
  { key: 'text_search_or_reply', label: 'Пошуки й повідомлення' },
  { key: 'product_list_open', label: 'Відкриття товарів' },
  { key: 'add_to_cart', label: 'Додано в кошик' },
  { key: 'checkout_start', label: 'Почали оформлення' },
  { key: 'checkout_confirm', label: 'Підтвердили замовлення' },
];

const BOT_OTHER_EVENTS: Array<{ key: string; label: string }> = [
  { key: 'listing_filter', label: 'Фільтри підбору' },
  { key: 'catalog_navigation', label: 'Навігація каталогом' },
  { key: 'stock_watch', label: 'Підписки на наявність' },
  { key: 'support_start', label: 'Звернення до менеджера' },
  { key: 'contact_shared', label: 'Поділились телефоном' },
  { key: 'processing_error', label: 'Помилки обробки' },
];

function TelegramBotSection() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<BotAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    adminJson<BotAnalytics>(`/api/telegram/analytics?days=${days}`)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Помилка'));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const totals = data?.totals ?? {};
  const sources = Object.entries(totals)
    .filter(([key]) => key.startsWith('start_src_'))
    .map(([key, count]) => ({ key: key.slice('start_src_'.length), count }))
    .sort((a, b) => b.count - a.count);
  const sourceTotal = sources.reduce((sum, source) => sum + source.count, 0);
  const daily = [...(data?.daily ?? [])].reverse();
  const maxDaily = Math.max(1, ...daily.map((day) => day.totalEvents));
  const confirmed = totals.checkout_confirm ?? 0;
  const funnelTop = Math.max(1, ...BOT_FUNNEL.map((step) => totals[step.key] ?? 0));

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex items-center gap-1.5">
        {[7, 30, 90].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDays(value)}
            aria-pressed={days === value}
            className={`min-h-8 rounded-[9px] px-2.5 text-[11px] font-bold ${days === value ? 'bg-sky-400/20 text-white' : 'text-slate-300 hover:bg-white/8'}`}
          >
            {value} дн
          </button>
        ))}
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-[9px] px-2 text-[11px] font-bold text-sky-200 hover:bg-white/8"
        >
          Відкрити бота
        </a>
      </div>
      {error && <ErrorLine message={error} />}
      {!data && !error && <p className="py-6 text-center text-xs text-slate-400">Завантаження…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
            {[
              ['Входи з міткою', sourceTotal],
              ['Пошуки', totals.text_search_or_reply ?? 0],
              ['Додано в кошик', totals.add_to_cart ?? 0],
              ['Замовлення', confirmed],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-[14px] border border-sky-200/15 bg-sky-500/8 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-sky-100/75">{label}</p>
                <p className="mt-1 text-lg font-black tabular-nums text-white">{(value as number).toLocaleString('uk-UA')}</p>
              </div>
            ))}
          </div>

          <Card title="Звідки приходять у бота">
            {sources.length === 0 ? (
              <p className="text-xs text-slate-400">
                Ще немає входів за посиланнями з міткою. Вони з’являться після деплою: кнопки на сайті, сторінка /telegram,
                посилання з ?start=src_… у Google-профілі й рекламі.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {sources.map((source) => (
                  <li key={source.key} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-slate-100">{BOT_SOURCE_LABEL[source.key] ?? source.key}</span>
                      <span className="tabular-nums text-slate-300">
                        {source.count} · {Math.round((source.count / Math.max(1, sourceTotal)) * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-sky-400/80" style={{ width: `${(source.count / Math.max(1, sourceTotal)) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Воронка продажів у боті">
            <ul className="space-y-1.5">
              {BOT_FUNNEL.map((step) => {
                const value = totals[step.key] ?? 0;
                return (
                  <li key={step.key} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-slate-100">{step.label}</span>
                      <span className="tabular-nums text-slate-300">{value.toLocaleString('uk-UA')}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${(value / funnelTop) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">
              Кількість дій, а не людей: одна людина може шукати чи додавати в кошик кілька разів.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Card title={`Активність по днях · ${data.days} дн`}>
              <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Кількість дій у боті по днях">
                {daily.map((day) => (
                  <div
                    key={day.date}
                    className="min-w-0 flex-1 rounded-t-[3px] bg-sky-400/70"
                    style={{ height: `${Math.max(2, (day.totalEvents / maxDaily) * 90)}px` }}
                    title={`${day.date}: ${day.totalEvents} дій`}
                  />
                ))}
              </div>
            </Card>
            <Card title="Інші дії">
              <ul className="space-y-1 text-xs">
                {BOT_OTHER_EVENTS.map((event) => (
                  <li key={event.key} className="flex justify-between gap-2">
                    <span className="text-slate-300">{event.label}</span>
                    <span className={`tabular-nums ${event.key === 'processing_error' && (totals[event.key] ?? 0) > 0 ? 'text-rose-300' : 'text-slate-100'}`}>
                      {(totals[event.key] ?? 0).toLocaleString('uk-UA')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SearchMissesSection() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<MissRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    adminJson<{ items: MissRow[] }>(`/api/admin/search-misses?days=${days}`)
      .then((data) => !cancelled && setRows(data.items))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Помилка'));
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <Card
      title="Шукали, але не знайшли"
      action={
        <div className="flex gap-1">
          {[7, 30].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              aria-pressed={days === value}
              className={`min-h-8 rounded-[9px] px-2 text-[11px] font-bold ${
                days === value ? 'bg-sky-400/20 text-white' : 'text-slate-300 hover:bg-white/8'
              }`}
            >
              {value} дн
            </button>
          ))}
        </div>
      }
    >
      <p className="mb-2 text-[11px] text-slate-400">
        Повні пошукові запити на сайті, що не дали жодного товару. Часті запити — кандидати на закупівлю або на
        синонім/аналог у назві товару.
      </p>
      {error && <ErrorLine message={error} />}
      {!rows && !error && <p className="py-3 text-center text-xs text-slate-400">Завантаження…</p>}
      {rows && rows.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-300">
          <SearchX className="h-4 w-4" /> Поки що немає запитів без результатів — збір щойно увімкнено.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.query} className="flex items-center gap-2 rounded-[10px] bg-white/[0.03] px-2 py-1 text-xs">
              <a
                href={`/katalog?search=${encodeURIComponent(row.query)}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-white hover:text-sky-200"
              >
                {row.query}
              </a>
              <span className="shrink-0 text-[10px] text-slate-400">{row.days} дн</span>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-black tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
