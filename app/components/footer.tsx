'use client';

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowUpRight, Clock3, Mail, MapPin, Phone } from "lucide-react";
import SmartLink from "app/components/SmartLink";
import AnalyticsConsentSettingsButton from "app/components/AnalyticsConsentSettingsButton";
import { observeViewportEntrance } from "app/lib/viewport-entrance";
import { SELLER_NAME, SELLER_TAX_ID } from "app/lib/seo-metadata";
import { SiTelegram, SiViber } from "./FooterSocialIcons";

const telegramBotName = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "StormStoreAvto_bot").replace(/^@/u, "").trim();
const messengers = [
  { label: "Telegram", Icon: SiTelegram, href: `https://t.me/${encodeURIComponent(telegramBotName)}` },
  { label: "Viber", Icon: SiViber, href: "https://viber.me/380634211851" },
];
const catalogLinks = [
  { href: "/katalog", label: "Усі запчастини" },
  { href: "/auto", label: "Марки і моделі" },
  { href: "/groups", label: "Категорії товарів" },
  { href: "/manufacturers", label: "Виробники" },
];
const customerLinks = [
  { href: "/inform/about", label: "Про нас" },
  { href: "/inform/delivery", label: "Доставка" },
  { href: "/inform/payment", label: "Оплата" },
  { href: "/inform/returns", label: "Повернення" },
  { href: "/inform/diagnostics", label: "Діагностика" },
  { href: "/blog", label: "Блог" },
];

function FooterNavigation({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <nav className="site-footer-nav" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {links.map(({ href, label }) => (
          <li key={href}>
            <SmartLink href={href} className="site-footer-link">
              <span>{label}</span><ArrowUpRight size={15} aria-hidden="true" />
            </SmartLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer() {
  const headingRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const heading = headingRef.current;
    return heading ? observeViewportEntrance(heading, 6) : undefined;
  }, []);

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Kyiv", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const check = () => {
      const parts = formatter.formatToParts(new Date());
      const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
      const hour = Number(read("hour")) + Number(read("minute")) / 60;
      setIsOpen(hour >= 8 && hour < (read("weekday") === "Sun" ? 16 : 18));
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleBrandClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== "/" || window.scrollY <= 0) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <footer className="site-footer" aria-label="Інформація та контакти PartsON">
      <div className="page-shell-inline site-footer-shell">
        <div className="site-footer-intro" ref={headingRef}>
          <div className="site-footer-intro-copy">
            <h2>Допоможемо знайти <span>вашу деталь.</span></h2>
            <p>Зверніться до нас за телефоном або в месенджері.</p>
          </div>
          <a href="tel:+380634211851" className="site-footer-call" aria-label="Зателефонувати PartsON: +38 (063) 421-18-51">
            <Phone size={21} strokeWidth={1.8} aria-hidden="true" />
            <span>+38 (063) 421-18-51</span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </a>
        </div>

        <div className="site-footer-main">
          <div className="site-footer-brand">
            <div className="site-footer-brand-head">
              <SmartLink href="/" onClick={handleBrandClick} className="site-footer-logo" aria-label="PartsON — головна сторінка">
                <Image
                  src="/partson-logo-v3.webp" alt="PartsON" width={184} height={100}
                  sizes="(max-width: 767px) 112px, 156px" quality={90}
                  onError={event => {
                    const image = event.currentTarget;
                    if (image.dataset.fallbackApplied) return;
                    image.dataset.fallbackApplied = "1";
                    image.src = "/partson-mark-v3.webp";
                  }}
                />
              </SmartLink>
              <p>Інтернет-магазин автозапчастин. Львів та доставка по Україні.</p>
            </div>
            <div className="site-footer-messengers" role="group" aria-label="Зв’язатися в месенджері">
              {messengers.map(({ label, Icon, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Відкрити ${label} PartsON`}>
                  <Icon size={18} aria-hidden="true" /><span>{label}</span>
                </a>
              ))}
            </div>
          </div>

          <FooterNavigation title="Каталог" links={catalogLinks} />
          <FooterNavigation title="Покупцеві" links={customerLinks} />

          <section className="site-footer-contacts" aria-labelledby="footer-contacts-heading">
            <h3 id="footer-contacts-heading">Контакти</h3>
            <address>
              <SmartLink href="/inform/location" className="site-footer-contact">
                <MapPin size={18} aria-hidden="true" />
                <span><strong>вул. Перфецького, 8</strong><span>Львів, Україна</span></span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </SmartLink>
              <a href="mailto:romaniukbboogg@gmail.com" className="site-footer-contact site-footer-email">
                <Mail size={18} aria-hidden="true" /><span>romaniukbboogg@gmail.com</span>
              </a>
            </address>
            <div className="site-footer-hours">
              <Clock3 size={18} aria-hidden="true" />
              <div>
                <p>Пн–Сб: <span>08:00–18:00</span></p>
                <p>Нд: <span>08:00–16:00</span></p>
                <span className="site-footer-status" data-open={isOpen === null ? undefined : isOpen} aria-live="polite">
                  <span aria-hidden="true" />{isOpen === null ? "Графік роботи магазину" : isOpen ? "Працюємо зараз" : "Зараз зачинено"}
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="site-footer-bottom">
          <div className="site-footer-utility">
            <SmartLink href="/inform/payment" className="site-footer-payment" aria-label="Оплата карткою через LiqPay — умови оплати">
              <span><Image src="/liqpay-logo.svg" alt="LiqPay" width={500} height={104} sizes="86px" /></span>
              <span>Оплата карткою через LiqPay</span>
            </SmartLink>
            <nav className="site-footer-legal" aria-label="Правила та налаштування сайту">
              <SmartLink href="/inform/privacy">Конфіденційність</SmartLink>
              <SmartLink href="/oferta">Публічна оферта</SmartLink>
              <SmartLink href="/editorial-policy">Редакційна політика</SmartLink>
              <AnalyticsConsentSettingsButton />
            </nav>
          </div>
          <p className="site-footer-copyright">© {new Date().getFullYear()} PartsON. Усі права захищено. Продавець: {SELLER_NAME}, РНОКПП {SELLER_TAX_ID}.</p>
        </div>
      </div>
    </footer>
  );
}
