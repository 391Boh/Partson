"use client";

import { useEffect, useState, useCallback } from "react";
import ProductShowcase from "./tovar";

export type ProductNode = {
  name: string;
  children?: ProductNode[];
};

let cachedData: ProductNode[] | null = null;

export default function ProductFetcher() {
  const [treeData, setTreeData] = useState<ProductNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // 🔁 Рекурсивне перетворення структури 1С → ProductNode
  const transformNode = useCallback((node: any): ProductNode => ({
    name: node?.Наименование ?? "Без назви",
    children: Array.isArray(node?.ДочерніЕлементи)
      ? node.ДочерніЕлементи.map(transformNode)
      : [],
  }), []);

  const transformData = useCallback((rawData: any[]): ProductNode[] => {
    if (!Array.isArray(rawData)) return [];
    return rawData.map(transformNode);
  }, [transformNode]);

  const fetchData = useCallback(async () => {
    if (cachedData) {
      console.log("📦 Використовую кешовані дані");
      setTreeData(cachedData);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proxy?endpoint=getprod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const raw = await response.json();
      console.log("📦 Отримано:", raw);

      const transformed = transformData(raw);
      cachedData = transformed;
      setTreeData(transformed);
    } catch (err: any) {
      console.error("❌ Помилка завантаження:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [transformData]);

  useEffect(() => { fetchData(); }, [fetchData]);

if (loading)
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <div className="loader mb-4"></div>
      <p className="text-gray-500">Завантаження...</p>
    </div>
  );


  if (error)
    return <div className="text-center text-red-600 p-6">Помилка: {error}</div>;

  if (!treeData.length)
    return <div className="text-center p-6">Дані відсутні</div>;

  return <ProductShowcase products={treeData} />;
}
