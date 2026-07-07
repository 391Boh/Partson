import Image from "next/image";
import Link from "next/link";
import LazyHeroAccountClient from "./LazyHeroAccountClient";
import HeroIntroCard from "./HeroIntroCard";

const depthBackground = [
  // sky-blue top-left — slightly tightened for darker top zone
  "radial-gradient(ellipse 148% 86% at 7% 4%, rgba(56,189,248,0.34) 0%, rgba(56,189,248,0.10) 38%, rgba(56,189,248,0.02) 58%, transparent 72%)",
  // blue top-right
  "radial-gradient(ellipse 98% 70% at 95% 4%, rgba(37,99,235,0.20) 0%, rgba(37,99,235,0.05) 40%, transparent 66%)",
  // blue bottom glow — centred, same depth
  "radial-gradient(ellipse 120% 56% at 50% 108%, rgba(14,116,144,0.20) 0%, rgba(14,165,233,0.06) 48%, transparent 74%)",
  // dark top, slightly lighter bottom — smooth modern vignette
  "linear-gradient(180deg, rgba(2,6,23,1.00) 0%, rgba(5,11,36,0.97) 10%, rgba(9,18,54,0.94) 20%, rgba(13,26,72,0.88) 30%, rgba(17,35,92,0.82) 40%, rgba(20,42,110,0.78) 50%, rgba(18,40,104,0.74) 60%, rgba(16,34,90,0.68) 70%, rgba(14,30,80,0.60) 80%, rgba(12,26,72,0.52) 90%, rgba(10,22,64,0.44) 100%)",
].join(", ");

const cardGradientBase =
  "bg-gradient-to-b from-slate-950/44 via-slate-900/24 to-sky-200/12";
const cardGradientHover =
  "motion-safe:hover:border-sky-300/28";
const cardInteractionStatic =
  "transition-[box-shadow,border-color] duration-300 ease-out";

const Hero = () => {
  return (
    <section
      className="home-glow-section home-glow-section-sky hero-section-smooth group/hero font-ui relative isolate flex min-h-0 w-full select-none items-start overflow-hidden py-4 sm:items-center sm:py-7 lg:py-8"
      style={{
        backgroundImage: depthBackground,
      }}
      >
      {/* static ambient glow — soft triple-stop radials */}
      <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(ellipse_135%_76%_at_12%_2%,rgba(56,189,248,0.34)_0%,rgba(56,189,248,0.08)_42%,transparent_70%),radial-gradient(ellipse_84%_60%_at_88%_5%,rgba(37,99,235,0.20)_0%,rgba(37,99,235,0.04)_44%,transparent_68%),radial-gradient(ellipse_96%_52%_at_56%_90%,rgba(37,99,235,0.14)_0%,rgba(37,99,235,0.02)_46%,transparent_68%)] opacity-100" />
      <span className="pointer-events-none absolute inset-0 bg-[image:linear-gradient(138deg,rgba(15,23,42,0.06)_0%,rgba(14,165,233,0.10)_20%,rgba(56,189,248,0.10)_44%,rgba(56,189,248,0.07)_64%,rgba(37,99,235,0.08)_82%,rgba(15,23,42,0.04)_100%)] opacity-70" />
      {/* hover bloom — diffused moonlight from above */}
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[900ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/hero:opacity-100 bg-[image:radial-gradient(ellipse_240%_120%_at_50%_-12%,rgba(125,211,252,0.16)_0%,rgba(56,189,248,0.06)_38%,transparent_60%),radial-gradient(ellipse_170%_92%_at_6%_4%,rgba(56,189,248,0.18)_0%,rgba(56,189,248,0.04)_44%,transparent_68%),radial-gradient(ellipse_120%_66%_at_94%_5%,rgba(56,189,248,0.10)_0%,rgba(37,99,235,0.02)_42%,transparent_64%),radial-gradient(ellipse_160%_78%_at_50%_112%,rgba(56,189,248,0.16)_0%,rgba(14,165,233,0.07)_42%,transparent_68%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.01)_28%,transparent_52%)]" />
      {/* top + bottom dark vignette — symmetric, same strength */}
      <span className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-28 bg-[image:linear-gradient(to_bottom,rgba(2,6,23,0.52)_0%,rgba(2,6,23,0.22)_55%,transparent_100%)]" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-28 bg-[image:linear-gradient(to_bottom,transparent_0%,rgba(2,6,23,0.08)_50%,rgba(2,6,23,0.18)_100%)]" />
      <div className="page-shell-inline home-hero-content-enter">
        <div className="relative grid gap-4 text-slate-100 md:grid-cols-2 lg:grid-cols-[minmax(0,420px)_1fr_1fr] lg:items-stretch">
          <HeroIntroCard />

          <div className="h-full min-w-0">
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Link
                href="/"
                aria-label="Оновити сторінку"
                className="group/logo relative hidden items-center justify-center overflow-visible px-2 py-1 transition-transform duration-500 ease-out motion-safe:transform-gpu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300/80 sm:flex"
              >
                <Image
                  src="/Car-parts.png"
                  alt="PartsOn Logo"
                  width={98}
                  height={49}
                  priority
                  className="relative z-[2] h-auto w-[72px] object-contain drop-shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-safe:transform-gpu md:w-[108px] motion-safe:group-hover/logo:-translate-y-0.5 motion-safe:group-hover/logo:scale-[1.04]"
                  sizes="(min-width: 768px) 108px, 72px"
                />
                <span className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-3 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-[14px] border border-sky-200/35 bg-[image:linear-gradient(135deg,rgba(30,41,59,0.96),rgba(51,65,85,0.94))] px-4 py-2 text-center text-[12px] font-semibold tracking-[0.08em] text-slate-50 opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.34)] ring-1 ring-sky-100/10 backdrop-blur-xl transition-[opacity,transform] duration-300 ease-out after:absolute after:left-1/2 after:top-full after:h-2.5 after:w-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-45 after:border-b after:border-r after:border-sky-200/30 after:bg-slate-700 motion-safe:group-hover/logo:-translate-y-1 motion-safe:group-hover/logo:opacity-100">
                  Оновити сторінку
                </span>
              </Link>
              <LazyHeroAccountClient
                cardGradientBase={cardGradientBase}
                cardGradientHover={cardGradientHover}
                cardInteractionStatic={cardInteractionStatic}
              />
            </div>
          </div>
          <LazyHeroAccountClient
            cardGradientBase={cardGradientBase}
            cardGradientHover={cardGradientHover}
            cardInteractionStatic={cardInteractionStatic}
            variant="benefits"
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
