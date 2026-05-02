import Link from "next/link";

import { buildPageMetadata } from "app/lib/seo-metadata";

export const metadata = buildPageMetadata({
  title: "Оплату отримано",
  description:
    "Сторінка підтвердження успішної онлайн-оплати замовлення в магазині автозапчастин PartsON.",
  canonicalPath: "/success",
  keywords: ["успішна оплата", "LiqPay", "оплата замовлення"],
  index: false,
});

export default function PaymentSuccessPage() {
  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-3xl items-center px-4 py-12 sm:px-6">
      <section className="soft-surface-card w-full rounded-[24px] px-6 py-8 text-center text-slate-700 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:px-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-3xl">
          Оплату отримано
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
          Якщо оплата пройшла успішно, замовлення має бути підтверджене автоматично. Якщо
          оформлення не завершилось або щось виглядає некоректно, зв&apos;яжіться з нами і ми
          швидко перевіримо статус платежу вручну.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/katalog" className="soft-primary-button px-5 py-3 text-sm font-semibold">
            Повернутися в каталог
          </Link>
          <Link href="/inform/payment" className="soft-secondary-button px-5 py-3 text-sm font-semibold">
            Інформація про оплату
          </Link>
        </div>
      </section>
    </main>
  );
}
