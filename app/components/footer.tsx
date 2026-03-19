'use client';

import Image from "next/image";
import Link from "next/link";
import {
  FaEnvelope,
  FaInfoCircle,
  FaIndustry,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaTruck,
  FaWallet,
  FaBoxes,
} from "react-icons/fa";
import { SiFacebook, SiInstagram, SiTelegram } from "react-icons/si";
import React from "react";

export default function Footer() {
  const baseGradient =
    "radial-gradient(circle at 12% 20%, rgba(14, 165, 233, 0.22), transparent 45%), radial-gradient(circle at 88% 0%, rgba(45, 212, 191, 0.16), transparent 48%), radial-gradient(circle at 52% 95%, rgba(99, 102, 241, 0.1), transparent 52%), linear-gradient(135deg, #f8fafc 0%, #eef4ff 45%, #eaf8fb 100%)";
  const hoverGradient =
    "radial-gradient(circle at 12% 20%, rgba(14, 165, 233, 0.34), transparent 45%), radial-gradient(circle at 88% 0%, rgba(16, 185, 129, 0.22), transparent 48%), radial-gradient(circle at 52% 95%, rgba(99, 102, 241, 0.14), transparent 52%), linear-gradient(135deg, #ffffff 0%, #e0f2fe 46%, #ecfdf5 100%)";

  const infoLinkClass =
    "group/info inline-flex w-fit items-center gap-2 rounded-lg px-2 py-2 text-slate-700 no-underline whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 ease-linear hover:bg-white/65 hover:text-sky-900 hover:shadow-[0_8px_16px_rgba(56,189,248,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300";

  const infoIconClass =
    "text-[14px] text-sky-700 transition-colors duration-200 group-hover/info:text-sky-900";

  const contactLinkClass =
    "inline-flex w-fit items-center rounded-lg px-1.5 py-2 text-slate-700 no-underline whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 ease-linear hover:bg-white/55 hover:text-sky-900 hover:shadow-[0_8px_16px_rgba(56,189,248,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300";

  const handleBrandClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== "/") return;

    if (window.scrollY > 0) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <footer
      className="mt-2 relative overflow-hidden py-8 select-none transition-all duration-250 ease-in-out group shadow-[inset_0_1px_0_rgba(255,255,255,0.65),_0_12px_28px_-18px_rgba(2,6,23,0.35)]"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <span
        className="absolute inset-0 transition-opacity duration-250 ease-in-out opacity-100 group-hover:opacity-0 pointer-events-none"
        style={{ backgroundImage: baseGradient }}
      />
      <span
        className="absolute inset-0 transition-opacity duration-250 ease-in-out opacity-0 group-hover:opacity-100 pointer-events-none"
        style={{ backgroundImage: hoverGradient }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-4 lg:px-6">
        <div className="grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-4 lg:gap-x-20">
          <Link
            href="/"
            onClick={handleBrandClick}
            className="relative block md:border-r md:border-slate-200/40 md:pr-4"
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <Image
                src="/Car-parts.png"
                alt="PartsON"
                width={65}
                height={40}
                className="mb-4 h-auto w-[65px] object-contain md:w-[85px]"
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.dataset.fallbackApplied === "1") return;
                  image.dataset.fallbackApplied = "1";
                  image.src = "/favicon-192x192.png";
                }}
              />
              <div className="flex flex-col">
                <h2 className="shrink-0 text-2xl font-bold tracking-tight text-slate-900">
                  PartsON
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Інтернет-магазин автозапчастин
                </p>
              </div>
            </div>
          </Link>

          <div className="relative md:border-r md:border-slate-200/40 md:pl-4 md:pr-8">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Інформація</h3>
            <ul className="grid grid-cols-2 gap-x-28 gap-y-2 text-sm">
              <li>
                <Link className={infoLinkClass} href="/inform/about">
                  <FaInfoCircle className={infoIconClass} />
                  <span>Про нас</span>
                </Link>
              </li>
              <li>
                <Link className={infoLinkClass} href="/inform/delivery">
                  <FaTruck className={infoIconClass} />
                  <span>Доставка</span>
                </Link>
              </li>
              <li>
                <Link className={infoLinkClass} href="/inform/location">
                  <FaMapMarkerAlt className={infoIconClass} />
                  <span>Локація</span>
                </Link>
              </li>
              <li>
                <Link className={infoLinkClass} href="/inform/payment">
                  <FaWallet className={infoIconClass} />
                  <span>Оплата</span>
                </Link>
              </li>
              <li>
                <Link className={infoLinkClass} href="/groups">
                  <FaBoxes className={infoIconClass} />
                  <span>Групи товарів</span>
                </Link>
              </li>
              <li>
                <Link className={infoLinkClass} href="/manufacturers">
                  <FaIndustry className={infoIconClass} />
                  <span>Виробники</span>
                </Link>
              </li>
            </ul>
          </div>

          <div className="relative md:px-8 md:border-r md:border-slate-200/40">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Контакти</h3>
            <ul className="space-y-2 text-sm">
              <li className="group/contact inline-flex w-fit items-center gap-2">
                <FaPhoneAlt className="text-sky-700 transition-colors duration-200 group-hover/contact:text-sky-900" />
                <a className={contactLinkClass} href="tel:+380634211851">
                  +38 (063) 421-18-51
                </a>
              </li>
              <li className="group/contact inline-flex w-fit items-center gap-2">
                <FaEnvelope className="text-sky-700 transition-colors duration-200 group-hover/contact:text-sky-900" />
                <a className={contactLinkClass} href="mailto:romaniukbboogg@gmail.com">
                  romaniukbboogg@gmail.com
                </a>
              </li>
            </ul>
          </div>

          <div className="relative md:pl-8">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Ми в соцмережах</h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                aria-label="Facebook"
                className="inline-flex h-10 w-10 cursor-default items-center justify-center rounded-xl border border-sky-200/80 bg-transparent text-[#1877F2] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1877F2] hover:bg-sky-50/60"
              >
                <SiFacebook size={24} />
              </button>
              <button
                type="button"
                aria-label="Instagram"
                className="inline-flex h-10 w-10 cursor-default items-center justify-center rounded-xl border border-rose-200/80 bg-transparent text-[#E4405F] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E4405F] hover:bg-rose-50/60"
              >
                <SiInstagram size={24} />
              </button>
              <button
                type="button"
                aria-label="Telegram"
                className="inline-flex h-10 w-10 cursor-default items-center justify-center rounded-xl border border-cyan-200/80 bg-transparent text-[#229ED9] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#229ED9] hover:bg-sky-50/60"
              >
                <SiTelegram size={24} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-300 pt-5 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} PartsON
        </div>
      </div>
    </footer>
  );
}
