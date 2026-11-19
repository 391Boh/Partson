"use client";

import { MapPin } from "lucide-react";
import { useStoreEmbed } from "app/lib/use-store-embed";

type Props = { src: string };

/** Start shortly before the reserved map reaches the screen, independently of scrolling/load. */
export default function StoreLocationMap({ src }: Props) {
  const { frameRef, state, active, attempt, load, retry, onLoad, onError } = useStoreEmbed(src, true);

  return (
    <div className={`home-store-map-frame${state === "ready" ? " is-map-loaded" : ""}`} ref={frameRef} aria-busy={state === "loading"}>
      {state !== "ready" && <div className="home-store-map-status">
        <MapPin size={25} aria-hidden="true" />
        {state === "idle" ? <button type="button" onClick={load}>Показати карту</button> : <p role="status">{state === "error" ? "Не вдалося завантажити карту." : "Завантажуємо карту…"}</p>}
        {state === "error" && <button type="button" onClick={retry}>Спробувати ще раз</button>}
      </div>}
      {active && <iframe key={attempt} src={src} title="Google Maps — магазин PartsON, Львів, Перфецького, 8" loading="eager" onLoad={onLoad} onError={onError} referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}
      <noscript><style>{".home-static .home-store-map-status{display:none}"}</style><iframe src={src} title="Карта магазину PartsON у Львові" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></noscript>
    </div>
  );
}
