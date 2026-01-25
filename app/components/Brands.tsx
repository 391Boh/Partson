"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Factory, Search } from "lucide-react";
import { brands } from "app/components/brandsData";

const viewportConfig = { once: true, amount: 0.35 };
const backgroundBase = [
  "radial-gradient(circle at 18% 18%, rgba(129,186,255,0.28), transparent 40%)",
  "radial-gradient(circle at 82% 14%, rgba(175,215,255,0.24), transparent 46%)",
  "radial-gradient(circle at 50% 82%, rgba(152,193,255,0.2), transparent 34%)",
  "linear-gradient(180deg, #f9fbff 0%, #e7f0ff 42%, #c6dafe 100%)",
].join(", ");
const backgroundHover = [
  "radial-gradient(circle at 22% 16%, rgba(124,175,255,0.38), transparent 38%)",
  "radial-gradient(circle at 80% 14%, rgba(135,200,255,0.34), transparent 44%)",
  "radial-gradient(circle at 54% 84%, rgba(120,176,255,0.32), transparent 34%)",
  "linear-gradient(180deg, #f6f9ff 0%, #dbe8ff 38%, #b2ccfd 100%)",
].join(", ");
const cardBackdrop = (
  <div className="pointer-events-none absolute inset-0">
    <div className="absolute -left-14 top-4 h-64 w-64 rounded-full bg-white/40 blur-[120px]" />
    <div className="absolute right-[-12%] bottom-[-18%] h-80 w-80 rounded-full bg-blue-200/30 blur-[150px]" />
    <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/30 to-white/10" />
  </div>
);

type BrandSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  brandNames: string[];
};

const BrandSearchInput = memo(
  ({ value, onChange, brandNames }: BrandSearchInputProps) => {
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");

    useEffect(() => {
      if (!brandNames.length || isInputFocused || value.trim()) {
        setAnimatedPlaceholder("");
        return;
      }
      let active = true;
      let wordIndex = 0;
      let charIndex = 0;
      let direction: "forward" | "back" = "forward";
      let timeoutId: ReturnType<typeof setTimeout>;

      const tick = () => {
        if (!active) return;
        const word = brandNames[wordIndex] || "";

        if (direction === "forward") {
          charIndex = Math.min(word.length, charIndex + 1);
          setAnimatedPlaceholder(word.slice(0, charIndex) || "");
          if (charIndex === word.length) {
            direction = "back";
            timeoutId = setTimeout(tick, 900);
            return;
          }
          timeoutId = setTimeout(tick, 80);
          return;
        }

        charIndex = Math.max(0, charIndex - 1);
        setAnimatedPlaceholder(word.slice(0, charIndex) || "");
        if (charIndex === 0) {
          direction = "forward";
          wordIndex = (wordIndex + 1) % brandNames.length;
          timeoutId = setTimeout(tick, 260);
          return;
        }
        timeoutId = setTimeout(tick, 45);
      };

      tick();
      return () => {
        active = false;
        clearTimeout(timeoutId);
      };
    }, [brandNames, isInputFocused, value]);

    return (
      <label className="relative block">
        <input
          type="text"
          placeholder=""
          aria-label="Пошук бренду"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          className="w-full rounded-2xl border border-blue-100/80 bg-white/90 px-4 pr-11 py-3 text-sm font-medium text-slate-800 shadow-inner shadow-blue-100/50 transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
          data-search="true"
        />
        {!value && !isInputFocused && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-400">
            {animatedPlaceholder}
          </span>
        )}
        <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
      </label>
    );
  }
);

BrandSearchInput.displayName = "BrandSearchInput";

