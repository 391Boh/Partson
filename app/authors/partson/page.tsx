import Link from "next/link";
import { BadgeCheck, MapPin, Phone, ShieldCheck } from "lucide-react";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { buildPageMetadata } from "app/lib/seo-metadata";

export const metadata = buildPageMetadata({
  title: "Редакція PartsON — автори та експерти",
  description: "Про редакцію PartsON, практичний досвід команди, принципи підготовки й перевірки матеріалів про автозапчастини.",
  canonicalPath: "/authors/partson",
  keywords: ["редакція PartsON", "автори PartsON", "експерти з автозапчастин"],
});

export default function PartsOnAuthorPage() {
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/authors/partson#author`,
    name: "Редакція PartsON",
    url: `${siteUrl}/authors/partson`,
    parentOrganization: { "@id": `${siteUrl}#organization` },
    description: "Команда PartsON готує та перевіряє матеріали на основі практичного досвіду підбору автозапчастин, OEM-кодів і VIN-сумісності.",
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-10 sm:py-16">
      <article className="page-shell-inline max-w-4xl">
        <div className="rounded-[26px] border border-sky-100 bg-white p-5 shadow-[0_20px_55px_rgba(15,78,130,0.10)] sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Автор матеріалів</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Редакція PartsON</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">Команда магазину автозапчастин PartsON у Львові. Ми щодня працюємо з каталогами виробників, OEM-артикулами, аналогами та запитами на підбір деталей за VIN.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-sky-50 p-4"><BadgeCheck className="text-sky-700" /><h2 className="mt-2 font-black">Практична експертиза</h2><p className="mt-1 text-sm leading-6 text-slate-600">Понад 20 років досвіду в продажі та підборі деталей для ремонту й технічного обслуговування авто.</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><ShieldCheck className="text-sky-700" /><h2 className="mt-2 font-black">Перевірка інформації</h2><p className="mt-1 text-sm leading-6 text-slate-600">Технічні твердження звіряємо з документацією виробників, каталогами та практикою сумісності.</p></div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold">
            <Link href="/blog" className="rounded-xl bg-sky-700 px-4 py-2.5 text-white">Статті редакції</Link>
            <Link href="/editorial-policy" className="rounded-xl border border-sky-200 px-4 py-2.5 text-sky-800">Редакційна політика</Link>
            <a href="tel:+380634211851" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5"><Phone size={15} /> +38 (063) 421-18-51</a>
            <Link href="/inform/location" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5"><MapPin size={15} /> Львів, вул. Перфецького, 8</Link>
          </div>
        </div>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
    </main>
  );
}
