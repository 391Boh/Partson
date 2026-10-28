"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { HOME_FAQ } from "app/lib/home-faq";

export default function HomeStoreFaq() {
  const [active, setActive] = useState<number | null>(0);

  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Reserve the tallest single answer so opening another question does not
    // move the photo edge or the next section. Closed answers remain measurable.
    const measure = () => {
      const headings = [...list.querySelectorAll<HTMLElement>(".home-store-faq-heading")];
      const answers = [...list.querySelectorAll<HTMLElement>(".home-store-faq-answer")];
      const height = headings.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)
        + Math.max(0, ...answers.map(el => el.getBoundingClientRect().height)) + HOME_FAQ.length - 1;
      list.style.minHeight = `${height}px`;
    };
    const observer = new ResizeObserver(measure);
    list.querySelectorAll(".home-store-faq-heading,.home-store-faq-answer").forEach(el => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-store-faq">
      <div className="home-store-faq-questions" ref={listRef}>
        {HOME_FAQ.map(({ question, answer }, index) => (
          <div key={question} className="home-store-faq-item" data-open={active === index}>
            <h4 className="home-store-faq-heading">
              <button
                type="button"
                id={`home-faq-question-${index}`}
                aria-expanded={active === index}
                aria-controls={`home-faq-answer-${index}`}
                onClick={() => setActive(active === index ? null : index)}
              >
                <span>{question}</span>
                <ChevronDown size={18} aria-hidden="true" />
              </button>
            </h4>
            <div
              id={`home-faq-answer-${index}`}
              role="region"
              aria-labelledby={`home-faq-question-${index}`}
              aria-hidden={active !== index}
              className="home-store-faq-answer"
            >
              <p>{answer}</p>
            </div>
          </div>
        ))}
      </div>
      <noscript>
        <style>{`.home-store-faq-questions{display:none!important}`}</style>
        {HOME_FAQ.map(({ question, answer }) => (
          <div key={question} className="home-store-faq-fallback">
            <h4>{question}</h4><p>{answer}</p>
          </div>
        ))}
      </noscript>
    </div>
  );
}
