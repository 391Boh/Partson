"use client";

export type BlogMediaKind = "image" | "video";

export const uploadBlogMedia = async (
  file: File,
  kind: BlogMediaKind,
  token: string
): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);

  const response = await fetch("/api/blog/upload", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    error?: string;
  };

  if (!response.ok || !payload.ok || !payload.url) {
    throw new Error(payload.error || "Не вдалося завантажити файл.");
  }

  return payload.url;
};
