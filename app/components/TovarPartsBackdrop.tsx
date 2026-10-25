// Static cut-out photographs with fixed aspect ratios. The parent section
// prepares the images before mounting; CSS controls placement and hover.

type Part = {
  src: string;
  ratio: number; // width / height, so the box can never distort the photo
  className: string; // corner position + responsive width (mobile-first)
  drift: number; // px of vertical travel across the section's scroll (desktop)
  rot: number; // resting rotation, deg
  rotDrift: number; // extra rotation swung across the scroll, deg
  zoom: number; // growth from when the part enters to when it leaves
  opacity: number;
  // horizontal-centre this layer (pair with `left-1/2` in className); the
  // -50% X shift is baked into the transform so the parallax doesn't drop it
  cx?: boolean;
};

// Static cut-outs: CSS owns placement and hover effects.
// An even, non-overlapping scatter: three parts down the left edge, three down
// the right, brake pads centred at the bottom. Each sits on its own vertical
// band so no two share a row on the same side, at any breakpoint. Mobile keeps
// the layout, just smaller and pulled further off the edges.
const PARTS: Part[] = [
  // ---- LEFT EDGE, top → bottom ---------------------------------------
  {
    // cabin filter
    src: "/Parts/cutout/filtr.webp",
    ratio: 1414 / 926,
    className:
      "top-[2%] left-[-16%] w-[34vw] max-w-[116px] sm:top-[3%] sm:left-[-4%] sm:w-[14vw] sm:max-w-[185px]",
    drift: -44,
    rot: 8,
    rotDrift: 2,
    zoom: 0.07,
    opacity: 0.09,
  },
  {
    // shock absorber — tall
    src: "/Parts/cutout/amort.webp",
    ratio: 1229 / 1061,
    className:
      "top-[26%] left-[-15%] w-[32vw] max-w-[104px] min-w-[78px] sm:top-[28%] sm:left-[-6%] sm:w-[16vw] sm:max-w-[185px] sm:min-w-[120px]",
    drift: 50,
    rot: 11,
    rotDrift: -2.5,
    zoom: 0.07,
    opacity: 0.11,
  },
  {
    // engine mount — deepest / slowest layer
    src: "/Parts/cutout/podush.webp",
    ratio: 1419 / 1153,
    className:
      "top-[60%] left-[-14%] w-[30vw] max-w-[102px] min-w-[74px] lg:top-[58%] lg:left-[-3%] lg:w-[17vw] lg:max-w-[220px] lg:min-w-[150px]",
    drift: -24,
    rot: -8,
    rotDrift: 1.5,
    zoom: 0.05,
    opacity: 0.09,
  },
  // ---- RIGHT EDGE, top → bottom -------------------------------------
  {
    // timing-belt kit — the wide piece
    src: "/Parts/cutout/grm.webp",
    ratio: 1461 / 873,
    className:
      "-top-[2%] right-[-20%] w-[52vw] max-w-[200px] sm:-top-[6%] sm:right-[-8%] sm:w-[34vw] sm:max-w-[400px] sm:min-w-[240px]",
    drift: -66,
    rot: -6,
    rotDrift: 2,
    zoom: 0.07,
    opacity: 0.11,
  },
  {
    // oil filter — compact, round
    src: "/Parts/cutout/masl.webp",
    ratio: 1003 / 868,
    className:
      "top-[42%] right-[-11%] w-[26vw] max-w-[92px] sm:top-[47%] sm:right-[-1%] sm:w-[11vw] sm:max-w-[148px]",
    drift: 42,
    rot: -9,
    rotDrift: 3,
    zoom: 0.08,
    opacity: 0.1,
  },
  {
    // tie-rod end
    src: "/Parts/cutout/nakon.webp",
    ratio: 1325 / 906,
    className:
      "bottom-[13%] right-[-14%] w-[38vw] max-w-[128px] sm:bottom-[-5%] sm:right-[1%] sm:w-[25vw] sm:max-w-[320px] sm:min-w-[190px]",
    drift: 54,
    rot: 7,
    rotDrift: 2.5,
    zoom: 0.06,
    opacity: 0.1,
  },
  // ---- BOTTOM CENTRE ----------------------------------------------
  {
    // brake pads — fills the empty band under the grid
    src: "/Parts/cutout/kol.webp",
    ratio: 567 / 382,
    className:
      "bottom-[1%] left-1/2 w-[42vw] max-w-[146px] min-w-[120px] sm:bottom-[-4%] sm:w-[23vw] sm:max-w-[250px] sm:min-w-[160px]",
    drift: 60,
    rot: 6,
    rotDrift: -2.5,
    zoom: 0.06,
    opacity: 0.09,
    cx: true,
  },
];

export default function TovarPartsBackdrop() {

  return (
    <div
      aria-hidden="true"
      className="home-backdrop pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {PARTS.map((part) => (
        <div
          key={part.src}
          data-drift={part.drift}
          data-rot={part.rot}
          data-rot-drift={part.rotDrift}
          data-zoom={part.zoom}
          data-src={part.src}
          data-cx={part.cx ? "1" : undefined}
          style={{
            aspectRatio: String(part.ratio),
            backgroundImage: `url(${part.src})`,
            ["--po" as string]: part.opacity,
            transform: `translate(${part.cx ? "-50%" : "0"}, 0) rotate(${part.rot}deg)`,
          }}
          className={`tovar-part absolute bg-contain bg-center bg-no-repeat [filter:grayscale(0.22)] ${part.className}`}
        />
      ))}
      {/* gentle top wash so the heading / lead / search read cleanly, plus a
          soft edge vignette — tuned to the section's own light gradient */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(239,246,255,0.7)_0%,rgba(239,246,255,0.28)_26%,transparent_44%),radial-gradient(ellipse_125%_105%_at_50%_54%,transparent_0%,transparent_50%,rgba(236,248,251,0.5)_100%)]" />
    </div>
  );
}
