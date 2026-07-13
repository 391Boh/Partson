"use client";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const PRODUCT_IMAGE_MAX_SOURCE_BYTES = 12 * 1024 * 1024;

// The API accepts a 3 MiB JSON body. Keeping the JPEG payload below 1.8 MiB
// leaves enough room for base64 expansion (~4/3), metadata and JSON escaping.
const PRODUCT_IMAGE_MAX_OUTPUT_BYTES = 1_800_000;
const PRODUCT_IMAGE_MAX_EDGE = 1800;
const MIN_JPEG_QUALITY = 0.58;

export type PreparedProductImage = {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  outputBytes: number;
};

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не вдалося прочитати зображення. Оберіть інший файл."));
    };
    image.src = objectUrl;
  });

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Не вдалося підготувати зображення до завантаження."));
      },
      "image/jpeg",
      quality
    );
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Не вдалося підготувати зображення до завантаження."));
    reader.onerror = () => reject(new Error("Не вдалося прочитати зображення."));
    reader.readAsDataURL(blob);
  });

const buildJpegFileName = (originalName: string) => {
  const base = originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${base || "product"}.jpg`;
};

export const formatProductImageSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

export const prepareProductImage = async (file: File): Promise<PreparedProductImage> => {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Підтримуються лише JPG, PNG та WebP.");
  }
  if (file.size <= 0) {
    throw new Error("Файл зображення порожній.");
  }
  if (file.size > PRODUCT_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error(
      `Файл завеликий. Максимальний розмір — ${formatProductImageSize(PRODUCT_IMAGE_MAX_SOURCE_BYTES)}.`
    );
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Зображення має некоректні розміри.");
  }

  let scale = Math.min(1, PRODUCT_IMAGE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  let quality = 0.86;
  let blob: Blob | null = null;
  let canvas = document.createElement("canvas");

  // Reduce quality first, then dimensions if a very detailed photo still does
  // not fit. This guarantees the resulting JSON request remains below the API limit.
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Браузер не підтримує обробку цього зображення.");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    blob = await canvasToJpegBlob(canvas, quality);
    if (blob.size <= PRODUCT_IMAGE_MAX_OUTPUT_BYTES) break;

    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 0.08);
    } else {
      scale *= 0.82;
    }
  }

  if (!blob || blob.size > PRODUCT_IMAGE_MAX_OUTPUT_BYTES) {
    throw new Error("Не вдалося зменшити фото до безпечного розміру. Оберіть менше зображення.");
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    fileName: buildJpegFileName(file.name),
    width: canvas.width,
    height: canvas.height,
    outputBytes: blob.size,
  };
};
