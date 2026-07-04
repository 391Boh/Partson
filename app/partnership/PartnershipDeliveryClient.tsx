"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  MapPin, Package, Navigation, Check, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, Pencil, X,
} from "lucide-react";
import Image from "next/image";
import { db } from "../../firebase";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";

interface CityOrWarehouse { Description: string; Ref: string }
type DeliveryMethodType = "Нова Пошта" | "Доставка у Львові" | "Самовивіз" | "";

interface SavedDelivery {
  deliveryMethod: DeliveryMethodType;
  deliveryCity: CityOrWarehouse | null;
  deliveryWarehouse: CityOrWarehouse | null;
  deliveryLvivStreet: string | null;
}

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: T) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function PartnershipDeliveryClient() {
  const { ready, user } = useFirebaseAuthState();

  /* saved state */
  const [saved, setSaved] = useState<SavedDelivery | null>(null);
  const [loading, setLoading] = useState(true);

  /* form state */
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<DeliveryMethodType>("");
  const [cities, setCities] = useState<CityOrWarehouse[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [selectedCity, setSelectedCity] = useState<CityOrWarehouse | null>(null);
  const [warehouses, setWarehouses] = useState<CityOrWarehouse[]>([]);
  const [warehouseInput, setWarehouseInput] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<CityOrWarehouse | null>(null);
  const [lvivStreet, setLvivStreet] = useState("");
  const [lvivStreets, setLvivStreets] = useState<string[]>([]);
  const [selectedLvivStreet, setSelectedLvivStreet] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");

  /* load saved */
  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!cancelled && snap.exists()) {
          const d = snap.data();
          const s: SavedDelivery = {
            deliveryMethod: d.deliveryMethod || "",
            deliveryCity: d.deliveryCity || null,
            deliveryWarehouse: d.deliveryWarehouse || null,
            deliveryLvivStreet: d.deliveryLvivStreet || null,
          };
          setSaved(s);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, user]);

  /* open edit — prefill from saved */
  const openEdit = () => {
    if (saved) {
      setMethod(saved.deliveryMethod);
      setSelectedCity(saved.deliveryCity);
      setCityInput(saved.deliveryCity?.Description ?? "");
      setSelectedWarehouse(saved.deliveryWarehouse);
      setWarehouseInput(saved.deliveryWarehouse?.Description ?? "");
      setSelectedLvivStreet(saved.deliveryLvivStreet);
      setLvivStreet(saved.deliveryLvivStreet ?? "");
    }
    setEditing(true);
    setSaveStatus("idle");
  };

  /* fetch NP cities once per edit session */
  useEffect(() => {
    if (!editing || method !== "Нова Пошта" || cities.length > 0) return;
    let cancelled = false;
    fetch("/api/novaposhta", {
      method: "POST",
      body: JSON.stringify({ modelName: "Address", calledMethod: "getCities" }),
    })
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.data) setCities(d.data); });
    return () => { cancelled = true; };
  }, [editing, method, cities.length]);

  /* fetch warehouses when city chosen */
  useEffect(() => {
    if (!selectedCity) { setWarehouses([]); return; }
    let cancelled = false;
    fetch("/api/novaposhta", {
      method: "POST",
      body: JSON.stringify({ modelName: "Address", calledMethod: "getWarehouses", methodProperties: { CityRef: selectedCity.Ref } }),
    })
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.data) setWarehouses(d.data); });
    return () => { cancelled = true; };
  }, [selectedCity]);

  /* Lviv street autocomplete */
  const fetchLvivStreets = useMemo(() => debounce(async (v: string) => {
    if (v.length < 2) { setLvivStreets([]); return; }
    try {
      const r = await fetch(`/api/photon/streets?street=${encodeURIComponent(v)}`);
      const d = await r.json();
      if (Array.isArray(d)) setLvivStreets(d.filter((s: string) => s.toLowerCase().includes(v.toLowerCase())));
    } catch { setLvivStreets([]); }
  }, 380), []);

  const handleMethodChange = (m: DeliveryMethodType) => {
    setMethod(m);
    setSelectedCity(null); setCityInput(""); setCities([]);
    setSelectedWarehouse(null); setWarehouseInput(""); setWarehouses([]);
    setSelectedLvivStreet(null); setLvivStreet(""); setLvivStreets([]);
  };

  const filteredCities = cityInput
    ? cities.filter(c => c.Description.replace(/\(.*?\)/g, "").toLowerCase().includes(cityInput.toLowerCase())).slice(0, 8)
    : [];
  const filteredWarehouses = warehouseInput
    ? warehouses.filter(w => w.Description.toLowerCase().includes(warehouseInput.toLowerCase())).slice(0, 8)
    : [];

  const canSave =
    (method === "Нова Пошта" && selectedCity && selectedWarehouse) ||
    (method === "Доставка у Львові" && selectedLvivStreet) ||
    method === "Самовивіз";

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaveStatus("saving");
    try {
      const payload: Record<string, unknown> = { deliveryMethod: method };
      if (method === "Нова Пошта") {
        payload.deliveryCity = selectedCity;
        payload.deliveryWarehouse = selectedWarehouse;
        payload.deliveryLvivStreet = null;
      } else if (method === "Доставка у Львові") {
        payload.deliveryLvivStreet = selectedLvivStreet;
        payload.deliveryCity = null;
        payload.deliveryWarehouse = null;
      } else {
        payload.deliveryCity = null;
        payload.deliveryWarehouse = null;
        payload.deliveryLvivStreet = null;
      }
      await setDoc(doc(db, "users", user.uid), payload, { merge: true });
      const newSaved: SavedDelivery = {
        deliveryMethod: method,
        deliveryCity: method === "Нова Пошта" ? selectedCity : null,
        deliveryWarehouse: method === "Нова Пошта" ? selectedWarehouse : null,
        deliveryLvivStreet: method === "Доставка у Львові" ? selectedLvivStreet : null,
      };
      setSaved(newSaved);
      setSaveStatus("ok");
      setTimeout(() => { setEditing(false); setSaveStatus("idle"); }, 1200);
    } catch {
      setSaveStatus("err");
    }
  };

  /* ── NOT LOGGED IN ── */
  if (!ready || loading) {
    return (
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-[10px] bg-sky-100/60" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-36 animate-pulse rounded-full bg-sky-100/60" />
            <div className="h-2 w-52 animate-pulse rounded-full bg-sky-100/40" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  /* ── VIEW MODE (saved address) ── */
  if (!editing) {
    const hasSaved = saved?.deliveryMethod;
    return (
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

          <div className="min-w-0">
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-500/80">Збережена адреса доставки</p>

            {!hasSaved ? (
              <p className="text-[13px] font-medium text-slate-400">
                Налаштуйте зручну адресу — вона автоматично підставляється при оформленні замовлення
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {saved.deliveryMethod === "Нова Пошта" && (
                  <>
                    <Image src="/nova-poshta-logo.svg" alt="Nova Poshta" width={80} height={21} className="shrink-0" />
                    {saved.deliveryCity && (
                      <span className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700">
                        <MapPin size={11} className="text-slate-400" />
                        {saved.deliveryCity.Description}
                      </span>
                    )}
                    {saved.deliveryWarehouse && (
                      <span className="flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-700">
                        <Package size={11} />
                        {saved.deliveryWarehouse.Description}
                      </span>
                    )}
                  </>
                )}
                {saved.deliveryMethod === "Доставка у Львові" && (
                  <>
                    <span className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
                      <Navigation size={11} />
                      Власна доставка по Львову
                    </span>
                    {saved.deliveryLvivStreet && (
                      <span className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700">
                        <MapPin size={11} className="text-slate-400" />
                        {saved.deliveryLvivStreet}
                      </span>
                    )}
                  </>
                )}
                {saved.deliveryMethod === "Самовивіз" && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[12px] font-bold text-sky-700">
                    <Package size={11} />
                    Самовивіз — вул. Перфецького, 8
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={openEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-sky-200/70 bg-sky-50 px-3.5 py-2 text-[12px] font-bold text-sky-700 transition-colors hover:bg-sky-100"
          >
            <Pencil size={12} strokeWidth={2.2} />
            {hasSaved ? "Змінити" : "Налаштувати"}
          </button>

        </div>
      </div>
    );
  }

  /* ── EDIT MODE ── */
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-500/80">
          Налаштування доставки
        </p>
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:text-slate-600">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* method tabs */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {([
          { val: "Нова Пошта" as const, icon: null, np: true, label: "Нова Пошта" },
          { val: "Доставка у Львові" as const, np: false, icon: Navigation, label: "По Львову" },
          { val: "Самовивіз" as const, np: false, icon: Package, label: "Самовивіз" },
        ]).map(({ val, np, icon: Icon, label }) => {
          const active = method === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => handleMethodChange(val)}
              className={`flex flex-col items-center gap-1 rounded-[12px] border px-3 py-2.5 text-[11px] font-bold transition-all ${
                active
                  ? "border-sky-300/70 bg-sky-50 text-sky-700 shadow-[0_2px_8px_rgba(14,165,233,0.12)]"
                  : "border-slate-200/80 bg-white/60 text-slate-500 hover:border-sky-200 hover:text-sky-600"
              }`}
            >
              {np ? (
                <Image src="/nova-poshta-logo.svg" alt="Nova Poshta" width={44} height={12} className={active ? "opacity-100" : "opacity-50"} />
              ) : Icon ? (
                <Icon size={15} strokeWidth={1.8} />
              ) : null}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* NP fields */}
      {method === "Нова Пошта" && (
        <div className="space-y-3">
          <CityField
            input={cityInput}
            onInput={v => { setCityInput(v); setSelectedCity(null); setSelectedWarehouse(null); setWarehouseInput(""); }}
            selected={selectedCity}
            options={filteredCities}
            onSelect={c => { setSelectedCity(c); setCityInput(c.Description); setSelectedWarehouse(null); setWarehouseInput(""); }}
            placeholder="Введіть місто..."
            label="Місто"
          />
          {selectedCity && (
            <CityField
              input={warehouseInput}
              onInput={v => { setWarehouseInput(v); setSelectedWarehouse(null); }}
              selected={selectedWarehouse}
              options={filteredWarehouses}
              onSelect={w => { setSelectedWarehouse(w); setWarehouseInput(w.Description); }}
              placeholder="Номер або адреса відділення..."
              label="Відділення / поштомат"
              icon={<Package size={13} className="text-slate-400" />}
            />
          )}
        </div>
      )}

      {/* Lviv courier */}
      {method === "Доставка у Львові" && (
        <div className="relative">
          <label className="mb-1 block text-[11px] font-semibold text-slate-500">Вулиця та номер будинку</label>
          <div className="relative">
            <Navigation size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={lvivStreet}
              onChange={e => { setLvivStreet(e.target.value); setSelectedLvivStreet(null); fetchLvivStreets(e.target.value); }}
              placeholder="вул. Шевченка, 10..."
              className="w-full rounded-[10px] border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          {lvivStreets.length > 0 && !selectedLvivStreet && (
            <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-[10px] border border-slate-200 bg-white shadow-lg">
              {lvivStreets.map(s => (
                <li key={s}>
                  <button type="button" onClick={() => { setSelectedLvivStreet(s); setLvivStreet(s); setLvivStreets([]); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-slate-700 hover:bg-sky-50">
                    <MapPin size={11} className="shrink-0 text-slate-400" />
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* pickup info */}
      {method === "Самовивіз" && (
        <div className="flex items-center gap-2 rounded-[10px] border border-sky-100 bg-sky-50 px-3.5 py-2.5">
          <MapPin size={14} className="shrink-0 text-sky-500" />
          <div>
            <p className="text-[12.5px] font-bold text-sky-800">вул. Перфецького, 8, Львів</p>
            <p className="text-[11.5px] text-sky-600/70">Пн–Пт: 9:00–18:00 · Сб: 9:00–14:00</p>
          </div>
        </div>
      )}

      {/* save */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saveStatus === "saving" || saveStatus === "ok"}
          className={`inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[12.5px] font-bold transition-all ${
            saveStatus === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : saveStatus === "err"
              ? "border border-red-200 bg-red-50 text-red-700"
              : canSave
              ? "border border-sky-300/70 bg-sky-500 text-white hover:bg-sky-600"
              : "border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saveStatus === "saving" && <Loader2 size={13} className="animate-spin" />}
          {saveStatus === "ok" && <CheckCircle2 size={13} />}
          {saveStatus === "err" && <AlertCircle size={13} />}
          {saveStatus === "idle" && <Check size={13} strokeWidth={2.4} />}
          {saveStatus === "saving" ? "Збереження…" : saveStatus === "ok" ? "Збережено!" : saveStatus === "err" ? "Помилка" : "Зберегти"}
        </button>
        <p className="text-[11px] font-medium text-slate-400">
          Підставляється при оформленні замовлення
        </p>
      </div>
    </div>
  );
}

/* ── reusable dropdown field ── */
function CityField({
  input, onInput, selected, options, onSelect, placeholder, label, icon,
}: {
  input: string; onInput: (v: string) => void;
  selected: CityOrWarehouse | null;
  options: CityOrWarehouse[]; onSelect: (c: CityOrWarehouse) => void;
  placeholder: string; label: string; icon?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {icon ?? <MapPin size={13} className="text-slate-400" />}
        </span>
        <input
          type="text"
          value={input}
          onChange={e => { onInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-[10px] border border-slate-200 bg-white py-2 pl-8 pr-8 text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
        />
        <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        {selected && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <Check size={13} className="text-emerald-500" />
          </span>
        )}
      </div>
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-[10px] border border-slate-200 bg-white shadow-lg">
          {options.map(o => (
            <li key={o.Ref}>
              <button type="button"
                onClick={() => { onSelect(o); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-slate-700 hover:bg-sky-50">
                <MapPin size={11} className="shrink-0 text-slate-400" />
                <span className="truncate">{o.Description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
