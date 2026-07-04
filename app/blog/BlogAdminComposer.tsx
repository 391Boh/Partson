"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImagePlus, Loader2, PenLine, Plus, Send, Video, X } from "lucide-react";

import { auth } from "../../firebase";

type SubmitState =
  | { status: "idle"; message: "" }
  | { status: "loading"; message: string }
  | { status: "success"; message: string; path: string }
  | { status: "error"; message: string };

const initialState = {
  title: "",
  excerpt: "",
  content: "",
  imageAlt: "",
  imageDataUrl: "",
  extraImages: [] as string[],
  videoUrl: "",
};

const MAX_IMAGE_BYTES = 650 * 1024;

export default function BlogAdminComposer() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(initialState);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    const readAdminState = () => {
      const uid = localStorage.getItem("user_id");
      setIsAdmin(Boolean(uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1"));
    };

    readAdminState();
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ isAdmin?: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handler);
    window.addEventListener("storage", readAdminState);
    return () => {
      window.removeEventListener("partson:adminStateChange", handler);
      window.removeEventListener("storage", readAdminState);
    };
  }, []);

  if (!isAdmin) return null;

  const updateField = (field: keyof Omit<typeof initialState, "extraImages" | "videoUrl"> | "videoUrl", value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (submitState.status !== "idle") setSubmitState({ status: "idle", message: "" });
  };

  const handleExtraImageFile = (file: File | undefined, index: number) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSubmitState({ status: "error", message: "Оберіть файл зображення." });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setSubmitState({ status: "error", message: "Зображення завелике. Оптимально до 650 KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => {
        const imgs = [...prev.extraImages];
        imgs[index] = result;
        return { ...prev, extraImages: imgs };
      });
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSubmitState({ status: "error", message: "Оберіть файл зображення." });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setSubmitState({
        status: "error",
        message: "Зображення завелике. Оптимально до 650 KB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateField("imageDataUrl", typeof reader.result === "string" ? reader.result : "");
      if (!form.imageAlt) updateField("imageAlt", form.title || file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      setSubmitState({ status: "error", message: "Увійдіть як адміністратор." });
      return;
    }

    if (form.title.trim().length < 4) {
      setSubmitState({ status: "error", message: "Заголовок надто короткий (мін. 4 символи)." });
      return;
    }
    if (form.excerpt.trim().length < 20) {
      setSubmitState({ status: "error", message: `Короткий опис надто короткий — потрібно мін. 20 символів (зараз ${form.excerpt.trim().length}).` });
      return;
    }
    if (form.content.trim().length < 80) {
      setSubmitState({ status: "error", message: `Текст статті надто короткий — потрібно мін. 80 символів (зараз ${form.content.trim().length}).` });
      return;
    }

    setSubmitState({ status: "loading", message: "Публікуємо статтю..." });
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/blog/posts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        path?: string;
      };

      if (!response.ok || !payload.ok || !payload.path) {
        throw new Error(payload.error || "Не вдалося опублікувати статтю.");
      }

      setForm(initialState);
      setSubmitState({
        status: "success",
        message: "Статтю опубліковано.",
        path: payload.path,
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "Не вдалося опублікувати статтю.",
      });
    }
  };

  return (
    <section className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_12%_0%,rgba(14,165,233,0.16),transparent_32%),linear-gradient(180deg,#f8fafc,#eef6fb)]">
      <div className="page-shell-inline py-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-all duration-200 ${
              isOpen
                ? "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-600"
                : "border-sky-300/60 bg-sky-500 text-white shadow-[0_3px_12px_rgba(14,116,144,0.22)] hover:bg-sky-600"
            }`}
          >
            {isOpen ? (
              <X className="h-3 w-3" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            {isOpen ? "Закрити" : "Нова стаття"}
          </button>
        </div>

        {isOpen && <form
          onSubmit={handleSubmit}
          className="mt-3 grid gap-4 rounded-[8px] border border-slate-200/90 bg-white/88 p-4 shadow-[0_16px_42px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-slate-950 text-sky-100">
                <PenLine className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-black uppercase tracking-[0.12em]">
                  Нова стаття
                </h2>
                <p className="text-xs font-semibold text-slate-500">
                  Адмін-публікація одразу створює окрему SEO-сторінку.
                </p>
              </div>
            </div>

            <input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Заголовок статті"
              className="w-full rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              maxLength={140}
              required
            />
            <div>
              <textarea
                value={form.excerpt}
                onChange={(event) => updateField("excerpt", event.target.value)}
                placeholder="Короткий опис для картки, SEO та соцмереж"
                className={`min-h-[72px] w-full resize-y rounded-[8px] border bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:ring-2 focus:ring-sky-100 ${form.excerpt.length > 0 && form.excerpt.trim().length < 20 ? "border-amber-300 focus:border-amber-400" : "border-slate-200 focus:border-sky-300"}`}
                maxLength={320}
                required
              />
              <p className={`mt-0.5 text-right text-[11px] font-medium ${form.excerpt.trim().length < 20 && form.excerpt.length > 0 ? "text-amber-500" : "text-slate-400"}`}>
                {form.excerpt.trim().length} / 20 мін · 320 макс
              </p>
            </div>
            <div>
              <textarea
                value={form.content}
                onChange={(event) => updateField("content", event.target.value)}
                placeholder="Текст статті. Абзаци розділяйте новим рядком."
                className={`min-h-[220px] w-full resize-y rounded-[8px] border bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none transition focus:ring-2 focus:ring-sky-100 ${form.content.length > 0 && form.content.trim().length < 80 ? "border-amber-300 focus:border-amber-400" : "border-slate-200 focus:border-sky-300"}`}
                required
              />
              <p className={`mt-0.5 text-right text-[11px] font-medium ${form.content.trim().length < 80 && form.content.length > 0 ? "text-amber-500" : "text-slate-400"}`}>
                {form.content.trim().length} / 80 мін · 24 000 макс
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="group flex min-h-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[8px] border border-dashed border-sky-200 bg-sky-50/70 text-center transition hover:border-sky-400 hover:bg-sky-50">
              {form.imageDataUrl ? (
                <Image
                  src={form.imageDataUrl}
                  alt={form.imageAlt || form.title || "Зображення статті"}
                  width={720}
                  height={420}
                  unoptimized
                  className="h-full max-h-[260px] w-full object-cover"
                />
              ) : (
                <span className="flex flex-col items-center gap-3 px-4 text-slate-600">
                  <ImagePlus className="h-7 w-7 text-sky-600" aria-hidden="true" />
                  <span className="text-sm font-bold">Додати зображення</span>
                  <span className="text-xs">JPG, PNG, WebP або GIF до 650 KB</span>
                </span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => handleImageChange(event.target.files?.[0])}
              />
            </label>

            {form.imageDataUrl && (
              <button
                type="button"
                onClick={() => updateField("imageDataUrl", "")}
                className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-600 transition hover:border-rose-200 hover:text-rose-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Прибрати зображення
              </button>
            )}

            {/* extra images */}
            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Додаткові фото (до 6)
              </p>
              <div className="grid grid-cols-6 gap-1.5">
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
                          className="h-full w-full rounded-[6px] object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => {
                              const imgs = [...prev.extraImages];
                              imgs.splice(i, 1);
                              return { ...prev, extraImages: imgs };
                            })
                          }
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow"
                        >
                          <X size={8} strokeWidth={2.5} />
                        </button>
                      </>
                    ) : (
                      <label className="flex h-full w-full cursor-pointer items-center justify-center rounded-[6px] border border-dashed border-slate-200 bg-slate-50 transition hover:border-sky-300 hover:bg-sky-50">
                        <Plus size={12} className="text-slate-400" />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          onChange={(e) => handleExtraImageFile(e.target.files?.[0], i)}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <input
              value={form.imageAlt}
              onChange={(event) => updateField("imageAlt", event.target.value)}
              placeholder="Alt-текст зображення"
              className="w-full rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              maxLength={160}
            />

            <div className="relative">
              <Video className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={form.videoUrl}
                onChange={(event) => updateField("videoUrl", event.target.value)}
                placeholder="Відео YouTube / Vimeo (необов'язково)"
                className="w-full rounded-[8px] border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                maxLength={300}
              />
            </div>

            <button
              type="submit"
              disabled={submitState.status === "loading"}
              className="mt-auto inline-flex items-center justify-center gap-2 rounded-[8px] border border-sky-300/70 bg-[linear-gradient(135deg,#082f49,#0369a1_52%,#0284c7)] px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_14px_30px_rgba(14,116,144,0.24),inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(14,116,144,0.3),inset_0_1px_0_rgba(255,255,255,0.22)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitState.status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Опублікувати
            </button>

            {submitState.message && (
              <p
                className={`rounded-[8px] border px-3 py-2 text-sm font-semibold ${
                  submitState.status === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {submitState.message}
                {submitState.status === "success" && (
                  <>
                    {" "}
                    <Link href={submitState.path} className="underline">
                      Відкрити
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </form>}
      </div>
    </section>
  );
}
