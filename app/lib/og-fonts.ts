import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const toArrayBuffer = (buffer: Buffer) =>
  buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

const readPublicFont = async (fileName: string) =>
  toArrayBuffer(await readFile(join(process.cwd(), "public", "fonts", fileName)));

const montserrat500Promise = readPublicFont("montserrat-500.ttf");
const montserrat700Promise = readPublicFont("montserrat-700.ttf");
const montserrat800Promise = readPublicFont("montserrat-800.ttf");

export const getOgFonts = async () => {
  const [montserrat500, montserrat700, montserrat800] = await Promise.all([
    montserrat500Promise,
    montserrat700Promise,
    montserrat800Promise,
  ]);

  return [
    {
      name: "Montserrat",
      data: montserrat500,
      weight: 500 as const,
      style: "normal" as const,
    },
    {
      name: "Montserrat",
      data: montserrat700,
      weight: 700 as const,
      style: "normal" as const,
    },
    {
      name: "Montserrat",
      data: montserrat800,
      weight: 800 as const,
      style: "normal" as const,
    },
  ];
};