export default function BrandCarousel() {
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState(false);
  const brandNames = useMemo(
    () => brands.map((item) => item?.name ?? "").filter(Boolean),
    []
  );
  const filteredBrands = useMemo(
    () =>
      brands.filter((brand) =>
        brand.name.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  return (
    <motion.section
      className="relative isolate w-full overflow-hidden px-4 py-10 sm:px-4 sm:py-12 lg:px-6 font-[Montserrat]"
      style={{ backgroundImage: backgroundBase }}
      animate={{
        backgroundImage: hovered ? backgroundHover : backgroundBase,
        backgroundSize: hovered ? "240% 240%" : "220% 220%",
        backgroundPosition: hovered ? "48% 38%" : "50% 42%",
        boxShadow: hovered
          ? "0 32px 96px rgba(59,130,246,0.24), 0 18px 48px rgba(15,23,42,0.14)"
          : "0 24px 72px rgba(59,130,246,0.18), 0 14px 38px rgba(15,23,42,0.12)",
      }}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      viewport={viewportConfig}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      {cardBackdrop}

      <div className="relative mx-auto w-full max-w-[1400px] space-y-6 sm:space-y-8">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:items-center">
          <div className="flex items-start gap-3 sm:items-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 via-blue-200 to-indigo-100 text-slate-900 shadow-[0_12px_26px_rgba(59,130,246,0.25)] ring-1 ring-blue-100">
              <Factory className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="flex flex-col">
              <h2 className="text-xl font-extrabold italic tracking-tight text-slate-900 sm:text-2xl">
                Відомі виробники автозапчастин
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                Підіберіть бренд за своїм смаком, відкрийте картку та дізнайтесь
                ключові особливості.
              </p>
            </div>
          </div>

          <div className="w-full">
            <BrandSearchInput
              value={search}
              onChange={setSearch}
              brandNames={brandNames}
            />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-blue-100/70 bg-white/80 shadow-[0_18px_46px_rgba(59,130,246,0.14)] backdrop-blur">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/35 to-transparent" />
            <div className="absolute -left-10 top-3 h-24 w-24 rounded-full bg-blue-200/35 blur-2xl" />
            <div className="absolute right-[-6%] bottom-[-10%] h-28 w-28 rounded-full bg-cyan-200/40 blur-2xl" />
          </div>

          <div className="brand-scroll relative flex w-full gap-4 overflow-x-auto overflow-y-visible px-2 py-3 sm:gap-5 sm:px-3 sm:py-4 md:gap-6 snap-x snap-mandatory">
            <div className="pointer-events-none absolute left-0 top-0 h-full w-12 bg-gradient-to-r from-white via-white/70 to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-white via-white/70 to-transparent" />

            {filteredBrands.map((brand, idx) => (
              <div
                key={`${brand.name}-${idx}`}
                className="w-[190px] flex-shrink-0 snap-start sm:w-[210px] md:w-[230px] lg:w-[240px]"
              >
                <FlipCard brand={brand} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function FlipCard({ brand }: { brand: typeof brands[number] }) {
  const [flipped, setFlipped] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const faceBaseStyle = {
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
    transformStyle: "preserve-3d" as const,
  };

  useEffect(() => {
    function updateIsMobile() {
      setIsMobile(window.innerWidth < 768);
    }
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  return (
    <motion.div
      className="relative h-full w-full perspective group"
      style={{ perspective: 1200, transformStyle: "preserve-3d" }}
      whileHover={
        isMobile
          ? undefined
          : {
              scale: 1.06,
              boxShadow:
                "0px 20px 50px rgba(59, 130, 246, 0.28), 0 12px 26px rgba(15, 23, 42, 0.16)",
            }
      }
      transition={{ duration: 0.35 }}
      onHoverStart={() => !isMobile && setFlipped(true)}
      onHoverEnd={() => !isMobile && setFlipped(false)}
      onClick={() => isMobile && setFlipped((prev) => !prev)}
    >
      <div
        className="relative aspect-square h-full w-full cursor-pointer select-none overflow-hidden rounded-3xl border border-blue-100/80 bg-gradient-to-br from-white via-blue-50/75 to-cyan-50/75 shadow-[0_16px_44px_rgba(59,130,246,0.18)] ring-1 ring-white/70"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/60 via-white/20 to-transparent" />
          <div className="absolute -left-6 bottom-6 h-20 w-20 rounded-full bg-blue-200/35 blur-2xl" />
          <div className="absolute right-[-12%] top-[-8%] h-24 w-24 rounded-full bg-cyan-200/35 blur-2xl" />
        </div>

        <motion.div
          className="absolute inset-0 flex items-center justify-center rounded-3xl bg-white/88 p-6 transition-colors duration-300"
          style={{ ...faceBaseStyle, transform: "rotateY(0deg) translateZ(1px)" }}
          animate={{ rotateY: flipped ? 180 : 0, scale: flipped ? 1.02 : 1 }}
          transition={{
            duration: 0.8,
            ease: "easeInOut",
            type: "spring",
            stiffness: 110,
            damping: 16,
          }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-2xl border border-blue-100/80 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 shadow-[0_12px_32px_rgba(59,130,246,0.12)]">
            <img
              src={brand.logo}
              alt={brand.name}
              className="max-h-24 w-full object-contain drop-shadow-[0_8px_18px_rgba(15,23,42,0.1)]"
              draggable={false}
              loading="lazy"
            />
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-center rounded-3xl bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 text-center text-sm font-semibold leading-snug text-slate-700 sm:text-base"
          style={{
            ...faceBaseStyle,
            transform: "rotateY(180deg) translateZ(1px)",
            overflowY: "auto",
          }}
          animate={{ rotateY: flipped ? 0 : -180, scale: flipped ? 1.02 : 1 }}
          transition={{
            duration: 0.8,
            ease: "easeInOut",
            type: "spring",
            stiffness: 110,
            damping: 16,
          }}
        >
          <p>{brand.description}</p>
        </motion.div>

        <div
          className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-sky-100/45 via-transparent to-cyan-200/38 opacity-0 transition duration-300 group-hover:opacity-100"
          style={faceBaseStyle}
        />
      </div>
    </motion.div>
  );
}

