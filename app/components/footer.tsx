'use client';

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import SmartLink from "app/components/SmartLink";
import {
  FaAngleRight,
  FaBoxes,
  FaCarSide,
  FaClock,
  FaEnvelope,
  FaInfoCircle,
  FaIndustry,
  FaMapMarkerAlt,
  FaNewspaper,
  FaPhoneAlt,
  FaShieldAlt,
  FaTools,
  FaTruck,
  FaWallet,
} from "react-icons/fa";
import { SiFacebook, SiInstagram, SiTelegram } from "react-icons/si";
import React from "react";
import AnalyticsConsentSettingsButton from "app/components/AnalyticsConsentSettingsButton";

const infoLinks = [
  { href: "/inform/about",       icon: FaInfoCircle, label: "Про нас" },
  { href: "/inform/delivery",    icon: FaTruck,      label: "Доставка" },
  { href: "/inform/location",    icon: FaMapMarkerAlt, label: "Локація" },
  { href: "/inform/payment",     icon: FaWallet,     label: "Оплата" },
  { href: "/inform/privacy",     icon: FaShieldAlt,  label: "Конфіденційність" },
  { href: "/auto",               icon: FaCarSide,    label: "Марки і моделі" },
  { href: "/inform/diagnostics", icon: FaTools,      label: "Діагностика" },
  { href: "/blog",               icon: FaNewspaper,  label: "Блог" },
  { href: "/groups",             icon: FaBoxes,      label: "Групи товарів" },
  { href: "/manufacturers",      icon: FaIndustry,   label: "Виробники" },
];

