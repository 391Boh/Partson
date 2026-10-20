"use client";

import { Check, ImagePlus, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { useEffect, useState, type DragEvent, type RefObject } from "react";

import { formatProductImageSize, PRODUCT_IMAGE_ACCEPT, PRODUCT_IMAGE_MAX_SOURCE_BYTES } from "app/lib/product-image-upload-client";

function useImmediatePreview(processing: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => { if (!processing && src) setSrc(null); }, [processing, src]);
  const show = (file?: File) => {
    setSrc(file && file.size > 0 && file.size <= PRODUCT_IMAGE_MAX_SOURCE_BYTES &&
      PRODUCT_IMAGE_ACCEPT.split(",").includes(file.type.toLowerCase())
      ? URL.createObjectURL(file) : null);
  };
  return [processing ? src : null, show] as const;
}

// Drop a file on a picker button: it goes through the same hidden <input> and
// change handler as a click-picked file, so preparation stays identical.
function useFileDrop(
  inputRef: RefObject<HTMLInputElement | null>,
  onPicked: (event: React.ChangeEvent<HTMLInputElement>) => void,
  disabled: boolean
) {
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (disabled || !event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLElement>) => {
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      const input = inputRef.current;
      if (disabled || !file || !input) return;
      event.preventDefault();
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      onPicked({ target: input, currentTarget: input } as React.ChangeEvent<HTMLInputElement>);
    },
  };
  return [dragging, handlers] as const;
}

// Shared by ProductPageAdminEditPanel's own inline panel and
// ProductFullEditModal — extracted so both surfaces upload through the exact
// same state/handlers (and thus the same API calls) instead of maintaining
// two copies of this markup.
export type ProductImageUploadFieldsProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  galleryFileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGalleryFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  imagePreview: string | null;
  imageProcessing: boolean;
  imageUploading: boolean;
  imageUploaded: boolean;
  imageError: string | null;
  imageFileName?: string;
  imageUploadSize: number;
  onUploadImage: () => void;
  onCancelImage: () => void;
  /** Rotates the prepared (not yet saved) main photo by 90°. */
  onRotateImage?: (direction: 1 | -1) => void;
  imageRotating?: boolean;
  /** Removes the saved main photo; omitted where the product has none. */
  onRemoveImage?: () => void;
  imageRemoving?: boolean;
  imageRemoved?: boolean;

  galleryPreview: string | null;
  galleryProcessing: boolean;
  galleryUploading: boolean;
  galleryUploaded: boolean;
  galleryError: string | null;
  galleryFileName?: string;
  galleryUploadSize: number;
  onUploadGallery: () => void;
  onCancelGallery: () => void;
};

