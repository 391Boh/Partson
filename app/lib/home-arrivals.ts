import type { VitolGroup } from "./vitol-groups";

// Real 1C products used by the homepage showcase. The generator snapshots
// their photos only; live catalog data still belongs to the linked pages.
export const HOME_ARRIVAL_CARDS: Array<{ group: VitolGroup; about: string; brands: string; code: string }> = [
  { group: "Ручний інструмент", about: "Набори ключів і головок, тріскачки, викрутки", brands: "ALLOID · HANS", code: "РТ-00004897" },
  { group: "Освіжувачі повітря", about: "Гелеві, підвісні та ароматичні саше", brands: "AREON · VITOL · TASOTTI", code: "РТ-00001926" },
  { group: "Автохімія та догляд", about: "Поліролі, шампуні, очисники, омивачі", brands: "VITOL · VOIN · ABRO", code: "РТ-00003312" },
  { group: "Автолампи", about: "LED і галогенні: головне світло, габарити", brands: "PULSO", code: "РТ-00002289" },
  { group: "Домкрати", about: "Підкатні, ромбоподібні, телескопічні", brands: "VITOL · IRON HAND", code: "РТ-00002144" },
  { group: "Компресори та шиноремонт", about: "Компресори, манометри, набори для ремонту шин", brands: "VITOL · ШТУРМОВИК · VOIN", code: "РТ-00004117" },
];

export const HOME_ARRIVAL_FLOATING = [
  { code: "РТ-00002367", className: "left-[3%] top-10 w-[180px] rotate-[60deg] 2xl:left-[8%]" },
  { code: "РТ-00002841", className: "left-[15%] top-[120px] w-[120px] rotate-[10deg] 2xl:left-[19%]" },
  { code: "РТ-00004074", className: "left-[5%] top-[200px] w-[125px] -rotate-[10deg] opacity-90 2xl:left-[10%]" },
  { code: "РТ-00005556", className: "right-[4%] top-8 w-[150px] rotate-[7deg] 2xl:right-[9%]" },
  { code: "РТ-00002256", className: "right-[15%] top-[130px] w-[126px] -rotate-[8deg] 2xl:right-[20%]" },
  { code: "РТ-00003979", className: "right-[5%] top-[215px] w-[120px] rotate-[12deg] opacity-90 2xl:right-[10%]" },
];
