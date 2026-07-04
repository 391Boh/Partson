export default function Loading() {
  return (
    <div
      className="home-static min-h-screen overflow-hidden"
      role="status"
      aria-label="Завантаження..."
      style={{
        background:
          "radial-gradient(ellipse 148% 86% at 7% 4%,rgba(56,189,248,0.34) 0%,rgba(56,189,248,0.10) 38%,rgba(56,189,248,0.02) 58%,transparent 72%),radial-gradient(ellipse 98% 70% at 95% 4%,rgba(37,99,235,0.20) 0%,rgba(37,99,235,0.05) 40%,transparent 66%),linear-gradient(180deg,rgba(2,6,23,1) 0%,rgba(5,11,36,0.97) 10%,rgba(9,18,54,0.94) 20%,rgba(13,26,72,0.88) 30%,rgba(17,35,92,0.82) 40%,rgba(20,42,110,0.78) 50%,rgba(18,40,104,0.74) 60%,rgba(16,34,90,0.68) 70%,rgba(14,30,80,0.60) 80%,rgba(12,26,72,0.52) 90%,rgba(10,22,64,0.44) 100%)",
      }}
    >
      <span className="sr-only">Завантаження...</span>
    </div>
  );
}
