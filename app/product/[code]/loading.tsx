// Instant frame while a product page renders on the server: the same card,
// breadcrumb row, photo and buy column as the real page, so moving from the
// catalog, a group or a producer page shows a stable layout at once instead
// of the previous page frozen until the HTML arrives. Its classes are part of
// the product critical CSS (CRITICAL_TARGETS.product).
export default function Loading() {
  const bar = "block rounded-full bg-slate-200/80";
  return (
    <div className="product-page min-h-screen text-slate-900" aria-busy="true">
      <div role="status" className="sr-only">Завантаження товару</div>
      <div className="page-shell-inline py-2.5 sm:py-4" aria-hidden="true">
        <div className="overflow-clip rounded-[24px] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)] motion-safe:animate-pulse sm:rounded-[32px]">
          <div className="border-b border-slate-200/80 px-3 pb-4 pt-3 sm:px-5 sm:pb-6 sm:pt-4 lg:px-7 lg:pb-7">
            <div className="flex items-center gap-2 pb-4">
              <span className={`${bar} h-3 w-16`} />
              <span className={`${bar} h-3 w-24`} />
              <span className={`${bar} h-3 w-32`} />
            </div>
            {/* Photo, identity, price card: the real hero's three columns. */}
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)] lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.35fr)_minmax(250px,0.75fr)] lg:gap-5">
              <div className="aspect-square w-full rounded-[18px] bg-slate-100" />
              <div className="flex flex-col gap-3 pt-1">
                <span className={`${bar} h-3 w-32`} />
                <span className={`${bar} h-7 w-[88%]`} />
                <span className={`${bar} h-7 w-[60%]`} />
                <span className={`${bar} mt-3 h-3.5 w-[80%]`} />
                <span className={`${bar} h-3.5 w-[65%]`} />
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <span className="block h-10 rounded-[12px] bg-slate-100" />
                  <span className="block h-10 rounded-[12px] bg-slate-100" />
                  <span className="block h-10 rounded-[12px] bg-slate-100" />
                </div>
              </div>
              <div className="flex flex-col items-center gap-3 rounded-[18px] border border-slate-200/80 bg-slate-50/60 p-4 md:col-span-2 lg:col-span-1">
                <span className={`${bar} h-3 w-24`} />
                <span className={`${bar} h-8 w-32`} />
                <span className="block h-12 w-full rounded-[12px] bg-slate-100" />
                <span className="mt-1 block h-11 w-full rounded-[12px] bg-slate-200/90" />
              </div>
            </div>
          </div>
          <div className="grid gap-3 px-3 py-5 sm:px-5 lg:px-7">
            <span className={`${bar} h-5 w-48`} />
            <span className={`${bar} h-3.5 w-full`} />
            <span className={`${bar} h-3.5 w-[90%]`} />
          </div>
        </div>
      </div>
    </div>
  );
}
