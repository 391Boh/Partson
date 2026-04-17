import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Стан сервісу PartsON",
  description: "Службова сторінка перевірки доступності сайту PartsON.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function HealthPage() {
  return (
    <main>
      <h1 className="sr-only">Стан сервісу PartsON</h1>
      <div>ok</div>
    </main>
  );
}
