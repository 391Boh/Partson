import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, ChevronRight, ScanLine, Store } from 'lucide-react';
import { Suspense } from 'react';
import HeroBlogCard, { HeroBlogCardFallback } from './HeroBlogCard';

export default function HeroIntroCard() {

  return (
    <div className="home-intro home-intro-refined">
      <div className="home-intro-copy">
        <div className="home-intro-identity">
          <span className="home-intro-icon" aria-hidden="true"><Store size={21} strokeWidth={1.8} /></span>
          <p className="home-intro-kicker">Інтернет-каталог автозапчастин</p>
        </div>
        <h1 className="font-display font-display-readable">
          Автозапчастини <span>у Львові</span>
        </h1>
        <p className="home-intro-subtitle">
          Оригінальні деталі та перевірені аналоги для десятків марок легкових авто — з власного складу у Львові.
        </p>
        <ul className="home-intro-facts">
          <li>
            <span className="home-intro-facts-icon home-intro-facts-icon-cyan" aria-hidden="true">
              <ScanLine size={13} strokeWidth={2.3} />
            </span>
            <span>Підбір за VIN-кодом, кузовом або артикулом</span>
          </li>
          <li>
            <span className="home-intro-facts-icon home-intro-facts-icon-emerald" aria-hidden="true">
              <BadgeCheck size={13} strokeWidth={2.3} />
            </span>
            <span>Наявність і ціна — одразу, без зайвих дзвінків</span>
          </li>
        </ul>
      </div>

      <div className="home-intro-links home-feature-links">
        <Link href="/inform/diagnostics" prefetch={false} className="home-feature-card">
          <div className="home-feature-image home-feature-image-service">
            <Image
              src="/Katlogo/datchyky_ta_elektronika.png"
              alt=""
              fill
              sizes="(max-width: 479px) 80px, 96px"
              className="object-contain"
            />
          </div>
          <div className="home-feature-copy">
            <span className="home-feature-label">Послуга</span>
            <h2>Комп’ютерна діагностика</h2>
            <span className="home-feature-action">Дізнатися більше <ChevronRight size={14} aria-hidden="true" /></span>
          </div>
        </Link>
        <Suspense fallback={<HeroBlogCardFallback />}>
          <HeroBlogCard />
        </Suspense>
      </div>
    </div>
  );
}
