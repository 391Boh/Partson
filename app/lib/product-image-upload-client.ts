"use client";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const PRODUCT_IMAGE_MAX_SOURCE_BYTES = 12 * 1024 * 1024;

// The API accepts a 3 MiB JSON body. Keeping the JPEG payload below 1.8 MiB
// leaves enough room for base64 expansion (~4/3), metadata and JSON escaping.
const PRODUCT_IMAGE_MAX_OUTPUT_BYTES = 1_800_000;
// The site never serves a product photo larger than 1400px
// (FULL_IMAGE_MAX_WIDTH in app/product-image/[code]/route.ts), so uploading
// more only made the request, 1C's storage and every later 1C photo lookup
// heavier: ~40% fewer bytes for a typical phone photo at the same visible quality.
const PRODUCT_IMAGE_MAX_EDGE = 1400;
const PRODUCT_IMAGE_START_QUALITY = 0.82;
const MIN_JPEG_QUALITY = 0.58;
const JPEG_PASSTHROUGH_MAX_BYTES = 64 * 1024;

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

const decodeImage = async (file: File) => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Older browsers may support the API without supporting this format.
    }
  }
  const image = await loadImage(file);
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => {
    image.onload = null;
    image.onerror = null;
    image.src = "";
  } };
};

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

const canKeepJpegBytes = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  // EXIF may carry rotation and location. Keep normalizing these files so
  // server-generated thumbnails remain upright and upload metadata is removed.
  for (let index = 2; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xe1) return false;
  }
  return true;
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

  const image = await decodeImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (!sourceWidth || !sourceHeight) {
      throw new Error("Зображення має некоректні розміри.");
    }

    // Small, correctly sized JPEGs are already upload-ready. Keep their bytes
    // and quality instead of decoding, drawing and encoding them a second time.
    if (file.type.toLowerCase() === "image/jpeg" && file.size <= JPEG_PASSTHROUGH_MAX_BYTES &&
        Math.max(sourceWidth, sourceHeight) <= PRODUCT_IMAGE_MAX_EDGE && await canKeepJpegBytes(file)) {
      return {
        dataUrl: await blobToDataUrl(file), fileName: buildJpegFileName(file.name),
        width: sourceWidth, height: sourceHeight, outputBytes: file.size,
      };
    }

    let scale = Math.min(1, PRODUCT_IMAGE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    let quality = PRODUCT_IMAGE_START_QUALITY;
    let blob: Blob | null = null;
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Браузер не підтримує обробку цього зображення.");
    let drawnWidth = 0;
    let drawnHeight = 0;

    // Reduce quality first, then dimensions if a very detailed photo still does
    // not fit. This guarantees the resulting JSON request remains below the API limit.
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      if (drawnWidth !== width || drawnHeight !== height) {
        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image.source, 0, 0, width, height);
        drawnWidth = width;
        drawnHeight = height;
      }

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
  } finally {
    image.release();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
};

const dataUrlToImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не вдалося повернути зображення."));
    image.src = dataUrl;
  });

/** Rotates an already prepared photo by 90° (phone photos often arrive on
 *  their side). Re-encodes once at the same quality the upload uses. */
export const rotatePreparedProductImage = async (
  dataUrl: string,
  direction: 1 | -1
): Promise<Pick<PreparedProductImage, "dataUrl" | "width" | "height" | "outputBytes">> => {
  const image = await dataUrlToImage(dataUrl);
  const canvas = document.createElement("canvas");
  try {
    canvas.width = image.naturalHeight;
    canvas.height = image.naturalWidth;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Браузер не підтримує обробку цього зображення.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((direction * Math.PI) / 2);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const blob = await canvasToJpegBlob(canvas, PRODUCT_IMAGE_START_QUALITY);
    return {
      dataUrl: await blobToDataUrl(blob),
      width: canvas.width,
      height: canvas.height,
      outputBytes: blob.size,
    };
  } finally {
    image.src = "";
    canvas.width = 0;
    canvas.height = 0;
  }
};
