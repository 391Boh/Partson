import Link from "next/link";
import { buildPageMetadata } from "app/lib/seo-metadata";

export const metadata = buildPageMetadata({
  title: "Редакційна політика PartsON",
  description: "Принципи підготовки, експертної перевірки, оновлення та виправлення матеріалів у блозі PartsON.",
  canonicalPath: "/editorial-policy",
  keywords: ["редакційна політика PartsON", "перевірка матеріалів PartsON"],
});

export default function EditorialPolicyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-10 sm:py-16">
      <article className="page-shell-inline max-w-4xl rounded-[26px] border border-sky-100 bg-white p-5 shadow-[0_20px_55px_rgba(15,78,130,0.09)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Довіра та прозорість</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Редакційна політика PartsON</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">Матеріали готує редакція PartsON на основі практичного досвіду підбору автозапчастин. Наша мета — дати зрозумілу, точну й корисну інформацію без прихованої реклами.</p>
        <div className="mt-7 space-y-6 text-[15px] leading-7 text-slate-700">
          <section><h2 className="text-xl font-black text-slate-950">Джерела та перевірка</h2><p className="mt-1">Технічні характеристики й рекомендації звіряємо з каталогами та документацією виробників, офіційними нормами й практикою підбору за OEM-кодом або VIN. Посилання на зовнішні першоджерела додаємо там, де вони допомагають перевірити твердження.</p></section>
          <section><h2 className="text-xl font-black text-slate-950">Авторство й дати</h2><p className="mt-1">Кожна стаття містить автора, дату публікації та дату останнього оновлення. Відповідальність за редакційну перевірку несе <Link href="/authors/partson" className="font-bold text-sky-700 underline">редакція PartsON</Link>.</p></section>
          <section><h2 className="text-xl font-black text-slate-950">Виправлення</h2><p className="mt-1">Якщо інформація змінилася або знайдено неточність, матеріал редагується, а дата оновлення змінюється. Повідомити про помилку можна телефоном +38 (063) 421-18-51 або через <Link href="/inform/location" className="font-bold text-sky-700 underline">сторінку контактів</Link>.</p></section>
          <section><h2 className="text-xl font-black text-slate-950">Комерційна прозорість</h2><p className="mt-1">PartsON продає автозапчастини, тому статті можуть містити посилання на власний каталог. Ми не маскуємо такі посилання під незалежні огляди. Платні, партнерські або рекламні матеріали, якщо вони з’являться, будуть прямо позначені.</p></section>
        </div>
        <p className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-500">Політику востаннє оновлено: <time dateTime="2026-08-14">14 серпня 2026 року</time>.</p>
      </article>
    </main>
  );
}
