// Atmospheric layer behind the manufacturers picker — parts-maker wordmarks as
// CSS masks filled with a chrome ramp. Even, non-overlapping scatter (four down
// each edge, two mid-height in the centre, one centred at the bottom).
//
// Static artwork: CSS owns placement and hover effects; no mount-time geometry reads.

type Layer = {
  src: string;
  ratio: number; // width / height so the box never distorts the mark
  tint: string;
  className: string; // position + responsive width (mobile-first)
  depth: number; // 0 far … 1 near — scales how far the mark spreads / tilts
  side: 1 | -1 | 0; // which way it slides: -1 left, +1 right, 0 stays (centre)
  rot: number;
  opacity: number;
  cx?: boolean;
};

const BLUE =
  "linear-gradient(135deg,#173a8f 0%,#3f7fe6 30%,#bfe1ff 50%,#3f7fe0 62%,#1a4aa8 100%)";
const DEEP =
  "linear-gradient(140deg,#0f1f4a 0%,#25408a 30%,#6d92e0 50%,#233a80 64%,#101f46 100%)";
const STEEL =
  "linear-gradient(135deg,#2b3648 0%,#5a6a83 30%,#b3bfd0 50%,#54627b 64%,#2b3648 100%)";

// Eleven marks: four down the left edge, four down the right, two mid-height in
// the centre (so the middle no longer reads empty), one centred at the bottom.
// Each sits on its own vertical band (as a % of section height, so the spacing
// holds at every width) and every mark carries an explicit value at both
// breakpoints — no mark ever falls back to a mobile position that a desktop
// sibling has already moved into.
const LAYERS: Layer[] = [
  // ---- LEFT EDGE, top → bottom ----------------------------------------
  {
    src: "/Brands/CONTITECH.svg",
    ratio: 217.7 / 39.6,
    tint: BLUE,
    className:
      "top-[3%] left-[-4%] w-[38vw] max-w-[128px] sm:left-[0%] sm:w-[19vw] sm:max-w-[220px]",
    depth: 0.45,
    side: -1,
    rot: -4,
    opacity: 0.16,
  },
  {
    src: "/Brands/HENGST%20FILTER.svg",
    ratio: 156 / 60,
    tint: STEEL,
    className:
      "top-[26%] left-[-7%] w-[26vw] max-w-[92px] sm:left-[-3%] sm:w-[12vw] sm:max-w-[150px]",
    depth: 0.55,
    side: -1,
    rot: 5,
    opacity: 0.14,
  },
  {
    src: "/Brands/TOPRAN.svg",
    ratio: 254 / 68,
    tint: STEEL,
    className:
      "top-[52%] left-[-6%] w-[26vw] max-w-[92px] sm:left-[-2%] sm:w-[11vw] sm:max-w-[140px]",
    depth: 0.4,
    side: -1,
    rot: 4,
    opacity: 0.14,
  },
  {
    // wide faint anchor — mostly off the bottom-left edge
    src: "/Brands/METZGER.svg",
    ratio: 810.265 / 65.654,
    tint: DEEP,
    className:
      "bottom-[-3%] left-[-14%] w-[54vw] max-w-[180px] sm:left-[-6%] sm:w-[34vw] sm:max-w-[420px]",
    depth: 0.15,
    side: -1,
    rot: -3,
    opacity: 0.12,
  },
  // ---- RIGHT EDGE, top → bottom -------------------------------------
  {
    src: "/Brands/Delphi.svg",
    ratio: 653.63 / 252.61,
    tint: BLUE,
    className:
      "top-[5%] right-[-9%] w-[32vw] max-w-[112px] sm:right-[-3%] sm:w-[15vw] sm:max-w-[210px]",
    depth: 0.9,
    side: 1,
    rot: -5,
    opacity: 0.15,
  },
  {
    src: "/Brands/STELLOX.svg",
    ratio: 242 / 84,
    tint: STEEL,
    className:
      "top-[30%] right-[-10%] w-[30vw] max-w-[100px] sm:right-[-2%] sm:w-[12vw] sm:max-w-[158px]",
    depth: 0.5,
    side: 1,
    rot: -7,
    opacity: 0.15,
  },
  {
    src: "/Brands/SOGEFI.svg",
    ratio: 255.1 / 49.4,
    tint: STEEL,
    className:
      "top-[56%] right-[-8%] w-[28vw] max-w-[96px] sm:right-[-3%] sm:w-[12vw] sm:max-w-[158px]",
    depth: 0.42,
    side: 1,
    rot: 5,
    opacity: 0.14,
  },
  {
    // bold "GSP" wordmark — mostly off the bottom-right edge
    src: "/Brands/GSP.svg",
    ratio: 369.04 / 110.99,
    tint: BLUE,
    className:
      "bottom-[2%] right-[-10%] w-[34vw] max-w-[116px] sm:right-[-2%] sm:w-[15vw] sm:max-w-[200px]",
    depth: 0.85,
    side: 1,
    rot: 6,
    opacity: 0.14,
  },
  // ---- CENTRE, mid-height (fills the gap between the two edges) ------
  {
    src: "/Brands/Filtron.svg",
    ratio: 203.22748 / 40,
    tint: STEEL,
    className:
      "top-[24%] left-[38%] w-[30vw] max-w-[104px] sm:left-[40%] sm:w-[15vw] sm:max-w-[168px]",
    depth: 0.35,
    side: -1,
    rot: 3,
    opacity: 0.12,
  },
  {
    src: "/Brands/SHAFER.svg",
    ratio: 195.413 / 35.213,
    tint: STEEL,
    className:
      "top-[48%] left-[52%] w-[28vw] max-w-[98px] sm:left-[54%] sm:w-[13vw] sm:max-w-[148px]",
    depth: 0.45,
    side: 1,
    rot: -4,
    opacity: 0.12,
  },
  // ---- BOTTOM CENTRE ----------------------------------------------
  {
    src: "/Brands/TRISCAN.svg",
    ratio: 272 / 32,
    tint: STEEL,
    className:
      "bottom-[14%] left-1/2 w-[44vw] max-w-[150px] sm:bottom-[16%] sm:w-[24vw] sm:max-w-[280px]",
    depth: 0.75,
    side: 0,
    rot: -6,
    opacity: 0.14,
    cx: true,
  },
];