export default function ProductImageUploadFields({
  fileInputRef,
  galleryFileInputRef,
  onFileChange,
  onGalleryFileChange,
  imagePreview,
  imageProcessing,
  imageUploading,
  imageUploaded,
  imageError,
  imageFileName,
  imageUploadSize,
  onUploadImage,
  onCancelImage,
  onRotateImage,
  imageRotating = false,
  onRemoveImage,
  imageRemoving = false,
  imageRemoved = false,
  galleryPreview,
  galleryProcessing,
  galleryUploading,
  galleryUploaded,
  galleryError,
  galleryFileName,
  galleryUploadSize,
  onUploadGallery,
  onCancelGallery,
}: ProductImageUploadFieldsProps) {
  const [immediateImage, showImage] = useImmediatePreview(imageProcessing);
  const [immediateGallery, showGallery] = useImmediatePreview(galleryProcessing);
  const displayedImage = immediateImage || imagePreview;
  const displayedGallery = immediateGallery || galleryPreview;
  const pickImage = (event: React.ChangeEvent<HTMLInputElement>) => { showImage(event.target.files?.[0]); onFileChange(event); };
  const pickGallery = (event: React.ChangeEvent<HTMLInputElement>) => { showGallery(event.target.files?.[0]); onGalleryFileChange(event); };
  const [imageDragging, imageDrop] = useFileDrop(fileInputRef, pickImage, imageProcessing || imageUploading);
  const [galleryDragging, galleryDrop] = useFileDrop(galleryFileInputRef, pickGallery, galleryProcessing || galleryUploading);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const imageBusy = imageUploading || imageProcessing || imageRotating;
  return (
    <div className="product-image-upload-fields">
      <input ref={fileInputRef} aria-label="Основне фото товару" type="file" accept={PRODUCT_IMAGE_ACCEPT} className="hidden" onChange={pickImage} />
      <input ref={galleryFileInputRef} aria-label="Фото для галереї" type="file" accept={PRODUCT_IMAGE_ACCEPT} className="hidden" onChange={pickGallery} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          {!displayedImage ? (
            <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageProcessing}
              {...imageDrop}
              className={`flex w-full items-center gap-2.5 rounded-[12px] border border-dashed px-3.5 py-2.5 text-[12px] font-semibold text-violet-500 transition hover:border-violet-300 hover:bg-violet-50/60 ${
                imageDragging ? "border-violet-400 bg-violet-100/70 ring-2 ring-violet-200" : "border-violet-200 bg-violet-50/30"
              }`}
            >
              {imageProcessing
                ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                : <ImagePlus size={15} className="shrink-0" />}
              <span className="min-w-0 text-left">
                <span className="block">{imageProcessing ? "Обробка фото..." : imageDragging ? "Відпустіть, щоб замінити" : "Замінити фото товару"}</span>
                {!imageProcessing && !imageDragging && (
                  <span className="block text-[10px] font-medium text-violet-400">Натисніть або перетягніть файл · JPG, PNG, WebP</span>
                )}
              </span>
              {imageUploaded && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                  <Check size={9} /> Завантажено
                </span>
              )}
              {imageRemoved && !imageUploaded && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                  <Check size={9} /> Фото видалено
                </span>
              )}
            </button>
            {onRemoveImage && !imageRemoved && (
              confirmingRemove ? (
                <div role="group" aria-label="Підтвердження видалення фото" className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50/70 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                  <span className="min-w-0 flex-1">Видалити основне фото товару?</span>
                  <button
                    type="button"
                    onClick={() => { setConfirmingRemove(false); onRemoveImage(); }}
                    disabled={imageRemoving}
                    className="inline-flex items-center gap-1 rounded-[8px] bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                  >
                    Видалити
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    className="rounded-[8px] px-2 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Ні
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  disabled={imageRemoving || imageProcessing}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-[11px] font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                >
                  {imageRemoving
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                    : <Trash2 size={12} />}
                  {imageRemoving ? "Видаляємо фото…" : "Видалити фото"}
                </button>
              )
            )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayedImage}
                  decoding="async"
                  alt="Попередній перегляд"
                  className={`h-20 w-20 shrink-0 rounded-[12px] border border-slate-200 bg-white object-contain transition-opacity ${imageRotating ? "opacity-50" : ""}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="mb-2 truncate text-[11px] font-medium text-slate-500">
                    {imageProcessing ? "Готуємо фото…" : <>{imageFileName}{imageUploadSize ? ` · ${formatProductImageSize(imageUploadSize)}` : ""}</>}
                  </p>
                  {onRotateImage && (
                    <div className="mb-2 flex gap-1.5" role="group" aria-label="Поворот фото">
                      <button
                        type="button"
                        onClick={() => onRotateImage(-1)}
                        disabled={imageBusy}
                        aria-label="Повернути проти годинникової стрілки"
                        title="Повернути ліворуч"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-50"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRotateImage(1)}
                        disabled={imageBusy}
                        aria-label="Повернути за годинниковою стрілкою"
                        title="Повернути праворуч"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-50"
                      >
                        <RotateCw size={14} />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onUploadImage}
                      disabled={imageBusy}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {imageUploading
                        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                        : <Check size={12} />}
                      {imageUploading ? "Завантаження..." : "Зберегти фото"}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelImage}
                      disabled={imageBusy}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <X size={12} /> Скасувати
                    </button>
                  </div>
                </div>
              </div>
              {imageError && <p role="alert" className="text-[11px] font-semibold text-red-500">{imageError}</p>}
            </div>
          )}
          {imageError && !imagePreview && (
            <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-500">{imageError}</p>
          )}
        </div>

        <div className="flex-1">
          {!displayedGallery ? (
            <button
              type="button"
              onClick={() => galleryFileInputRef.current?.click()}
              disabled={galleryProcessing}
              {...galleryDrop}
              className={`flex w-full items-center gap-2.5 rounded-[12px] border border-dashed px-3.5 py-2.5 text-[12px] font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50/60 ${
                galleryDragging ? "border-sky-400 bg-sky-100/70 ring-2 ring-sky-200" : "border-sky-200 bg-sky-50/30"
              }`}
            >
              {galleryProcessing
                ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                : <ImagePlus size={15} className="shrink-0" />}
              <span className="min-w-0 text-left">
                <span className="block">{galleryProcessing ? "Обробка фото..." : galleryDragging ? "Відпустіть, щоб додати" : "Додати фото в галерею"}</span>
                {!galleryProcessing && !galleryDragging && (
                  <span className="block text-[10px] font-medium text-sky-400">Натисніть або перетягніть файл</span>
                )}
              </span>
              {galleryUploaded && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                  <Check size={9} /> Додано
                </span>
              )}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayedGallery}
                  decoding="async"
                  alt="Попередній перегляд"
                  className="h-14 w-14 shrink-0 rounded-[10px] border border-slate-200 bg-white object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="mb-2 truncate text-[11px] font-medium text-slate-500">
                    {galleryProcessing ? "Готуємо фото…" : <>{galleryFileName}{galleryUploadSize ? ` · ${formatProductImageSize(galleryUploadSize)}` : ""}</>}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onUploadGallery}
                      disabled={galleryUploading || galleryProcessing}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {galleryUploading
                        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                        : <Check size={12} />}
                      {galleryUploading ? "Завантаження..." : "Додати"}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelGallery}
                      disabled={galleryUploading || galleryProcessing}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <X size={12} /> Скасувати
                    </button>
                  </div>
                </div>
              </div>
              {galleryError && <p role="alert" className="text-[11px] font-semibold text-red-500">{galleryError}</p>}
            </div>
          )}
          {galleryError && !galleryPreview && (
            <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-500">{galleryError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
