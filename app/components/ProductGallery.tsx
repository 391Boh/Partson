"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";

import { prepareProductImage, PRODUCT_IMAGE_ACCEPT } from "app/lib/product-image-upload-client";
import {
  PRODUCT_GALLERY_SELECTION_EVENT,
  type ProductGallerySelectionDetail,
} from "app/lib/product-gallery-events";

interface GalleryImage {
  id: string;
  url: string;
}

export default function ProductGallery({
  code,
  productName,
  initialImages = [],
}: {
  code: string;
  productName: string;
  initialImages?: string[];
}) {
  const [images, setImages] = useState<GalleryImage[]>(() =>
    initialImages.map((url, index) => ({ id: `server-${index}`, url }))
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkStoredAdminFlag = () => {
      try {
        const uid = localStorage.getItem("user_id");
        if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
          setIsAdmin(true);
          return true;
        }
      } catch {}
      return false;
    };

    if (checkStoredAdminFlag()) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handler);

    // This component mounts immediately (not lazy-loaded like the admin edit
    // panel), so it can mount before LayoutHost's async admin-role check
    // (Firestore role lookup + /api/is-admin) finishes and both writes
    // localStorage AND fires the event above — missing both. Poll briefly as
    // a fallback so it still picks up admin status once that resolves.
    const retryTimers = [400, 1000, 2000, 4000].map((delay) =>
      window.setTimeout(checkStoredAdminFlag, delay)
    );

    return () => {
      window.removeEventListener("partson:adminStateChange", handler);
      retryTimers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!code || initialImages.length > 0) return;
    const controller = new AbortController();
    void fetch(`/api/product-gallery?code=${encodeURIComponent(code)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { images: [] }))
      .then((payload: { images?: GalleryImage[] }) => {
        if (Array.isArray(payload.images) && payload.images.length > 0) {
          setImages(payload.images.filter((image) => Boolean(image?.url)));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [code, initialImages.length]);

  useEffect(() => {
    if (!code || !isAdmin) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void Promise.all([import("firebase/firestore"), import("../../firebase")]).then(
      ([firestore, firebaseModule]) => {
        if (cancelled) return;
        unsubscribe = firestore.onSnapshot(
          firestore.query(
            firestore.collection(firebaseModule.db, "productGallery", code, "images"),
            firestore.orderBy("uploadedAt", "asc")
          ),
          (snap) =>
            setImages(
              snap.docs
                .map((doc) => ({ id: doc.id, url: doc.data().url as string }))
                .filter((image) => Boolean(image.url))
            )
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [code, isAdmin]);

  const getToken = async (): Promise<string | null> => {
    const { waitForFirebaseAuthReady } = await import("app/lib/firebase-auth-state");
    const snapshot = await waitForFirebaseAuthReady();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  };

  const selectImage = useCallback((imageUrl: string | null) => {
    setSelectedImageUrl(imageUrl);
    window.dispatchEvent(
      new CustomEvent<ProductGallerySelectionDetail>(PRODUCT_GALLERY_SELECTION_EVENT, {
        detail: { code, imageUrl },
      })
    );
  }, [code]);

  useEffect(() => {
    if (!selectedImageUrl) return;
    if (images.some((image) => image.url === selectedImageUrl)) return;
    selectImage(null);
  }, [images, selectImage, selectedImageUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const prepared = await prepareProductImage(file);
      const token = await getToken();
      if (!token) {
        setError("Не авторизовано");
        return;
      }
      const res = await fetch("/api/product-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, imageDataUrl: prepared.dataUrl }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) setError(data.error || "Помилка завантаження");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося обробити зображення");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (imageId: string) => {
    const token = await getToken();
    if (!token) {
      setError("Не авторизовано");
      return;
    }
    setRemovingId(imageId);
    try {
      const res = await fetch("/api/product-gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, imageId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error || "Не вдалося видалити фото");
      } else if (images.find((image) => image.id === imageId)?.url === selectedImageUrl) {
        selectImage(null);
      }
    } catch {
      setError("Помилка мережі");
    } finally {
      setRemovingId(null);
    }
  };

  if (images.length === 0 && !isAdmin) return null;

  return (
    <div className="relative z-20 shrink-0 border-t border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
          Галерея · {images.length} фото
        </p>
        {selectedImageUrl ? (
          <button
            type="button"
            onClick={() => selectImage(null)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold text-sky-700 transition hover:bg-white hover:text-sky-900"
          >
            <RotateCcw size={11} aria-hidden="true" />
            Основне фото
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {images.map((image, index) => (
          <div key={image.id} className="group relative h-16 w-16 shrink-0 sm:h-[72px] sm:w-[72px]">
            <button
              type="button"
              onClick={() => selectImage(image.url)}
              aria-label={`Показати як основне фото ${index + 1}`}
              aria-pressed={selectedImageUrl === image.url}
              className={`relative h-full w-full overflow-hidden rounded-[14px] bg-white transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 ${
                selectedImageUrl === image.url
                  ? "border-2 border-sky-500 shadow-[0_10px_22px_rgba(14,165,233,0.22)] ring-2 ring-sky-100"
                  : "border border-slate-200/90 shadow-[0_3px_10px_rgba(15,23,42,0.07)] hover:border-sky-300 hover:shadow-[0_10px_20px_rgba(14,165,233,0.16)]"
              }`}
            >
              {/* Thumbnails render at 64-72px CSS, but image.url points at the
                  raw, full-resolution Firebase Storage upload (up to 3MB) —
                  a plain <img> pulled that whole file for a postage-stamp
                  preview. Firebase Storage is already an allowed remote
                  pattern in next.config.ts, so next/image downsizes and
                  re-encodes (AVIF/WebP) it through the normal optimizer. */}
              <Image
                src={image.url}
                alt={`${productName} — додаткове фото ${index + 1}`}
                fill
                sizes="72px"
                loading="lazy"
                className="object-contain p-1"
              />
              {selectedImageUrl === image.url ? (
                <span className="pointer-events-none absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-sky-600 text-white shadow-md">
                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                </span>
              ) : null}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => void removeImage(image.id)}
                disabled={removingId === image.id}
                title="Видалити фото"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 opacity-0 shadow-[0_2px_6px_rgba(15,23,42,0.15)] transition hover:bg-rose-50 hover:scale-110 group-hover:opacity-100 disabled:opacity-60"
              >
                {removingId === image.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        ))}

        {isAdmin && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Додати фото"
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border border-dashed border-sky-200 bg-sky-50/50 text-sky-600 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60 sm:h-[72px] sm:w-[72px]"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            <span className="text-[9px] font-semibold">Додати</span>
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] font-semibold text-red-500">{error}</p>}

      {isAdmin && (
        <input
          ref={fileInputRef}
          type="file"
          accept={PRODUCT_IMAGE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />
      )}

    </div>
  );
}
