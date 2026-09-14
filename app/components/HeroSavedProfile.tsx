"use client";

import { Car, Trash2, Truck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type HeroSavedProfileProps = {
  profile: {
    cars: string[];
    vins: string[];
    selectionLabel: string | null;
    delivery: { method: string; detail: string | null } | null;
  };
  onOpenCatalogForCars: () => void;
  onOpenDeliverySettings: () => void;
  onDeleteCar: (label: string) => Promise<void>;
  onDeleteVin: (vin: string) => Promise<void>;
};

// Motion is only needed once an authenticated profile is available. Keeping
// these animated rows in their own module avoids loading the animation engine
// for the guest hero while preserving live add/remove/reorder transitions.
export default function HeroSavedProfile({
  profile,
  onOpenCatalogForCars,
  onOpenDeliverySettings,
  onDeleteCar,
  onDeleteVin,
}: HeroSavedProfileProps) {
  const shouldAnimate = !useReducedMotion();

  return (
    <>
            {/* Saved cars — mirrors the VIN chips right below. Each chip
                jumps to the catalog, which reads the very same stored car
                and opens already filtered by it; the trash icon clears it
                from Firestore + localStorage in one go. The whole row (and
                each chip inside it) animates in/out instead of popping —
                the live profile subscription can add/remove a chip at any
                moment now, not just once on first load. */}
            <AnimatePresence initial={false}>
              {profile && profile.cars.length > 0 && (
                <motion.div
                  key="cars-row"
                  initial={shouldAnimate ? { opacity: 0, height: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1, height: "auto" } : undefined}
                  exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
                  transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                  className="flex w-full flex-wrap items-center justify-center gap-1.5 overflow-hidden"
                  aria-label="Збережені автомобілі"
                >
                  <AnimatePresence initial={false}>
                    {profile.cars.map((label) => {
                      const isActive = profile.selectionLabel === label;
                      return (
                        <motion.span
                          key={label}
                          layout={shouldAnimate}
                          initial={shouldAnimate ? { opacity: 0, scale: 0.85 } : false}
                          animate={shouldAnimate ? { opacity: 1, scale: 1 } : undefined}
                          exit={shouldAnimate ? { opacity: 0, scale: 0.85 } : undefined}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                          className={`group/car inline-flex max-w-full items-center gap-1.5 rounded-full border py-1.5 pl-1 pr-1 text-[11px] font-bold tracking-[0.01em] text-white shadow-[0_2px_8px_rgba(2,132,199,0.24)] [text-shadow:0_1px_2px_rgba(2,6,23,0.6)] ${
                            isActive
                              ? "border-teal-300/50 bg-[image:linear-gradient(135deg,rgba(13,148,136,0.9)_0%,rgba(14,165,233,0.7)_100%)]"
                              : "border-sky-300/35 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.85)_0%,rgba(14,165,233,0.65)_100%)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={onOpenCatalogForCars}
                            aria-label={`Відкрити каталог для ${label}`}
                            className="inline-flex min-w-0 items-center gap-1.5 rounded-full pl-2 pr-1 transition-transform duration-200 group-hover/car:scale-[1.02]"
                          >
                            <Car className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                            <span className="truncate">{label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCar(label)}
                            aria-label={`Видалити авто ${label}`}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sky-100/70 transition-colors duration-150 hover:bg-rose-500/40 hover:text-rose-50"
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                          </button>
                        </motion.span>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Only appears once the profile fetch resolves with saved
                VINs — before that (or for a user with none) nothing renders
                here. No IdCard icon here (the button right above already
                carries one) — same sky-gradient family as vinButton
                instead, just scaled down, plus a trash icon to delete each
                one inline. */}
            <AnimatePresence initial={false}>
              {profile && profile.vins.length > 0 && (
                <motion.div
                  key="vins-row"
                  initial={shouldAnimate ? { opacity: 0, height: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1, height: "auto" } : undefined}
                  exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
                  transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                  className="flex w-full flex-wrap items-center justify-center gap-1.5 overflow-hidden"
                  aria-label="Збережені VIN-коди"
                >
                  <AnimatePresence initial={false}>
                    {profile.vins.map((vin) => (
                      <motion.span
                        key={vin}
                        layout={shouldAnimate}
                        initial={shouldAnimate ? { opacity: 0, scale: 0.85 } : false}
                        animate={shouldAnimate ? { opacity: 1, scale: 1 } : undefined}
                        exit={shouldAnimate ? { opacity: 0, scale: 0.85 } : undefined}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="group/vin inline-flex items-center gap-1.5 rounded-full border border-sky-300/45 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.94)_0%,rgba(14,165,233,0.78)_100%)] py-1.5 pl-3 pr-1 font-mono text-[11px] font-bold tracking-[0.04em] text-white shadow-[0_2px_8px_rgba(2,132,199,0.3)] [text-shadow:0_1px_2px_rgba(2,6,23,0.7)]"
                      >
                        {vin}
                        <button
                          type="button"
                          onClick={() => onDeleteVin(vin)}
                          aria-label={`Видалити VIN ${vin}`}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sky-100/70 transition-colors duration-150 hover:bg-rose-500/40 hover:text-rose-50"
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Saved delivery address — read from the same users/{uid} fields
                the partnership page writes and the checkout auto-fills. One
                chip, tap opens the delivery editor on /partnership. */}
            <AnimatePresence initial={false}>
              {profile?.delivery && (
                <motion.div
                  key="delivery-row"
                  initial={shouldAnimate ? { opacity: 0, height: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1, height: "auto" } : undefined}
                  exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
                  transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                  className="flex w-full flex-wrap items-center justify-center gap-1.5 overflow-hidden"
                  aria-label="Збережена доставка"
                >
                  <button
                    type="button"
                    onClick={onOpenDeliverySettings}
                    aria-label="Змінити спосіб доставки"
                    className="group/delivery inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-300/45 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.94)_0%,rgba(14,165,233,0.78)_100%)] py-1.5 pl-3 pr-3 text-[11px] font-bold tracking-[0.01em] text-white shadow-[0_2px_8px_rgba(2,132,199,0.3)] transition-transform duration-200 [text-shadow:0_1px_2px_rgba(2,6,23,0.7)] hover:scale-[1.02]"
                  >
                    <Truck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span className="truncate">
                      {profile.delivery.method}
                      {profile.delivery.detail ? ` · ${profile.delivery.detail}` : ""}
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
    </>
  );
}
