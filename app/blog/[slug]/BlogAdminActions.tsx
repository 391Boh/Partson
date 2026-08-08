"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileVideo,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { auth } from "../../../firebase";
import { MAX_BLOG_IMAGE_BYTES, MAX_BLOG_VIDEO_BYTES } from "app/lib/blog-media";
import { uploadBlogMedia } from "app/lib/blog-upload-client";

interface BlogAdminActionsProps {
  slug: string;
  initialTitle: string;
  initialExcerpt: string;
  initialContent: string;
  initialImageDataUrl?: string;
  initialImageAlt?: string;
  initialExtraImages?: string[];
  initialVideoUrl?: string;
}

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export default function BlogAdminActions({
  slug,
  initialTitle,
  initialExcerpt,
  initialContent,
  initialImageDataUrl,
  initialImageAlt,
  initialExtraImages,
  initialVideoUrl,
}: BlogAdminActionsProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Track which image fields were actually changed by the user
  const [imageChanged, setImageChanged] = useState(false);
  const [extraImagesChanged, setExtraImagesChanged] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingExtraIndex, setUploadingExtraIndex] = useState<number | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [form, setForm] = useState({
    title: initialTitle,
    excerpt: initialExcerpt,
    content: initialContent,
    imageDataUrl: initialImageDataUrl || "",
    imageAlt: initialImageAlt || "",
    extraImages: initialExtraImages || [],
    videoUrl: initialVideoUrl || "",
  });

  useEffect(() => {
    const uid = localStorage.getItem("user_id");
    setIsAdmin(Boolean(uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1"));
    const h = (e: Event) =>
      setIsAdmin(Boolean((e as CustomEvent<{ isAdmin?: boolean }>).detail?.isAdmin));
    window.addEventListener("partson:adminStateChange", h);
    return () => window.removeEventListener("partson:adminStateChange", h);
  }, []);

  if (!isAdmin) return null;

  const getToken = async () => (await auth.currentUser?.getIdToken()) ?? "";

  const handleDelete = async () => {
    if (!confirm(`Видалити статтю "${initialTitle}"?`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/blog/posts/${slug}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${await getToken()}` },
      });
      if (!r.ok) throw new Error("Помилка видалення");
      router.push("/blog");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (form.title.trim().length < 4) { setError("Заголовок надто короткий"); return; }
    if (form.excerpt.trim().length < 20) { setError(`Опис надто короткий (мін. 20 симв, зараз ${form.excerpt.trim().length})`); return; }
    if (form.content.trim().length < 80) { setError(`Текст надто короткий (мін. 80 симв, зараз ${form.content.trim().length})`); return; }
    setSaving(true); setError("");
    try {
      // Only send image data if user actually changed it — avoids huge payload
      const payload: Record<string, unknown> = {
        title: form.title,
        excerpt: form.excerpt,
        content: form.content,
        imageAlt: form.imageAlt,
        videoUrl: form.videoUrl,
      };
      if (imageChanged) payload.imageDataUrl = form.imageDataUrl;
      if (extraImagesChanged) payload.extraImages = form.extraImages;

      const r = await fetch(`/api/blog/posts/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify(payload),
      });
      const data = await r.json() as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || "Помилка збереження");
      // Hard reload guarantees fresh data from Firestore,
      // bypassing Next.js ISR/RSC cache that router.refresh() might miss.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setSaving(false);
    }
    // No finally — on success we reload the page, so state updates are irrelevant
  };

  const handleImageFile = async (file: File | undefined, type: "main" | number) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Оберіть файл зображення."); return; }
    if (file.size > MAX_BLOG_IMAGE_BYTES) {
      setError(`Зображення завелике. Максимум ${formatMb(MAX_BLOG_IMAGE_BYTES)}.`);
      return;
    }

    if (type === "main") setUploadingImage(true);
    else setUploadingExtraIndex(type);
    try {
      const token = await getToken();
      const url = await uploadBlogMedia(file, "image", token);
      if (type === "main") {
        setImageChanged(true);
        setForm((prev) => ({ ...prev, imageDataUrl: url }));
      } else {
        setExtraImagesChanged(true);
        setForm((prev) => {
          const imgs = [...prev.extraImages];
          imgs[type] = url;
          return { ...prev, extraImages: imgs };
        });
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити зображення.");
    } finally {
      if (type === "main") setUploadingImage(false);
      else setUploadingExtraIndex(null);
    }
  };

  const handleVideoFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Оберіть відеофайл."); return; }
    if (file.size > MAX_BLOG_VIDEO_BYTES) {
      setError(`Відео завелике. Максимум ${formatMb(MAX_BLOG_VIDEO_BYTES)}.`);
      return;
    }

    setUploadingVideo(true);
    try {
      const token = await getToken();
      const url = await uploadBlogMedia(file, "video", token);
      setForm((prev) => ({ ...prev, videoUrl: url }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити відео.");
    } finally {
      setUploadingVideo(false);
    }
  };

  return (
    <>
      {/* admin bar */}
      <div className="sticky top-14 z-30 border-b border-amber-200/60 bg-amber-50/95 backdrop-blur-sm">
        <div className="page-shell-inline flex items-center justify-between gap-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
            Режим адміна
          </span>
          <div className="flex items-center gap-2">
            {error && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                <AlertCircle size={12} /> {error}
              </span>
            )}
            <button
              onClick={() => { setShowEdit(true); setError(""); }}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-sky-200 bg-white px-3 py-1.5 text-[12px] font-bold text-sky-700 transition hover:bg-sky-50"
            >
              <Pencil size={12} strokeWidth={2.2} /> Редагувати
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} strokeWidth={2} />}
              Видалити
            </button>
          </div>
        </div>
      </div>

      {/* edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[16px] border border-white/80 bg-white shadow-[0_32px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-[15px] font-black tracking-tight text-slate-900">Редагування статті</h2>
              <button
                onClick={() => setShowEdit(false)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {error && (
                <div className="flex items-center gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700">
                  <AlertCircle size={13} /> {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Заголовок</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13.5px] font-semibold text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  maxLength={140}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Короткий опис</label>
                <textarea
                  value={form.excerpt}
                  onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))}
                  className="w-full resize-y rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  rows={3}
                  maxLength={320}
                />
                <p className={`mt-0.5 text-right text-[11px] ${form.excerpt.trim().length < 20 && form.excerpt.length > 0 ? "text-amber-500" : "text-slate-400"}`}>
                  {form.excerpt.trim().length} / 20 мін
                </p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Текст статті</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  className="w-full resize-y rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] leading-6 text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  rows={10}
                />
                <p className={`mt-0.5 text-right text-[11px] ${form.content.trim().length < 80 && form.content.length > 0 ? "text-amber-500" : "text-slate-400"}`}>
                  {form.content.trim().length} / 80 мін · 24 000 макс
                </p>
              </div>

              {/* main image */}
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Основне фото</label>
                <label className="relative flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-sky-200 bg-sky-50/60 transition hover:border-sky-400">
                  {form.imageDataUrl ? (
                    <Image
                      src={form.imageDataUrl}
                      alt="preview"
                      width={400}
                      height={112}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-sky-600">
                      <ImagePlus size={20} />
                      <span className="text-[11px] font-semibold">Додати фото (до {formatMb(MAX_BLOG_IMAGE_BYTES)})</span>
                    </span>
                  )}
                  {uploadingImage && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/80">
                      <Loader2 className="h-5 w-5 animate-spin text-sky-600" aria-hidden="true" />
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    disabled={uploadingImage}
                    onChange={(e) => { void handleImageFile(e.target.files?.[0], "main"); e.target.value = ""; }}
                  />
                </label>
                {form.imageDataUrl && (
                  <button
                    type="button"
                    onClick={() => { setImageChanged(true); setForm((p) => ({ ...p, imageDataUrl: "" })); }}
                    className="mt-1.5 text-[11px] font-semibold text-rose-500 hover:text-rose-700"
                  >
                    Прибрати фото
                  </button>
                )}
              </div>

              {/* extra images */}
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Додаткові фото (до 6)</label>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="relative aspect-square">
                      {form.extraImages[i] ? (
                        <>
                          <Image
                            src={form.extraImages[i]}
                            alt={`extra-${i}`}
                            width={80}
                            height={80}
                            unoptimized
                            className="h-full w-full rounded-[8px] object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setExtraImagesChanged(true);
                              setForm((p) => {
                                const imgs = [...p.extraImages];
                                imgs.splice(i, 1);
                                return { ...p, extraImages: imgs };
                              });
                            }}
                            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow"
                          >
                            <X size={9} strokeWidth={2.5} />
                          </button>
                        </>
                      ) : (
                        <label className="relative flex h-full w-full cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-slate-200 bg-slate-50 transition hover:border-sky-300 hover:bg-sky-50">
                          {uploadingExtraIndex === i ? (
                            <Loader2 size={14} className="animate-spin text-sky-500" />
                          ) : (
                            <Plus size={14} className="text-slate-400" />
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            disabled={uploadingExtraIndex !== null}
                            onChange={(e) => { void handleImageFile(e.target.files?.[0], i); e.target.value = ""; }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Alt-текст основного фото</label>
                <input
                  value={form.imageAlt}
                  onChange={(e) => setForm((p) => ({ ...p, imageAlt: e.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  maxLength={160}
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <Video size={11} strokeWidth={2.2} /> Відео
                </label>
                <input
                  value={form.videoUrl}
                  onChange={(e) => setForm((p) => ({ ...p, videoUrl: e.target.value }))}
                  placeholder="Посилання YouTube / Vimeo"
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  maxLength={300}
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-px flex-1 bg-slate-100" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">або</span>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>
                <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-[12.5px] font-bold text-sky-700 transition hover:border-sky-400">
                  {uploadingVideo ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <FileVideo size={14} aria-hidden="true" />
                  )}
                  {uploadingVideo ? "Завантаження..." : `Завантажити файл (до ${formatMb(MAX_BLOG_VIDEO_BYTES)})`}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    className="sr-only"
                    disabled={uploadingVideo}
                    onChange={(e) => { void handleVideoFile(e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
                {form.videoUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, videoUrl: "" }))}
                    className="mt-1 text-[11px] font-semibold text-rose-500 hover:text-rose-700"
                  >
                    Прибрати відео
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setShowEdit(false)}
                className="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Скасувати
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(14,165,233,0.30)] transition hover:brightness-105 disabled:opacity-70"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? "Збереження…" : "Зберегти"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
