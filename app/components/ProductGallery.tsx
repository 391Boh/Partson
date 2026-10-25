"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProductGalleryThumbnail from "./ProductGalleryThumbnail";
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
  initialImagesResolved = false,
  mainImageSrc = null,
}: {
  code: string;
  productName: string;
  initialImages?: string[];
  // A confirmed empty server result needs no duplicate browser lookup.
  initialImagesResolved?: boolean;
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
  const regionRef = useRef<HTMLDivElement>(null);

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
    if (!code || initialImagesResolved || initialImages.length > 0) return;
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
  }, [code, initialImages.length, initialImagesResolved]);

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
    const syncSelection = (event: Event) => {
      const detail = (event as CustomEvent<ProductGallerySelectionDetail>).detail;
      if (detail?.code.trim() === code.trim()) setSelectedImageUrl(detail.imageUrl || null);
    };
    window.addEventListener(PRODUCT_GALLERY_SELECTION_EVENT, syncSelection);
    return () => window.removeEventListener(PRODUCT_GALLERY_SELECTION_EVENT, syncSelection);
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
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });

  // Phones: a horizontal swipe on the main photo above this strip switches
  // to the next/previous photo; vertical drags keep scrolling the page.
  const canSwipe = photoUrls.length > 1;
  useEffect(() => {
    const stage = regionRef.current
      ?.closest(".product-hero-media")
      ?.querySelector<HTMLElement>(".product-hero-stage");
    if (!stage || !canSwipe) return;
    stage.dataset.swipe = "true";
    let start: { x: number; y: number } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      start = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const direction = dx < 0 ? 1 : -1;
      navigateRef.current(direction);
      const photo = stage.firstElementChild;
      if (photo instanceof HTMLElement && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        photo.animate(
          [{ transform: `translateX(${direction * 28}px)`, opacity: 0.35 }, { transform: "none", opacity: 1 }],
          { duration: 240, easing: "cubic-bezier(.16, 1, .3, 1)" }
        );
      }
    };
    const onCancel = () => { start = null; };
    stage.addEventListener("touchstart", onStart, { passive: true });
    stage.addEventListener("touchend", onEnd, { passive: true });
    stage.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      delete stage.dataset.swipe;
      stage.removeEventListener("touchstart", onStart);
      stage.removeEventListener("touchend", onEnd);
      stage.removeEventListener("touchcancel", onCancel);
    };
  }, [canSwipe]);

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
      ref={regionRef}
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
      {canSwipe ? (
        <span className="product-gallery-counter" aria-hidden="true">
          {selectedIndex + 1} / {photoUrls.length}
        </span>
      ) : null}
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
              <ProductGalleryThumbnail
                key={currentMainImageSrc}
                src={currentMainImageSrc}
                alt={`${productName} — основне фото`}
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
              <ProductGalleryThumbnail
                key={image.url}
                src={image.url}
                alt={`${productName} — додаткове фото ${index + 1}`}
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

        {isAdmin ? (
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
        ) : (
          <button type="button" disabled tabIndex={-1} aria-hidden="true" className="product-gallery-add product-gallery-admin-preview">
            <ImagePlus className="h-4 w-4" />
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
