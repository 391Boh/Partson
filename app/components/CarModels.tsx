"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";

interface Props {
  selectedBrand: string;
  onModelSelect: (model: string) => void;
  onBack?: () => void; // <- зроблено опціональним
}

interface CarModelResponseItem {
  МаркаАвтомобиля: string;
  МодельАвтомобиля: string;
  Обьем?: string;
  КП?: string;
  Привід?: string;
  РікВипуску?: number;
  РікКінця?: number;
}

const CarModels: React.FC<Props> = ({ selectedBrand, onModelSelect, onBack }) => {
  const [allModels, setAllModels] = useState<CarModelResponseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: "-100px" });

  useEffect(() => {
    if (!selectedBrand) {
      setAllModels([]);
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedModel(null);
    setSearchTerm("");

    fetch(`/api/proxy?endpoint=getauto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ МаркаАвтомобиля: selectedBrand }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Помилка при завантаженні моделей");
        const jsonText = await res.text();
        const data = JSON.parse(jsonText);
        if (!Array.isArray(data)) throw new Error("Невалідний формат відповіді");
        setAllModels(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedBrand]);

  const filteredModels = useMemo(() => {
    const uniqueModels = Array.from(
      new Set(allModels.map((item) => item.МодельАвтомобиля))
    ).filter(Boolean) as string[];
    return uniqueModels.filter((model) =>
      model.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allModels, searchTerm]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="w-full mx-auto px-2 sm:px-4 py-6"
    >
      {/* Заголовок + пошук в один рядок (компактно) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Оберіть модель{" "}
            <span className="text-blue-600 font-semibold">{selectedBrand}</span>
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Виберіть з переліку або скористайтесь пошуком
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Поле пошуку компактне */}
          <input
            type="text"
            placeholder="Пошук моделі..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-144 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm sm:text-base transition"
          />

          {/* Якщо батько передав onBack — показуємо кнопку повернення */}
        
        </div>
      </div>

      {/* Список моделей (відображення в три ряди як раніше) */}
      <div className="overflow-x-auto py-2 p-10">
        {loading && (
          <motion.div
            className="flex justify-center items-center py-6"
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <div className="loader" />
          </motion.div>
        )}

        {error && <p className="text-red-600 font-semibold">{error}</p>}

        {!loading && !error && (
          <div
            className="grid grid-flow-col auto-cols-[minmax(280px,1fr)] gap-6 pb-4"
            style={{ gridTemplateRows: "repeat(3, auto)" }}
          >
            {filteredModels.length === 0 && (
              <p className="text-gray-500 text-center w-full">Моделі не знайдено.</p>
            )}

            {filteredModels.map((model, idx) => (
              <motion.button
                key={model}
                onClick={() => {
                  setSelectedModel(model);
                  onModelSelect(model);
                }}
                title={model}
                initial={{ opacity: 0, y: 10 }}
                animate={
                  isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
                }
                transition={{ delay: idx * 0.03 }}
                className={`whitespace-nowrap px-6 py-4 min-w-[280px] max-w-[340px] text-left rounded-xl shadow hover:scale-105 transition-transform duration-200 ${
                  selectedModel === model
                    ? "bg-blue-600 text-white"
                    : "bg-blue-200 text-gray-800 hover:bg-blue-300"
                }`}
                style={{ gridRow: (idx % 3) + 1 }}
              >
                {model}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CarModels;
