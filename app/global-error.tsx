"use client";

// This replaces the ENTIRE root layout (including <html>/<body>) when the
// root layout itself throws, so it can't rely on globals.css being loaded —
// that stylesheet is applied by a script that lives inside the layout this
// file bypasses. Inline styles only, kept minimal on purpose.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#0f172a",
          color: "#f8fafc",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
            Сайт тимчасово недоступний
          </h1>
          <p style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 20, lineHeight: 1.6 }}>
            Сталася критична помилка. Спробуйте оновити сторінку за кілька
            хвилин.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "10px 22px",
              borderRadius: 12,
              border: "1px solid #38bdf8",
              background: "#0ea5e9",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Спробувати ще раз
          </button>
        </div>
      </body>
    </html>
  );
}
