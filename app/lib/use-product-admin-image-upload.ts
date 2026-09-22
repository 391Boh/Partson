"use client";

import { useState } from "react";
import { prepareProductImage } from "app/lib/product-image-upload-client";
import { clearProductImageMissing, clearProductImageSuccess } from "app/lib/product-image-client";

type AdminEditResult = { ok: boolean; error?: string };

// The catalog grid card and the catalog list row independently implemented
// the exact same "pick a front image → prepare it → save via onAdminEdit →
// clear the image caches" flow. Centralized here so both just wire up their
// own <input type="file">.
export function useProductAdminImageUpload(params: {
  onAdminEdit?: (data: { imageDataUrl: string; imageName: string }) => Promise<AdminEditResult>;
  code: string;
  article?: string;
}) {
  const { onAdminEdit, code, article } = params;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localImageSrc, setLocalImageSrc] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onAdminEdit) return;
    setSaving(true);
    setError(null);
    try {
      const prepared = await prepareProductImage(file);
      const result = await onAdminEdit({
        imageDataUrl: prepared.dataUrl,
        imageName: prepared.fileName,
      }).catch(() => ({ ok: false as const, error: "Помилка мережі" }));
      if (result?.ok) {
        // The card displays the prepared image immediately, while clearing
        // both browser-side outcomes ensures a later remount revalidates
        // the freshly uploaded image instead of restoring an old hit/miss.
        clearProductImageSuccess(code, article || undefined);
        clearProductImageMissing(code, article || undefined);
        setLocalImageSrc(prepared.dataUrl);
      } else {
        setError(result?.error ?? "Помилка завантаження");
        setTimeout(() => setError(null), 6000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося обробити зображення");
      setTimeout(() => setError(null), 6000);
    } finally {
      setSaving(false);
    }
  };

  return { saving, error, localImageSrc, handleFileChange };
}
