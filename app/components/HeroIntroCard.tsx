import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Store } from 'lucide-react';
import HeroBlogCard from './HeroBlogCard';

export default function HeroIntroCard() {

  return (
    <div className="home-intro home-intro-refined">
      <div className="home-intro-copy">
        <div className="home-intro-identity">
          <span className="home-intro-icon" aria-hidden="true"><Store size={17} strokeWidth={1.8} /></span>
          <p className="home-intro-kicker">PartsON · магазин автозапчастин</p>
        </div>
        <h1 className="font-display font-display-readable">
          Автозапчастини <span>у Львові</span>
        </h1>
        <p className="home-intro-subtitle">
          <strong>Запчастини для ТО та ремонту легкових авто.</strong>{" "}
          Знаходьте деталі за артикулом, порівнюйте ціни й наявність у каталозі.
          Потрібна перевірка сумісності? Допоможемо з підбором за VIN.{" "}
          <strong>Самовивіз у Львові та доставка по Україні.</strong>
        </p>
      </div>

      <div className="home-intro-links home-feature-links">
        <Link href="/inform/diagnostics" prefetch={false} className="home-feature-card">
          <div className="home-feature-image home-feature-image-service">
            <Image
              src="/Katlogo/datchyky_ta_elektronika.png"
              alt=""
              fill
              sizes="(max-width: 479px) 88px, 108px"
              className="object-contain"
            />
          </div>
          <div className="home-feature-copy">
            <span className="home-feature-label">Послуга</span>
            <h2>Комп’ютерна діагностика</h2>
            <span className="home-feature-action">Дізнатися більше <ChevronRight size={14} aria-hidden="true" /></span>
          </div>
        </Link>
        <HeroBlogCard />
      </div>
    </div>
  );
}