export default function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [atPageBottom, setAtPageBottom] = useState(false);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -24px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const day = now.getDay();
      const h = now.getHours() + now.getMinutes() / 60;
      setIsOpen(day === 0 ? (h >= 8 && h < 16) : (h >= 8 && h < 18));
    };
    check();
  }, []);

  useEffect(() => {
    let rafId = 0;

    const updateBottomState = () => {
      rafId = 0;
      const doc = document.documentElement;
      const scrollBottom = window.scrollY + window.innerHeight;
      const pageHeight = Math.max(doc.scrollHeight, document.body.scrollHeight);
      setAtPageBottom(scrollBottom >= pageHeight - 260);
    };

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateBottomState);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  const baseGradient =
    "radial-gradient(circle at 12% 20%, rgba(14,165,233,0.22), transparent 45%), radial-gradient(circle at 88% 0%, rgba(45,212,191,0.16), transparent 48%), radial-gradient(circle at 52% 95%, rgba(99,102,241,0.10), transparent 52%), linear-gradient(135deg,#f8fafc 0%,#eef4ff 45%,#eaf8fb 100%)";
  const hoverGradient =
    "radial-gradient(circle at 12% 20%, rgba(14,165,233,0.34), transparent 45%), radial-gradient(circle at 88% 0%, rgba(16,185,129,0.22), transparent 48%), radial-gradient(circle at 52% 95%, rgba(99,102,241,0.14), transparent 52%), linear-gradient(135deg,#ffffff 0%,#e0f2fe 46%,#ecfdf5 100%)";

  const infoLinkClass =
    "group/info inline-flex w-full items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-slate-700 no-underline transition-[color,background-color,border-color,box-shadow] duration-150 ease-linear hover:border-sky-100/90 hover:bg-white/78 hover:text-sky-900 hover:shadow-[0_8px_18px_rgba(56,189,248,0.12),inset_0_1px_0_rgba(255,255,255,0.86)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300";

  const infoIconClass =
    "shrink-0 text-[13px] text-sky-600 transition-colors duration-200 group-hover/info:text-sky-800";

  const handleBrandClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== "/") return;
    if (window.scrollY > 0) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const colBase =
    "h-full transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]";
  const colHidden = "opacity-0 translate-y-10";
  const colVisible = "opacity-100 translate-y-0";
  const bottomReveal = atPageBottom ? "opacity-100" : "opacity-[0.92]";

  return (
    <footer
      ref={footerRef}
      className={`mt-2 relative overflow-hidden py-8 sm:py-10 select-none group transition-shadow duration-500 ${
        atPageBottom
          ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_-18px_46px_-20px_rgba(14,165,233,0.32)]"
          : "shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_-4px_24px_-8px_rgba(2,6,23,0.08)]"
      }`}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      {/* background layers */}
      <span
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 ease-in-out opacity-100 group-hover:opacity-0"
        style={{ backgroundImage: baseGradient }}
      />
      <span
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 ease-in-out opacity-0 group-hover:opacity-100"
        style={{ backgroundImage: hoverGradient }}
      />
      <span
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-[radial-gradient(ellipse_at_50%_100%,rgba(14,165,233,0.34),rgba(45,212,191,0.18)_34%,rgba(99,102,241,0.08)_54%,transparent_76%)] transition-opacity duration-700 ease-out ${
          atPageBottom ? "opacity-100" : "opacity-0"
        }`}
      />

      <div className="page-shell-inline relative z-10">
        {/* 3-column grid */}
        <div className="grid grid-cols-1 items-stretch gap-y-8 md:grid-cols-3 md:gap-x-12 lg:gap-x-16">

          {/* ── Col 1: brand + social ───────────────────────── */}
          <div
            className={`${colBase} ${visible ? colVisible : colHidden} flex flex-col justify-between rounded-2xl border border-white/40 bg-white/18 px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.46)] backdrop-blur-[2px] md:border-r md:border-slate-200/45 md:bg-transparent md:px-0 md:pb-0 md:pl-0 md:pr-8 md:pt-8 md:shadow-none md:backdrop-blur-0 lg:pt-12`}
            style={{ transitionDelay: visible ? "0ms" : "0ms" }}
          >
            <SmartLink
              href="/"
              onClick={handleBrandClick}
              className={`mx-auto flex max-w-[240px] flex-col items-center gap-1.5 text-center transition-opacity duration-700 ease-out ${bottomReveal}`}
            >
              <Image
                src="/Car-parts.png"
                alt="PartsON"
                width={96}
                height={60}
                className="h-auto w-[76px] object-contain drop-shadow-[0_10px_18px_rgba(14,165,233,0.16)] sm:w-[94px]"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.dataset.fallbackApplied === "1") return;
                  img.dataset.fallbackApplied = "1";
                  img.src = "/favicon-192x192.png";
                }}
              />
              <span className="text-xl font-bold tracking-tight text-slate-900">PartsON</span>
              <p className="text-sm leading-5 text-slate-600">Інтернет-магазин автозапчастин</p>
            </SmartLink>

            <div className="mt-6">
              <p className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
                Ми в соцмережах
              </p>
              <div className="flex items-center justify-center gap-3">
                {[
                  { label: "Facebook",  Icon: SiFacebook,  color: "#1877F2", border: "border-blue-200/70",  bg: "hover:bg-blue-50/60",  hoverBorder: "hover:border-[#1877F2]" },
                  { label: "Instagram", Icon: SiInstagram, color: "#E4405F", border: "border-rose-200/70",  bg: "hover:bg-rose-50/60",  hoverBorder: "hover:border-[#E4405F]" },
                  { label: "Telegram",  Icon: SiTelegram,  color: "#229ED9", border: "border-cyan-200/70",  bg: "hover:bg-sky-50/60",   hoverBorder: "hover:border-[#229ED9]" },
                ].map(({ label, Icon, color, border, bg, hoverBorder }) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    className={`inline-flex h-10 w-10 cursor-default items-center justify-center rounded-xl border ${border} bg-white/60 transition-[border-color,background-color,box-shadow] duration-200 ${bg} ${hoverBorder} hover:shadow-[0_8px_18px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.84)]`}
                    style={{ color }}
                  >
                    <span>
                      <Icon size={22} aria-hidden="true" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Col 2: info links ────────────────────────────── */}
          <div
            className={`${colBase} ${visible ? colVisible : colHidden} flex flex-col md:border-r md:border-slate-200/45 md:pr-8`}
            style={{ transitionDelay: visible ? "110ms" : "0ms" }}
          >
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
              Інформація
            </p>
            <ul className="grid grid-cols-2 content-start gap-x-4 gap-y-1 text-sm">
              {infoLinks.map(({ href, icon: Icon, label }) => (
                <li key={href}>
                  <SmartLink className={infoLinkClass} href={href}>
                    <Icon className={infoIconClass} />
                    <span className="min-w-0 leading-snug">{label}</span>
                  </SmartLink>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Col 3: contacts ───── */}
          <div
            className={`${colBase} ${visible ? colVisible : colHidden} flex flex-col md:pl-2`}
            style={{ transitionDelay: visible ? "220ms" : "0ms" }}
          >
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
              Контакти
            </p>

            <div className="flex flex-col gap-1">

              {/* Phone */}
              <a
                href="tel:+380634211851"
                className="group/ph flex items-center gap-3 rounded-xl px-1 py-2.5 text-slate-800 no-underline transition-[background-color] duration-150 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-[background-color,color] duration-150 group-hover/ph:bg-sky-200/80 group-hover/ph:text-sky-900">
                  <FaPhoneAlt className="text-[12px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-400">Телефон</p>
                  <p className="text-sm font-semibold tracking-[-0.01em] text-slate-800">+38 (063) 421-18-51</p>
                </div>
                <FaAngleRight className="shrink-0 text-[11px] text-slate-300 transition-colors duration-150 group-hover/ph:text-sky-400" />
              </a>

              {/* Email */}
              <a
                href="mailto:romaniukbboogg@gmail.com"
                className="group/em flex items-center gap-3 rounded-xl px-1 py-2.5 text-slate-800 no-underline transition-[background-color] duration-150 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-[background-color,color] duration-150 group-hover/em:bg-sky-200/80 group-hover/em:text-sky-900">
                  <FaEnvelope className="text-[12px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-400">Email</p>
                  <p className="min-w-0 break-all text-sm font-semibold tracking-[-0.01em] text-slate-800">romaniukbboogg@gmail.com</p>
                </div>
                <FaAngleRight className="shrink-0 text-[11px] text-slate-300 transition-colors duration-150 group-hover/em:text-sky-400" />
              </a>

              {/* Address */}
              <SmartLink
                href="/inform/location"
                className="group/addr flex items-center gap-3 rounded-xl px-1 py-2.5 text-slate-800 no-underline transition-[background-color] duration-150 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100/80 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-[background-color,color] duration-150 group-hover/addr:bg-emerald-200/80 group-hover/addr:text-emerald-900">
                  <FaMapMarkerAlt className="text-[12px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-400">Адреса</p>
                  <p className="text-sm font-semibold tracking-[-0.01em] text-slate-800">вул. Перфецького, 8</p>
                  <p className="text-xs text-slate-500">Львів, Україна</p>
                </div>
                <FaAngleRight className="shrink-0 text-[11px] text-slate-300 transition-colors duration-150 group-hover/addr:text-emerald-400" />
              </SmartLink>

              {/* Hours */}
              <div className="flex items-start gap-3 rounded-xl px-1 py-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <FaClock className="text-[12px]" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-400">Графік роботи</p>
                    {isOpen !== null && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-[0.04em] ${isOpen ? "bg-emerald-100/90 text-emerald-700" : "bg-red-100/90 text-red-600"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-emerald-500" : "bg-red-500"}`} />
                        {isOpen ? "Відкрито" : "Закрито"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold tracking-[-0.01em] text-slate-800">Пн–Сб: 08:00–18:00</p>
                  <p className="text-xs text-slate-500">Нд: 08:00–16:00</p>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* bottom bar */}
        <div
          className={`${colBase} ${visible ? colVisible : colHidden} mt-8 border-t border-slate-200/70 pt-5 text-center text-sm text-slate-500`}
          style={{ transitionDelay: visible ? "320ms" : "0ms" }}
        >
          <p>
            © {new Date().getFullYear()}{" "}
            <SmartLink href="/" className="font-semibold text-sky-700 hover:text-sky-900">
              PartsON
            </SmartLink>
            . Усі права захищено.
          </p>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">
            Використовуючи сайт, ви погоджуєтесь з{" "}
            <SmartLink href="/inform/privacy" className="font-semibold text-sky-600 hover:text-sky-900">
              Політикою конфіденційності
            </SmartLink>
            .{" "}
            <AnalyticsConsentSettingsButton
              className="font-semibold text-sky-600 underline decoration-sky-200 underline-offset-2 hover:text-sky-900"
            />
          </p>
        </div>
      </div>
    </footer>
  );
}
