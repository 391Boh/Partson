import type { ReactNode } from "react";

// The one section heading of the homepage. Signature: a short teal → sky
// rule with a dot above the title, ink display type, and the accent words
// (direct <span> children, styled via `*:` — the CSS splitter cannot read `>`) in teal over a soft highlighter stroke that wraps
// with the line. Sizes run 27 → 40 px with the viewport; `align="center"`
// centres the rule with the text. No client JS — usable from server and
// client components alike. Key properties are !important so the older
// section-specific rules in globals.css cannot restyle it.

type HomeHeadingProps = {
  children: ReactNode;
  id?: string;
  align?: "start" | "center";
  className?: string;
};

export default function HomeHeading({ children, id, align = "start", className = "" }: HomeHeadingProps) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "flex flex-col items-center text-center" : ""} ${className}`}>
      <span aria-hidden="true" className={`mb-3.5 flex items-center gap-1.5 sm:mb-4 ${centered ? "justify-center" : ""}`}>
        <span className="h-[5px] w-9 rounded-full bg-[linear-gradient(90deg,#0d9488,#38bdf8)] sm:w-11" />
        <span className="h-[5px] w-[5px] rounded-full bg-[#38bdf8]/70" />
      </span>
      <h2
        id={id}
        className="font-display font-display-readable !m-0 !max-w-[24ch] !text-[clamp(27px,1.4vw+19px,40px)] !font-[800] !leading-[1.08] !tracking-[-.032em] !text-[#0b2233] ![text-shadow:0_1px_0_rgb(255_255_255/70%)] [text-wrap:balance] *:!inline *:!no-underline *:!whitespace-normal *:bg-[linear-gradient(180deg,transparent_60%,rgb(94_234_212/45%)_60%,rgb(94_234_212/45%)_92%,transparent_92%)] *:px-[0.08em] *:!text-[#086f7a] *:[-webkit-box-decoration-break:clone] *:[box-decoration-break:clone]"
      >
        {children}
      </h2>
    </div>
  );
}
