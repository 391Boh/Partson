"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export type ProductNode = {
  name: string;
  children?: ProductNode[];
};

const categoryIconMap: Record<string, string> = {
  "Паливна система": "palivna_systema.png",
  "Гальмівна система": "halmivna_systema.png",
  "Деталі двигуна": "detali_dvyhuna.png",
  "Деталі підвіски": "detali_pidvisky.png",
  "Амортизація": "amort.png",
  "Деталі для ТО": "detali_dlia_to.png",
  "Привід та коробка передач": "pryvid_ta_korobka_peredach.png",
  "Система охолодження": "systema_okholodzhennia.png",
  "Освітлення": "osvitlennia.png",
  "Інше": "inshe.png",
  "Електроніка": "elektronika.png",
  "Кузовні елементи": "kuzovni_elementy.png",
  "Датчики та електроніка": "datchyky_ta_elektronika.png",
  "Рідини та мастила": "ridyny_ta_mastyla.png",
};

function getIconForCategory(name: string) {
  return `/Katlogo/${categoryIconMap[name] || "rul.png"}`;
}

function flattenCategories(products: ProductNode[]) {
  const results: { label: string; query: Record<string, string> }[] = [];
  const traverse = (node: ProductNode, path: string[] = []) => {
    const label = [...path, node.name].join(" > ");
    const query: Record<string, string> = {};
    if (path.length === 0) query.group = node.name;
    else {
      query.group = path[0];
      query.subcategory = node.name;
    }
    results.push({ label, query });
    node.children?.forEach((child) => traverse(child, [...path, node.name]));
  };
  products.forEach((p) => traverse(p));
  return results;
}

