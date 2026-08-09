"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ImagePlus, Loader2, Maximize2, X } from "lucide-react";

import { db } from "../../firebase";
import { waitForFirebaseAuthReady } from "app/lib/firebase-auth-state";
import { prepareProductImage, PRODUCT_IMAGE_ACCEPT } from "app/lib/product-image-upload-client";

interface GalleryImage {
  id: string;
  url: string;
}

export default function ProductGallery({ code }: { code: string }) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
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
    if (!code) return;
    return onSnapshot(
      query(collection(db, "productGallery", code, "images"), orderBy("uploadedAt", "asc")),
      (snap) =>
        setImages(snap.docs.map((d) => ({ id: d.id, url: d.data().url as string })))
    );
  }, [code]);

  const getToken = async (): Promise<string | null> => {
    const snapshot = await waitForFirebaseAuthReady();
    const user = snapshot.user as ({ getIdToken: () => Promise<string> } & object) | null;
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  };

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
      if (!data.ok) setError(data.error || "Не вдалося видалити фото");
    } catch {
      setError("Помилка мережі");
    } finally {
      setRemovingId(null);
    }
  };

  const openLightbox = (url: string) => {
    setLightboxUrl(url);
    requestAnimationFrame(() => setLightboxVisible(true));
  };

  const closeLightbox = () => {
    setLightboxVisible(false);
    window.setTimeout(() => setLightboxUrl(null), 200);
  };

  if (images.length === 0 && !isAdmin) return null;

  return (
    <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-2.5 py-2">
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
        Додаткові фото
      </p>
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
        {images.map((image) => (
          <div key={image.id} className="group relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
            <button
              type="button"
              onClick={() => openLightbox(image.url)}
              className="relative h-full w-full overflow-hidden rounded-[13px] border border-slate-200/90 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.06)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_10px_20px_rgba(14,165,233,0.16)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt="Додаткове фото товару"
                className="h-full w-full object-contain p-1"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/0 opacity-0 transition group-hover:bg-slate-950/15 group-hover:opacity-100">
                <Maximize2 className="h-4 w-4 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
              </span>
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
            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[13px] border border-dashed border-violet-200 bg-violet-50/40 text-violet-500 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-60 sm:h-16 sm:w-16"
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

      {lightboxUrl && (
        <div
          role="button"
          tabIndex={0}
          onClick={closeLightbox}
          onKeyDown={(e) => e.key === "Escape" && closeLightbox()}
          className={`fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm transition-opacity duration-200 ${
            lightboxVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="Закрити"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:rotate-90 hover:text-sky-300"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Фото товару"
            className={`max-h-[85vh] max-w-[92vw] rounded-[16px] object-contain shadow-[0_30px_80px_rgba(0,0,0,0.5)] transition-transform duration-200 ${
              lightboxVisible ? "scale-100" : "scale-95"
            }`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
