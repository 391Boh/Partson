"use client";

import { Check, ImagePlus, X } from "lucide-react";
import type { RefObject } from "react";

import { formatProductImageSize, PRODUCT_IMAGE_ACCEPT } from "app/lib/product-image-upload-client";

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
  return (
    <div>
      <input ref={fileInputRef} type="file" accept={PRODUCT_IMAGE_ACCEPT} className="hidden" onChange={onFileChange} />
      <input ref={galleryFileInputRef} type="file" accept={PRODUCT_IMAGE_ACCEPT} className="hidden" onChange={onGalleryFileChange} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          {!imagePreview ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageProcessing}
              className="flex w-full items-center gap-2.5 rounded-[12px] border border-dashed border-violet-200 bg-violet-50/30 px-3.5 py-2.5 text-[12px] font-semibold text-violet-500 transition hover:border-violet-300 hover:bg-violet-50/60"
            >
              {imageProcessing
                ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                : <ImagePlus size={15} className="shrink-0" />}
              <span>{imageProcessing ? "Обробка фото..." : "Замінити фото товару"}</span>
              {imageUploaded && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                  <Check size={9} /> Завантажено
                </span>
              )}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Попередній перегляд"
                  className="h-14 w-14 shrink-0 rounded-[10px] border border-slate-200 bg-white object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="mb-2 truncate text-[11px] font-medium text-slate-500">
                    {imageFileName}{imageUploadSize ? ` · ${formatProductImageSize(imageUploadSize)}` : ""}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onUploadImage}
                      disabled={imageUploading}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {imageUploading
                        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                        : <Check size={12} />}
                      {imageUploading ? "Завантаження..." : "Зберегти"}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelImage}
                      disabled={imageUploading}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <X size={12} /> Скасувати
                    </button>
                  </div>
                </div>
              </div>
              {imageError && <p className="text-[11px] font-semibold text-red-500">{imageError}</p>}
            </div>
          )}
          {imageError && !imagePreview && (
            <p className="mt-1.5 text-[11px] font-semibold text-red-500">{imageError}</p>
          )}
        </div>

        <div className="flex-1">
          {!galleryPreview ? (
            <button
              type="button"
              onClick={() => galleryFileInputRef.current?.click()}
              disabled={galleryProcessing}
              className="flex w-full items-center gap-2.5 rounded-[12px] border border-dashed border-sky-200 bg-sky-50/30 px-3.5 py-2.5 text-[12px] font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50/60"
            >
              {galleryProcessing
                ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                : <ImagePlus size={15} className="shrink-0" />}
              <span>{galleryProcessing ? "Обробка фото..." : "Додати фото в галерею"}</span>
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
                  src={galleryPreview}
                  alt="Попередній перегляд"
                  className="h-14 w-14 shrink-0 rounded-[10px] border border-slate-200 bg-white object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="mb-2 truncate text-[11px] font-medium text-slate-500">
                    {galleryFileName}{galleryUploadSize ? ` · ${formatProductImageSize(galleryUploadSize)}` : ""}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onUploadGallery}
                      disabled={galleryUploading}
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
                      disabled={galleryUploading}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <X size={12} /> Скасувати
                    </button>
                  </div>
                </div>
              </div>
              {galleryError && <p className="text-[11px] font-semibold text-red-500">{galleryError}</p>}
            </div>
          )}
          {galleryError && !galleryPreview && (
            <p className="mt-1.5 text-[11px] font-semibold text-red-500">{galleryError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