// --- Flip Card ---
function FlipCard({
  product,
  isFlipped,
  setFlippedId,
  id,
}: {
  product: ProductNode;
  isFlipped: boolean;
  setFlippedId: (id: number | null) => void;
  id: number;
}) {
  const router = useRouter();
  const [activeGroup, setActiveGroup] = useState<ProductNode | null>(null);
  const [page, setPage] = useState(0);

  const subGroups = product.children ?? [];
  const perPage = 3;
  const totalPages = Math.ceil(subGroups.length / perPage);
  const visible = subGroups.slice(page * perPage, page * perPage + perPage);

  const handleFlip = () => setFlippedId(isFlipped ? null : id);

  return (
    <motion.div
      className="w-[160px] h-[190px] sm:w-[200px] sm:h-[210px] md:w-[260px] md:h-[240px] 
                 cursor-pointer perspective-[1200px] mx-auto mb-4 overflow-visible"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ scale: 1.03 }}
    >
      <motion.div
        className="relative w-full h-full rounded-2xl border border-blue-200 bg-white 
                   transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1 
                   hover:bg-gradient-to-br hover:from-gray-400 hover:to-blue-50"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      >
        {/* FRONT */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center p-3 rounded-2xl
                     bg-gradient-to-br from-white to-blue-50
                     hover:from-blue-100 hover:to-blue-200
                     transition-all duration-400"
          style={{ backfaceVisibility: "hidden" }}
          onClick={handleFlip}
        >
          <motion.div whileHover={{ scale: 1.08 }}>
            <Image
              src={getIconForCategory(product.name)}
              alt={product.name}
              width={90}
              height={100}
              className="object-contain drop-shadow-md"
            />
          </motion.div>
          <h3 className="text-sm sm:text-base md:text-lg font-semibold text-center text-gray-800 mt-2">
            {product.name}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {product.children?.length || 0} груп
          </p>
        </motion.div>

        {/* BACK */}
        <div
          className="absolute inset-0 flex flex-col rounded-2xl text-gray-800 bg-white overflow-hidden"
          style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
        >
          <div className="flex justify-end items-center p-2 bg-blue-100 rounded-t-2xl shadow-sm gap-1">
            {totalPages > 1 && !activeGroup && (
              <button
                onClick={() => setPage((p) => (p + 1) % totalPages)}
                className="px-2 py-1 rounded-md bg-blue-400 text-white hover:bg-blue-300 text-[11px] sm:text-xs transition"
              >
                Більше ›
              </button>
            )}
            <button
              onClick={activeGroup ? () => setActiveGroup(null) : handleFlip}
              className="px-2 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-400 text-[11px] sm:text-xs transition"
            >
              {activeGroup ? "← Назад" : "↩ Назад"}
            </button>
          </div>

          <div className="flex-1 p-2 flex flex-col gap-2 overflow-auto">
            {!activeGroup ? (
              visible.map((g, idx) => (
                <button
                  key={idx}
                  onClick={() =>
                    g.children && g.children.length
                      ? setActiveGroup(g)
                      : router.push(
                          `/katalog?${new URLSearchParams({
                            group: g.name,
                          }).toString()}`
                        )
                  }
                  className="w-full text-left rounded-md py-2 px-3 text-xs sm:text-sm flex justify-between items-center
                             bg-blue-50 hover:bg-gradient-to-r hover:from-blue-100 hover:to-blue-200
                             transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  <span className="truncate">{g.name}</span>
                  {g.children && g.children.length > 0 && (
                    <span className="text-blue-500 text-xs">▼</span>
                  )}
                </button>
              ))
            ) : (
              (activeGroup.children || []).map((s, i) => (
                <button
                  key={i}
                  onClick={() =>
                    router.push(
                      `/katalog?${new URLSearchParams({
                        group: activeGroup.name,
                        subcategory: s.name,
                      }).toString()}`
                    )
                  }
                  className="w-full text-left bg-blue-100 hover:bg-gradient-to-r hover:from-blue-200 hover:to-blue-300 rounded-md py-2 px-3 text-xs sm:text-sm transition shadow-sm hover:shadow-md"
                >
                  {s.name}
                </button>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function ProductShowcase({ products }: { products: ProductNode[] }) {
  const [flippedId, setFlippedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const router = useRouter();
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const lastScrollTime = useRef(0);

  const perPage = 6;
  const totalPages = Math.ceil(products.length / perPage);
  const pages = Array.from({ length: totalPages }, (_, i) =>
    products.slice(i * perPage, (i + 1) * perPage)
  );

  const results = flattenCategories(products).filter((i) =>
    i.label.toLowerCase().includes(search.toLowerCase())
  );

  // --- свайп на телефоні ---
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setPage((p) => (p + 1) % totalPages);
      else setPage((p) => (p - 1 + totalPages) % totalPages);
    }
  };

  // --- стабільний скрол на тачпаді ---
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastScrollTime.current < 400) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) {
      e.preventDefault();
      lastScrollTime.current = now;
      if (e.deltaX > 0) setPage((p) => (p + 1) % totalPages);
      else setPage((p) => (p - 1 + totalPages) % totalPages);
    }
  };

  return (
    <motion.div className="group relative max-w-8xl w-full mx-auto px-4 py-8 overflow-visible">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none blur-[2px]" />

      <div className="flex flex-col md:flex-row gap-6 relative z-10 mr-4">
        {/* === Пошук === */}
        <motion.div
          className="w-full md:w-1/3 bg-white/90 backdrop-blur-md shadow-xl 
                     p-6 rounded-2xl border border-gray-100 mb-6 md:mr-6 ml-3 md:ml-6
                     transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 hover:bg-gradient-to-br hover:from-white hover:to-blue-50"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Пошук запчастин</h2>
              <p className="text-xs text-gray-500 mt-0.5">Знайдіть потрібну деталь</p>
            </div>
          </div>

          <input
            type="text"
            placeholder="Введіть назву..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-xl mb-3 text-sm shadow-sm hover:shadow-md transition hover:border-blue-300"
          />

          <div className="space-y-2 min-h-[120px] flex flex-col justify-center">
            {search && results.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center text-gray-500 py-6 rounded-xl bg-gradient-to-br from-gray-50 to-blue-50 border border-gray-100 shadow-inner"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 9.172a4 4 0 015.656 5.656M12 6v6h6" />
                </svg>
                <p className="text-sm font-medium">Нічого не знайдено</p>
                <p className="text-xs text-gray-400 mt-1">Спробуйте іншу назву або уточніть запит</p>
              </motion.div>
            ) : (
              results.slice(0, 4).map((r, i) => (
                <button
                  key={i}
                  onClick={() => router.push(`/katalog?${new URLSearchParams(r.query).toString()}`)}
                  className="w-full text-left p-3 rounded-lg bg-gray-100 border border-gray-100
                             hover:bg-gradient-to-r hover:from-blue-100 hover:to-blue-200
                             hover:border-blue-300 transition shadow-sm hover:shadow-md text-sm mb-5"
                >
                  {r.label}
                </button>
              ))
            )}
          </div>
        </motion.div>

        {/* === Список === */}
        <div
          className="w-full md:w-2/3 relative overflow-visible"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <motion.div
            key={page}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-2 grid-rows-3 md:grid-cols-3 md:grid-rows-2 gap-4 p-4
                       overflow-y-auto overflow-x-hidden
                       touch-pan-y scroll-smooth
                       scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-transparent"
          >
            {pages[page].map((product, idx) => (
              <div className="overflow-visible" key={product.name + idx}>
                <FlipCard
                  product={product}
                  id={idx + page * perPage}
                  isFlipped={flippedId === idx + page * perPage}
                  setFlippedId={setFlippedId}
                />
              </div>
            ))}
          </motion.div>

          {/* --- Стрілки та крапки --- */}
          {totalPages > 1 && (
            <>
              {/* тільки права стрілка на комп'ютері */}
              <button
                onClick={() => setPage((p) => (p + 1) % totalPages)}
                className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-3
                           bg-blue-500 hover:bg-blue-400 text-white rounded-full
                           w-10 h-10 items-center justify-center shadow-lg
                           transition-all duration-300 hover:scale-110 z-10"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* мобільна версія */}
              <div className="md:hidden flex justify-between items-center px-6 mt-4">
                <button
                  onClick={() => setPage((p) => (p - 1 + totalPages) % totalPages)}
                  className="bg-blue-500 hover:bg-blue-400 text-white rounded-full w-9 h-9 flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="flex space-x-2">
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === page ? "bg-blue-500 scale-125" : "bg-blue-300"
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setPage((p) => (p + 1) % totalPages)}
                  className="bg-blue-500 hover:bg-blue-400 text-white rounded-full w-9 h-9 flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* крапки під списком на комп’ютерах */}
              <div className="hidden md:flex justify-center mt-4 space-x-2">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === page ? "bg-blue-500 scale-125" : "bg-blue-300"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
