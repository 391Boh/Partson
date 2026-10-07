import Image from "next/image";
import { BadgeCheck, ScanLine, Package, ArrowUpRight } from "lucide-react";
import { PARTNER_DISCOUNT_PERCENT, PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";

export function PartsGraphic() {
  return (
    <figure className="partner-parts-graphic partner-graphic" data-partner-drift="0.075">
      <div className="partner-graphic-art">
        <Image src="/images/partnership-parts.svg" width={800} height={520} alt="Ілюстрація гальмівного диска, фільтра та колодки зі схемою підбору запчастин" />
        <details className="partner-hotspot partner-hotspot--vin"><summary><ScanLine size={15} /> Підбір за VIN <span>+</span></summary><p>VIN допомагає уточнити сумісність деталі з вашим автомобілем. Зверніться до PartsON перед замовленням.</p></details>
        <details className="partner-hotspot partner-hotspot--stock"><summary><Package size={15} /> Наявність <span>+</span></summary><p>Залишок і актуальну ціну перевіряйте на картці товару в каталозі.</p></details>
        <details className="partner-hotspot partner-hotspot--offer"><summary><BadgeCheck size={15} /> Ціна партнера <span>+</span></summary><p>Увійдіть у партнерський акаунт, щоб побачити спеціальні пропозиції на окремі товари.</p></details>
      </div>
      <figcaption><span>ДЕТАЛІ МАЮТЬ ЗНАЧЕННЯ</span><p>Натисніть на підказку — дізнайтеся більше про підбір і закупівлю.</p></figcaption>
    </figure>
  );
}

export function MembershipGraphic() {
  return (
    <div className="partner-membership-graphic partner-graphic" data-partner-drift="-0.06">
      <div className="partner-membership-card">
        <div className="partner-membership-top"><span>PARTSON <small>PARTNER</small></span><BadgeCheck size={24} /></div>
        <div className="partner-membership-discount">−{PARTNER_DISCOUNT_PERCENT}<span>%</span></div>
        <p>Ваша перевага на наступні замовлення</p>
        <div className="partner-membership-bottom"><span>СТО / МАГАЗИН / МЕХАНІК</span><ArrowUpRight size={21} /></div>
      </div>
      <div className="partner-membership-caption"><BadgeCheck size={19} /><p><strong>Статус активується автоматично</strong><span>Після замовлень на {PARTNER_THRESHOLD_UAH.toLocaleString("uk-UA")} грн у вашому акаунті.</span></p></div>
    </div>
  );
}

export function DeliveryGraphic() {
  return (
    <figure className="partner-delivery-graphic partner-graphic" data-partner-drift="0.055" data-partner-drift-axis="x">
      <div className="partner-delivery-graphic-heading"><span>ВІД НАШОГО СКЛАДУ ДО ВАШОЇ СПРАВИ</span><p>Один постачальник. Зручні маршрути.</p></div>
      <div className="partner-route-art">
        <Image src="/images/partnership-delivery.svg" width={900} height={420} alt="Ілюстрація доставки: склад, автомобіль PartsON та пункт отримання" />
        <span className="partner-route-label partner-route-label--start">PartsON · Львів</span>
        <span className="partner-route-label partner-route-label--end">Ваше СТО чи магазин</span>
        <span className="partner-route-label partner-route-label--ukraine">Нова пошта · Україна</span>
      </div>
      <figcaption>Оберіть власну доставку у Львові, самовивіз або відправлення Новою поштою.</figcaption>
    </figure>
  );
}
