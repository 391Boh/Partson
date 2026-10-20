import { useState } from "react";

import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { notifyProductImageUpdated } from "app/lib/product-image-updates";
import { rotatePreparedProductImage } from "app/lib/product-image-upload-client";

// Rotate-before-save and remove-saved-photo for the admin photo editors
// (ProductPageAdminEditPanel, ProductFullEditModal). The prepared preview and
// its size stay owned by the caller, which also uploads it.
export function useProductPhotoEdit(params: {
  code: string;
  article?: string;
  getToken: () => Promise<string | null>;
  imagePreview: string | null;
  onPreviewChange: (dataUrl: string, outputBytes: number) => void;
  onError: (message: string | null) => void;
}) {
  const { code, article, getToken, imagePreview, onPreviewChange, onError } = params;
  const [rotating, setRotating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);

  const rotate = async (direction: 1 | -1) => {
    if (!imagePreview || rotating) return;
    setRotating(true);
    onError(null);
    try {
      const rotated = await rotatePreparedProductImage(imagePreview, direction);
      onPreviewChange(rotated.dataUrl, rotated.outputBytes);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не вдалося повернути фото");
    } finally {
      setRotating(false);
    }
  };

  const remove = async () => {
    if (removing) return;
    const token = await getToken();
    if (!token) { onError("Не авторизовано"); return; }
    setRemoving(true);
    onError(null);
    try {
      const response = await fetch("/api/product-upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, article, remove: true }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) { onError(data.error || "Не вдалося видалити фото"); return; }
      setRemoved(true);
      // An empty preview makes every mounted view re-check the image and
      // fall back to its placeholder.
      notifyProductImageUpdated(code, article, "");
      invalidateCatalogClientCache({ code });
    } catch {
      onError("Помилка мережі");
    } finally {
      setRemoving(false);
    }
  };

  return { rotating, rotate, removing, removed, remove, resetRemoved: () => setRemoved(false) };
}