export default function BrandsLogosBackdrop() {

  return (
    <div
      aria-hidden="true"
      className="home-backdrop pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* hairline dot-grid on the deepest moving plane */}
      <div
        data-parallax
        data-depth="0.22"
        data-side="0"
        style={{ transform: "none" }}
        className="home-scroll-decor absolute -inset-y-[8%] inset-x-0 opacity-[0.42] transition-opacity duration-[900ms] ease-out group-hover/brandcars:opacity-70 bg-[radial-gradient(rgba(37,99,235,0.12)_1px,transparent_1.5px)] bg-[length:27px_27px] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_82%,transparent_100%)]"
      />

      <div className="home-parallax-layer absolute inset-0">
        {LAYERS.map((logo) => (
          <div
            key={logo.src}
            data-parallax
            data-depth={logo.depth}
            data-side={logo.side}
            data-rot={logo.rot}
            data-cx={logo.cx ? "1" : undefined}
            style={{
              aspectRatio: String(logo.ratio),
              ["--mo" as string]: logo.opacity,
              backgroundImage: logo.tint,
              maskImage: `url(${logo.src})`,
              maskSize: "contain",
              maskPosition: "center",
              maskRepeat: "no-repeat",
              WebkitMaskImage: `url(${logo.src})`,
              WebkitMaskSize: "contain",
              WebkitMaskPosition: "center",
              WebkitMaskRepeat: "no-repeat",
              transform: `translate(${logo.cx ? "-50%" : "0"}, 0) rotate(${logo.rot}deg)`,
            }}
            className={`brands-logos-mark absolute ${logo.className}`}
          />
        ))}
      </div>

      {/* plain horizontal top wash so the heading + search stay legible */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,rgba(241,246,255,0.62)_0%,rgba(241,246,255,0.12)_62%,transparent_100%)] sm:h-48" />

      {/* fine grain */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "170px 170px",
        }}
      />
    </div>
  );
}
