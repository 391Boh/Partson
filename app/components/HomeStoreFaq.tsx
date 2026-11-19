"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { HOME_FAQ } from "app/lib/home-faq";

// Homepage FAQ: glass cards with large gradient numerals. The open card turns
// solid white with a teal edge and its answer unfolds (grid 0fr → 1fr); the
// plus turns into a cross. The list reserves the height of its tallest answer
// so opening another question never moves the next section.
export default function HomeStoreFaq() {
  const [active, setActive] = useState<number | null>(0);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const items = [...list.querySelectorAll<HTMLElement>("[data-faq-item]")];
      const buttons = [...list.querySelectorAll<HTMLElement>("[data-faq-button]")];
      const answers = [...list.querySelectorAll<HTMLElement>("[data-faq-answer]")];
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      const height = buttons.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)
        + Math.max(0, ...answers.map((el) => el.scrollHeight))
        + gap * Math.max(0, items.length - 1)
        + items.length * 2; // 1px borders
      list.style.minHeight = `${Math.ceil(height)}px`;
    };
    const observer = new ResizeObserver(measure);
    list.querySelectorAll("[data-faq-button],[data-faq-answer]").forEach((el) => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-store-faq">
      <div ref={listRef} className="home-faq-list flex flex-col gap-2.5">
        {HOME_FAQ.map(({ question, answer }, index) => {
          const open = active === index;
          return (
            <div
              key={question}
              data-faq-item
              data-open={open}
              className={`group/faq relative overflow-hidden rounded-[18px] border backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${
                open
                  ? "border-white bg-white/95 shadow-[0_1px_2px_rgb(15_43_61/6%),0_18px_36px_-22px_rgb(8_80_100/55%)]"
                  : "border-white/70 bg-white/55 shadow-[0_1px_2px_rgb(15_43_61/4%)] hover:border-white hover:bg-white/75"
              }`}
            >
              {/* Teal edge on the open card. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-[linear-gradient(180deg,#0d9488,#38bdf8)] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
              />
              <h4 className="m-0">
                <button
                  type="button"
                  data-faq-button
                  id={`home-faq-question-${index}`}
                  aria-expanded={open}
                  aria-controls={`home-faq-answer-${index}`}
                  onClick={() => setActive(open ? null : index)}
                  className="flex min-h-[64px] w-full cursor-pointer items-center gap-3.5 border-0 bg-transparent px-4 py-3 text-left font-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#087783] sm:gap-4 sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className="font-display w-8 shrink-0 bg-[linear-gradient(160deg,#0d9488,#38bdf8)] bg-clip-text text-[24px] font-[800] leading-none tracking-[-.04em] text-transparent sm:w-9 sm:text-[28px]"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={`flex-1 text-[15px] font-bold leading-[1.35] tracking-[-.01em] transition-colors duration-200 sm:text-[16.5px] ${open ? "text-[#0b2233]" : "text-[#1d4257] group-hover/faq:text-[#0b2233]"}`}>
                    {question}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color,box-shadow] duration-300 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${
                      open
                        ? "rotate-45 bg-[#0f2b3d] text-white shadow-[0_8px_16px_-8px_rgb(15_43_61/70%)]"
                        : "bg-[#087783]/10 text-[#087783] group-hover/faq:bg-[#087783]/15"
                    }`}
                  >
                    <Plus size={17} strokeWidth={2.4} />
                  </span>
                </button>
              </h4>
              <div
                id={`home-faq-answer-${index}`}
                role="region"
                aria-labelledby={`home-faq-question-${index}`}
                aria-hidden={!open}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"}`}
              >
                <div data-faq-answer className="min-h-0 overflow-hidden">
                  <p className="m-0 max-w-[62ch] pb-4 pl-[62px] pr-5 text-[14px] font-medium leading-[1.7] text-[#33586c] sm:pb-5 sm:pl-[72px] sm:pr-14 sm:text-[15px]">
                    {answer}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <noscript>
        <style>{`.home-faq-list{display:none!important}`}</style>
        {HOME_FAQ.map(({ question, answer }) => (
          <div key={question} className="home-store-faq-fallback">
            <h4>{question}</h4><p>{answer}</p>
          </div>
        ))}
      </noscript>
    </div>
  );
}
