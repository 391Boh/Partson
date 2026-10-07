"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpRight, BadgePercent } from "lucide-react";
import Link from "next/link";
import { calculatePartnerDiscount, PARTNER_DISCOUNT_PERCENT, PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";

const money = (value: number) => value.toLocaleString("uk-UA");

export default function PartnershipSavings() {
  const [amount, setAmount] = useState(10000);
  const totals = calculatePartnerDiscount(amount, true);
  const rangeProgress = (amount - PARTNER_THRESHOLD_UAH) / (100000 - PARTNER_THRESHOLD_UAH) * 100;

  return (
    <div className="partner-calculator">
      <div className="partner-calculator-heading"><span><BadgePercent size={18} /> Вигода партнера</span><strong>−{PARTNER_DISCOUNT_PERCENT}%</strong></div>
      <div className="partner-calculator-control">
        <div className="partner-calculator-input-heading">
        <label htmlFor="partner-purchase-amount">Сума закупівель</label>
        <p className="partner-calculator-amount">{money(amount)} <span>грн</span></p>
        </div>
        <input id="partner-purchase-amount" type="range" min={PARTNER_THRESHOLD_UAH} max={100000} step={500}
          value={amount} onChange={(event) => setAmount(Number(event.target.value))}
          style={{ "--partner-range-progress": `${rangeProgress}%` } as CSSProperties}
          aria-valuetext={`${money(amount)} гривень`} />
        <div className="partner-calculator-scale"><span>{money(PARTNER_THRESHOLD_UAH)} грн</span><span>100 000 грн</span></div>
        <div className="partner-calculator-presets">
          {[5000, 10000, 25000, 50000].map((value) => (
            <button key={value} type="button" aria-pressed={amount === value}
              onClick={() => setAmount(value)}>{money(value)} грн</button>
          ))}
        </div>
      </div>
      <div className="partner-calculator-result" aria-live="polite" aria-atomic="true">
        <div className="partner-calculator-saving"><span>Залишається вам</span><p><span key={totals.discountAmount} className="partner-savings-number">{money(totals.discountAmount)}</span> <small>грн</small></p></div>
        <div className="partner-calculator-payable"><span>До сплати</span><strong>{money(totals.totalAmount)} <small>грн</small></strong></div>
      </div>
      <div className="partner-calculator-footer"><span>Базова знижка активного партнера</span><Link href="/katalog" className="partner-text-link">У каталог <ArrowUpRight size={15} /></Link></div>
      <details className="partner-calculator-note"><summary>Як розраховано?</summary><p>Приклад застосування базової знижки {PARTNER_DISCOUNT_PERCENT}% після активації партнерства. Спеціальні ціни окремих товарів перевіряйте в каталозі.</p></details>
    </div>
  );
}
