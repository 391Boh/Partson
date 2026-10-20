"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from "lucide-react";

import { useProductImageUpdate } from "app/lib/product-image-updates";
import { buildProductImagePath } from "app/lib/product-image-path";
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
  mainImageSrc = null,
}: {
  code: string;
  productName: string;
  initialImages?: string[];
  // The main 1C photo shown above this strip — included here as the first,
  // non-removable tile so this reads as one unified "pick a photo" list
  // (main + additional) instead of a separate reset button next to a
  // strip of only the additional ones.
  mainImageSrc?: string | null;
}) {
  const imageUpdate = useProductImageUpdate(code);
  const currentMainImageSrc = imageUpdate.previewSrc || (imageUpdate.token
    ? buildProductImagePath(code, undefined, { cacheBust: imageUpdate.token }) : mainImageSrc);
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
    if (imageUpdate.token) setSelectedImageUrl(null);
  }, [imageUpdate.token]);

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

  const photoUrls = [ ...(currentMainImageSrc ? [null] : []), ...images.map((image) => image.url) ];
  const selectedIndex = Math.max(0, photoUrls.indexOf(selectedImageUrl));
  const navigate = (direction: number) => {
    if (photoUrls.length < 2) return;
    selectImage(photoUrls[(selectedIndex + direction + photoUrls.length) % photoUrls.length]);
  };

  if (photoUrls.length === 0 && !isAdmin) return null;

  const arrowButton = (direction: -1 | 1) => (
    <button
      type="button"
      onClick={() => navigate(direction)}
      aria-label={direction < 0 ? "Попереднє фото" : "Наступне фото"}
      className="product-gallery-arrow"
    >
      {direction < 0 ? <ChevronLeft size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Галерея фотографій товару"
      data-photo-count={photoUrls.length}
      data-admin={isAdmin ? "" : undefined}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          navigate(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      className="product-gallery [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-sky-600"
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Фото {photoUrls.length ? selectedIndex + 1 : 0} з {photoUrls.length}
      </p>
      <div className="product-gallery-strip">
        {photoUrls.length > 1 ? arrowButton(-1) : null}
        <div className="product-gallery-thumbs">
        {currentMainImageSrc ? (
          <div className="product-gallery-item">
            <button
              type="button"
              onClick={() => selectImage(null)}
              aria-label="Показати основне фото"
              aria-pressed={!selectedImageUrl}
              className="product-gallery-thumb"
            >
              <Image
                src={currentMainImageSrc}
                alt={`${productName} — основне фото`}
                fill
                sizes="56px"
                loading="lazy"
                className="object-contain p-1"
              />
            </button>
            {isAdmin ? <span className="product-gallery-badge">Основне</span> : null}
          </div>
        ) : null}
        {images.map((image, index) => (
          <div key={image.id} className="product-gallery-item">
            <button
              type="button"
              onClick={() => selectImage(image.url)}
              aria-label={`Показати як основне фото ${index + 1}`}
              aria-pressed={selectedImageUrl === image.url}
              className="product-gallery-thumb"
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
                sizes="56px"
                loading="lazy"
                className="object-contain p-1"
              />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => void removeImage(image.id)}
                disabled={removingId === image.id}
                title="Видалити фото"
                aria-label={`Видалити додаткове фото ${index + 1}`}
                className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-sm transition hover:scale-110 hover:bg-rose-50 disabled:opacity-60"
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
            className="product-gallery-add"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            <span>Додати</span>
          </button>
        )}
        </div>
        {photoUrls.length > 1 ? arrowButton(1) : null}
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
