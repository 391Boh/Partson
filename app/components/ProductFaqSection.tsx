"use client";

import { ChevronDown, MapPin, Phone } from "lucide-react";

import { buildProductFaqItems } from "app/lib/product-faq";

type ProductFaqSectionProps = {
  name: string;
  producer: string;
  group: string;
  subGroup: string;
  hasPrice: boolean;
  quantity: number;
  contactPhone?: string;
  contactPhoneTel?: string;
  contactAddress?: string;
};

export default function ProductFaqSection({
  name,
  producer,
  group,
  subGroup,
  hasPrice,
  quantity,
  contactPhone = "",
  contactPhoneTel = "",
  contactAddress = "",
}: ProductFaqSectionProps) {
  const items = buildProductFaqItems({ name, producer, group, subGroup, hasPrice, quantity });

  return (
    <div className="product-section">
      <div className="product-section-head">
        <h2 className="font-display product-section-title">Популярні запитання</h2>
      </div>

      <div className="product-faq-list">
        {items.map((item, index) => (
          <details key={item.question} className="product-faq-item group" {...(index === 0 ? { open: true } : {})}>
            <summary className="product-faq-question">
              <h3 className="flex-1 text-[14px] font-bold leading-[1.4] text-slate-800 sm:text-[15px]">
                {item.question}
              </h3>
              <ChevronDown
                size={18}
                className="mt-0.5 shrink-0 text-slate-400 transition-transform duration-300 group-open:rotate-180 group-open:text-teal-600"
                aria-hidden="true"
              />
            </summary>
            <p className="product-faq-answer">
              {item.answer}
            </p>
          </details>
        ))}
      </div>

      {contactPhone || contactAddress ? (
        <div className="product-faq-contacts">
          {contactPhone ? (
            <a
              href={`tel:${contactPhoneTel || contactPhone.replace(/[^\d+]/g, "")}`}
              className="product-faq-contact"
            >
              <span className="product-faq-contact-icon" data-tone="phone">
                <Phone size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="product-faq-contact-label">Телефон</span>
                <span className="product-faq-contact-value">
                  {contactPhone}
                </span>
              </span>
            </a>
          ) : null}
          {contactAddress ? (
            <div className="product-faq-contact">
              <span className="product-faq-contact-icon">
                <MapPin size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="product-faq-contact-label">Адреса</span>
                <span className="product-faq-contact-value">
                  {contactAddress}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
