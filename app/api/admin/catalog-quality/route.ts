import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import { fetchFullCatalogProducts, getSnapshotPriceLookup, type CatalogProduct } from "app/lib/catalog-server";
import { readFitmentRows } from "app/lib/product-fitment-editor";
import { buildModelVocabulary, isFormattedProductName } from "app/lib/product-name-format";
import { buildProductPath } from "app/lib/product-url";
import { hasPublicCatalogPrice, isPublicCatalogProduct } from "app/lib/public-catalog-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// Per-product attributes the admin can filter on with a 3-way switch
// (any / yes / no). "visible" mirrors isPublicCatalogProduct(): a product
// without a price or a photo is hidden from shoppers, search engines and the
// merchant feed.
const ATTRIBUTES = ["stock", "visible", "price", "photo", "fitment", "description", "renamed"] as const;
type Attribute = (typeof ATTRIBUTES)[number];
type Mode = "any" | "yes" | "no";
type Flags = Record<Attribute, boolean>;

const SORTS = ["quantity", "name", "price", "code", "issues"] as const;
type Sort = (typeof SORTS)[number];

const PAGE_LIMIT = 100;

const readMode = (value: string | null): Mode => (value === "yes" || value === "no" ? value : "any");

const flagsOf = (product: CatalogProduct, vocabulary: Set<string>): Flags => {
  const description = (product.description || "").trim();
  return {
    stock: product.quantity > 0,
    visible: isPublicCatalogProduct(product),
    price: hasPublicCatalogPrice(product),
    photo: product.hasPhoto === true,
    fitment: Boolean(description) && readFitmentRows(description).length > 0,
    description: Boolean(description),
    // "Назва у форматі": part name + car make/model + (article/analogs).
    renamed: isFormattedProductName(product.name, vocabulary),
  };
};

// How many of the "content" attributes are missing — the "most incomplete
// first" sort. Stock and visibility are outcomes, not content.
const missingCount = (flags: Flags) =>
  Number(!flags.price) + Number(!flags.photo) + Number(!flags.fitment) + Number(!flags.description);

// GET ?stock=&visible=&price=&photo=&fitment=&description=&renamed= (any|yes|no)
//     &q=&sort=quantity|name|price|code|issues&dir=asc|desc&offset=
// → matching page + for every attribute the yes/no counts under the *other*
//   active filters (what flipping that switch would show).
export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);
  const rate = checkRateLimit({ req: request, key: "admin-catalog-quality", limit: 90, windowMs: 60_000 });
  if (!rate.ok) return json({ ok: false, error: "Забагато запитів" }, 429);

  try {
    const products = await fetchFullCatalogProducts();
    const vocabulary = buildModelVocabulary(products);
    const params = request.nextUrl.searchParams;
    const modes = Object.fromEntries(ATTRIBUTES.map((key) => [key, readMode(params.get(key))])) as Record<Attribute, Mode>;
    const query = (params.get("q") || "").trim().toLowerCase();
    const sortParam = params.get("sort");
    const sort: Sort = (SORTS as readonly string[]).includes(sortParam || "") ? (sortParam as Sort) : "quantity";
    const dir = params.get("dir") === "asc" ? 1 : -1;
    const offset = Math.max(0, Number(params.get("offset")) || 0);

    const rows = products
      .filter((p) =>
        query ? `${p.code} ${p.article} ${p.name} ${p.producer} ${p.group || ""} ${p.subGroup || ""}`.toLowerCase().includes(query) : true
      )
      .map((product) => ({ product, flags: flagsOf(product, vocabulary) }));

    const passes = (flags: Flags, skip?: Attribute) =>
      ATTRIBUTES.every((key) => key === skip || modes[key] === "any" || flags[key] === (modes[key] === "yes"));

    const facets = Object.fromEntries(
      ATTRIBUTES.map((key) => {
        let yes = 0;
        let no = 0;
        for (const row of rows) {
          if (!passes(row.flags, key)) continue;
          if (row.flags[key]) yes += 1;
          else no += 1;
        }
        return [key, { yes, no }];
      })
    ) as Record<Attribute, { yes: number; no: number }>;

    const matches = rows.filter((row) => passes(row.flags));
    const price = (p: CatalogProduct) => (hasPublicCatalogPrice(p) ? (p.priceEuro as number) : 0);
    matches.sort((a, b) => {
      let diff = 0;
      if (sort === "quantity") diff = a.product.quantity - b.product.quantity;
      else if (sort === "price") diff = price(a.product) - price(b.product);
      else if (sort === "name") diff = a.product.name.localeCompare(b.product.name, "uk");
      else if (sort === "code") diff = a.product.code.localeCompare(b.product.code);
      else diff = missingCount(a.flags) - missingCount(b.flags) || a.product.quantity - b.product.quantity;
      return diff * dir || a.product.code.localeCompare(b.product.code);
    });

    // ?export=articles → every matching article (or code) in the current
    // order, for "copy all articles".
    if (params.get("export") === "articles") {
      const articles = matches.map(({ product: p }) => (p.article || p.code || "").trim()).filter(Boolean);
      return json({ ok: true, total: matches.length, articles });
    }

    const page = matches.slice(offset, offset + PAGE_LIMIT);
    const promo = getSnapshotPriceLookup(page.map(({ product: p }) => p.code));
    const items = page.map(({ product: p, flags }) => ({
      code: p.code,
      article: p.article,
      name: p.name,
      producer: p.producer,
      quantity: p.quantity,
      group: p.group || "",
      subGroup: p.subGroup || "",
      priceEuro: hasPublicCatalogPrice(p) ? p.priceEuro : null,
      // Full editor state for ProductFullEditModal (admin-only route).
      category: p.category || "",
      costPriceEuro: typeof p.costPriceEuro === "number" ? p.costPriceEuro : null,
      promoPriceEuro: promo[(p.code || "").trim().toLowerCase()]?.promoPriceEuro ?? null,
      description: p.description || "",
      flags,
      href: buildProductPath({
        code: p.code,
        article: p.article,
        name: p.name,
        producer: p.producer,
        group: p.group,
        subGroup: p.subGroup,
        category: p.category,
      }),
    }));

    return json({
      ok: true,
      catalogTotal: products.length,
      total: matches.length,
      offset,
      items,
      hasMore: offset + PAGE_LIMIT < matches.length,
      facets,
    });
  } catch (error) {
    console.error("[catalog-quality] failed:", error);
    return json({ ok: false, error: "Каталог ще завантажується, спробуйте за хвилину" }, 503);
  }
}
