import { HOME_SECTION_IDS } from 'app/lib/home-sections';
import HeroSectionLink from './HeroSectionLink';
import { Car, ChevronRight, LayoutGrid, MapPin, Truck } from 'lucide-react';
import HeroVinCheckButton from './HeroVinCheckButton';

// One job: get the visitor to a part. Search lives in the header, so the
// hero offers the three ways to pick one: by car, by category, or a VIN
// compatibility check from the profile.
export default function HeroIntroCard() {
  return (
    <div className="home-intro home-intro-refined">
      <div className="home-intro-copy">
        <h1 className="font-display font-display-readable">
          Запчастини для авто <span>у Львові</span>
        </h1>
        <p className="home-intro-subtitle">
          Для ТО та ремонту легкових авто. Оберіть, як підібрати деталь:
        </p>
      </div>

      <ul className="home-part-paths" aria-label="Способи підбору запчастин">
        <li>
          <HeroSectionLink targetId={HOME_SECTION_IDS.auto} className="home-part-path home-part-path-primary">
            <span className="home-part-path-icon">
              <Car size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="home-part-path-text">
              <span className="home-part-path-title">Підбір по авто</span>
              <span className="home-part-path-hint">Марка, модель і рік — покажемо лише сумісні деталі</span>
            </span>
            <ChevronRight className="home-part-path-arrow" size={18} strokeWidth={2} aria-hidden="true" />
          </HeroSectionLink>
        </li>
        <li>
          <HeroSectionLink targetId={HOME_SECTION_IDS.categories} className="home-part-path">
            <span className="home-part-path-icon">
              <LayoutGrid size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="home-part-path-text">
              <span className="home-part-path-title">Вибір категорії</span>
              <span className="home-part-path-hint">Гальма, підвіска, двигун, фільтри — від групи до потрібної деталі</span>
            </span>
            <ChevronRight className="home-part-path-arrow" size={18} strokeWidth={2} aria-hidden="true" />
          </HeroSectionLink>
        </li>
        <li>
          <HeroVinCheckButton />
        </li>
      </ul>

      <p className="home-intro-trust-line">
        <span><MapPin size={14} strokeWidth={2} aria-hidden="true" />Самовивіз у Львові</span>
        <span><Truck size={14} strokeWidth={2} aria-hidden="true" />Доставка по Україні</span>
      </p>
    </div>
  );
}
