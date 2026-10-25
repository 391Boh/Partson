// Keep these lists in sync with the three static backdrop components.
export const HOME_BACKDROP_ASSETS = {
  "auto": [
    "/Carlogo/KIA.svg",
    "/Carlogo/Mitsubishi.svg",
    "/Carlogo/Chevrolet.svg",
    "/Carlogo/Peugeot.svg",
    "/Carlogo/Volvo.svg",
    "/Carlogo/Geely.svg",
    "/Carlogo/Jaguar.svg",
    "/Carlogo/Renault.svg",
    "/Carlogo/Suzuki.svg",
    "/Carlogo/DAF.svg",
    "/Carlogo/Mazda.svg"
  ],
  "brands": [
    "/Brands/CONTITECH.svg",
    "/Brands/HENGST%20FILTER.svg",
    "/Brands/TOPRAN.svg",
    "/Brands/METZGER.svg",
    "/Brands/Delphi.svg",
    "/Brands/STELLOX.svg",
    "/Brands/SOGEFI.svg",
    "/Brands/GSP.svg",
    "/Brands/Filtron.svg",
    "/Brands/SHAFER.svg",
    "/Brands/TRISCAN.svg"
  ],
  "product": [
    "/Parts/cutout/filtr.webp",
    "/Parts/cutout/amort.webp",
    "/Parts/cutout/podush.webp",
    "/Parts/cutout/grm.webp",
    "/Parts/cutout/masl.webp",
    "/Parts/cutout/nakon.webp",
    "/Parts/cutout/kol.webp"
  ]
} as const;

type Kind = keyof typeof HOME_BACKDROP_ASSETS;
const preparations = new Map<Kind, Promise<void>>();

/** Fetch/decode offscreen artwork alongside its section chunk, never behind
 * another intersection observer, dynamic import or the Google Maps load event. */
export function prepareHomeBackdrop(kind: Kind): Promise<void> {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || ["2g", "slow-2g"].includes(connection?.effectiveType ?? "")) return Promise.resolve();
  const existing = preparations.get(kind);
  if (existing) return existing;
  const preparation = new Promise<void>(resolve => {
    // A failed or slow decoration must never prevent catalogue interaction.
    const timeout = window.setTimeout(resolve, 1800);
    void Promise.allSettled(HOME_BACKDROP_ASSETS[kind].map(src => {
      const image = new Image();
      image.fetchPriority = "low";
      image.src = src;
      return image.decode();
    })).then(() => { window.clearTimeout(timeout); resolve(); });
  });
  preparations.set(kind, preparation);
  return preparation;
}
