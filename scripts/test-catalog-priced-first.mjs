import assert from "node:assert/strict";
import { loadCatalogSearch } from "./lib/catalog-search-harness.mjs";

const records = [
  { code: "A", sale: 10 },
  { code: "B", cost: 2, hasPrice: true },
  { code: "C" },
  { code: "D", sale: 20 },
  { code: "E", sale: 30 },
  { code: "F" },
];
const productCodes = (items) => Array.from(items, (item) => item.code);

const toRecord = ({ code, sale, cost, hasPrice }) => ({
  Код: code,
  Артикул: code,
  Наименование: `Товар ${code}`,
  ...(sale !== undefined ? { ЦінаПрод: sale } : {}),
  ...(cost !== undefined ? { ЦінаЗакуп: cost } : {}),
  ...(hasPrice !== undefined ? { ЕстьЦена: hasPrice } : {}),
  Количество: 1,
});

function createCatalog({ emptyUnpricedOnce = false, stallUnpriced = false, sourceRecords = records } = {}) {
  const requests = [];
  let didReturnEmpty = false;
  const api = loadCatalogSearch(async (_endpoint, options) => {
    const body = options.body;
    requests.push({ body, cacheTtlMs: options.cacheTtlMs });

    if (!body.ТолькоСЦеной && body.Лимит === 500 && !body.ПослеКода) {
      if (stallUnpriced || (emptyUnpricedOnce && !didReturnEmpty)) {
        didReturnEmpty = true;
        return {
          status: 200,
          text: JSON.stringify({
            success: true,
            items: [],
            total_count: sourceRecords.length,
            has_more: true,
            next_cursor: "",
          }),
        };
      }
    }

    const source = body.ТолькоСЦеной
      ? sourceRecords.filter((item) => item.sale !== undefined || item.cost !== undefined)
      : sourceRecords;
    const cursor = body.ПослеКода || "";
    const cursorIndex = cursor
      ? source.findIndex((item) => item.code === cursor)
      : -1;
    const start = cursorIndex + 1;
    const limit = Number(body.Лимит) || 10;
    const page = source.slice(start, start + limit);
    const end = start + page.length;
    return {
      status: 200,
      text: JSON.stringify({
        success: true,
        items: page.map(toRecord),
        total_count: source.length,
        has_more: end < source.length,
        next_cursor: end < source.length ? page.at(-1)?.code ?? "" : "",
      }),
    };
  });
  return { api, requests };
}

const catalog = createCatalog();
const first = await catalog.api.fetchCatalogProductsByQuery({
  page: 1,
  limit: 2,
  forceAllgoodsSource: true,
  includePriceEnrichment: false,
});
assert.deepEqual(productCodes(first.items), ["A", "D"]);
assert.equal(first.totalCount, records.length);
assert.equal(first.hasMore, true);
assert.match(first.nextCursor, /^pf1:/);

const second = await catalog.api.fetchCatalogProductsByQuery({
  page: 2,
  limit: 2,
  cursor: first.nextCursor,
  forceAllgoodsSource: true,
  includePriceEnrichment: false,
});
assert.deepEqual(productCodes(second.items), ["E", "B"]);
assert.equal(second.hasMore, true);

const third = await catalog.api.fetchCatalogProductsByQuery({
  page: 3,
  limit: 2,
  cursor: second.nextCursor,
  forceAllgoodsSource: true,
  includePriceEnrichment: false,
});
assert.deepEqual(productCodes(third.items), ["C", "F"]);
assert.equal(third.hasMore, false);
assert.deepEqual(
  productCodes([...first.items, ...second.items, ...third.items]),
  ["A", "D", "E", "B", "C", "F"],
  "Price-first pagination includes every item exactly once"
);
assert.ok(
  catalog.requests.some(({ body }) => body.ТолькоСЦеной === true),
  "The priced segment uses the 1C price filter"
);
assert.ok(
  catalog.requests.some(({ body }) => body.ТолькоСЦеной !== true && body.Лимит === 500),
  "The unpriced segment scans code-ordered 1C windows"
);

const directCatalog = createCatalog();
const direct = await directCatalog.api.fetchCatalogProductsByQuery({
  page: 2,
  limit: 2,
  directOffset: 2,
  forceAllgoodsSource: true,
  includePriceEnrichment: false,
});
assert.deepEqual(productCodes(direct.items), ["E", "B"]);
assert.equal(direct.directOffset, 2);

const recoveryCatalog = createCatalog({ emptyUnpricedOnce: true });
const recovered = await recoveryCatalog.api.fetchCatalogProductsByQuery({
  page: 1,
  limit: 4,
  forceAllgoodsSource: true,
  includePriceEnrichment: false,
});
assert.deepEqual(productCodes(recovered.items), ["A", "D", "E", "B"]);
assert.ok(
  recoveryCatalog.requests.some(({ body, cacheTtlMs }) =>
    !body.ТолькоСЦеной && body.Лимит === 500 && cacheTtlMs === 0
  ),
  "An empty continuation is retried without caching before pagination advances"
);

const stalledCatalog = createCatalog({ stallUnpriced: true });
await assert.rejects(
  stalledCatalog.api.fetchCatalogProductsByQuery({
    page: 1,
    limit: 4,
    forceAllgoodsSource: true,
    includePriceEnrichment: false,
  }),
  /CATALOG_PAGINATION_STALLED/
);

console.log("Priced-first catalog passed: sale price precedence, purchase-only rows, cursor paging and direct page jumps.");

const manyRecords = [
  ...Array.from({ length: 540 }, (_, i) => ({ code: `C${String(i).padStart(3, "0")}`, cost: 2 })),
  ...Array.from({ length: 35 }, (_, i) => ({ code: `P${String(i).padStart(3, "0")}`, sale: 10 + i })),
  ...Array.from({ length: 12 }, (_, i) => ({ code: `U${String(i).padStart(3, "0")}` })),
];
const expected = [...manyRecords.filter(item => item.sale > 0), ...manyRecords.filter(item => !(item.sale > 0))].map(item => item.code);
const large = createCatalog({ sourceRecords: manyRecords });
const actual = [];
let cursor = "";
for (let page = 1; page < 50; page++) {
  const result = await large.api.fetchCatalogProductsByQuery({
    page, limit: 17, cursor, forceAllgoodsSource: true, includePriceEnrichment: false,
  });
  actual.push(...productCodes(result.items));
  if (!result.hasMore) break;
  assert(result.nextCursor && result.nextCursor !== cursor, "Cursor progresses through purchase-only windows");
  cursor = result.nextCursor;
}
assert.deepEqual(actual, expected, "Large priced/unpriced windows preserve every item exactly once");
const largeDirect = await large.api.fetchCatalogProductsByQuery({
  page: 2, limit: 17, directOffset: 17, forceAllgoodsSource: true, includePriceEnrichment: false,
});
assert.deepEqual(productCodes(largeDirect.items), expected.slice(17, 34));
const failedEndpoints = [];
const failed = loadCatalogSearch(async endpoint => { failedEndpoints.push(endpoint); throw new Error("1C unavailable"); });
await assert.rejects(failed.fetchCatalogProductsByQuery({ page: 1, limit: 16, forceAllgoodsSource: true, includePriceEnrichment: false }), /1C unavailable/);
assert(failedEndpoints.every(endpoint => endpoint === "allgoods"), "Never fall back to an unprioritized legacy page on a 1C failure");
console.log("Large priced-first catalog passed: 540 purchase-only rows, window reuse, complete pagination and no legacy fallback.");

// The first page only needs a small window; later windows are 500 rows.
const smallFirst = createCatalog({ sourceRecords: manyRecords });
const smallFirstPage = await smallFirst.api.fetchCatalogProductsByQuery({
  page: 1, limit: 12, forceAllgoodsSource: true, includePriceEnrichment: false,
});
assert.equal(smallFirstPage.items.length, 12);
assert.deepEqual(
  smallFirst.requests.filter(({ body }) => body.ТолькоСЦеной).map(({ body }) => body.Лимит).slice(0, 1),
  [48],
  "The first priced window is sized for the first page"
);
assert.ok(
  smallFirst.requests.some(({ body }) => body.ТолькоСЦеной && body.Лимит === 500),
  "The next priced window is a full 500-row window"
);
assert.deepEqual(
  JSON.parse(smallFirstPage.nextCursor.slice(4)).w ?? 500,
  500,
  "Continuation leaves the small first window once it is used up"
);
const legacyCursor = await createCatalog().api.fetchCatalogProductsByQuery({
  page: 2, limit: 2, cursor: 'pf1:{"u":false,"c":"","s":1}', forceAllgoodsSource: true, includePriceEnrichment: false,
});
assert.deepEqual(productCodes(legacyCursor.items), ["D", "E"], "Cursors issued before the window field still work");

// A 1C module with ТолькоБезЦены and price_filter "sale_v1" opens any page
// of either part with one or two direct requests.
function createModernCatalog(sourceRecords) {
  const requests = [];
  const api = loadCatalogSearch(async (_endpoint, options) => {
    const body = options.body;
    requests.push(body);
    const source = body.ТолькоСЦеной
      ? sourceRecords.filter((item) => item.sale > 0)
      : body.ТолькоБезЦены
        ? sourceRecords.filter((item) => !(item.sale > 0))
        : sourceRecords;
    const limit = Number(body.Лимит) || 10;
    let start = 0;
    if (body.ПрямаяСтраница) start = body.Смещение;
    else if (body.ПослеКода) start = source.findIndex((item) => item.code === body.ПослеКода) + 1;
    const page = source.slice(start, start + limit);
    const end = start + page.length;
    return { status: 200, text: JSON.stringify({
      success: true,
      price_filter: "sale_v1",
      ...(body.ПрямаяСтраница ? { pagination_mode: "offset_v1", offset: body.Смещение } : {}),
      items: page.map(toRecord),
      total_count: source.length,
      has_more: end < source.length,
      next_cursor: end < source.length ? page.at(-1)?.code ?? "" : "",
    }) };
  });
  return { api, requests };
}
const modernRecords = [
  ...Array.from({ length: 30 }, (_, i) => ({ code: `M${String(i * 2).padStart(3, "0")}`, sale: 5 })),
  ...Array.from({ length: 30 }, (_, i) => ({ code: `M${String(i * 2 + 1).padStart(3, "0")}` })),
].sort((a, b) => a.code.localeCompare(b.code));
const modernExpected = [...modernRecords.filter((r) => r.sale), ...modernRecords.filter((r) => !r.sale)].map((r) => r.code);
for (const offset of [10, 25, 40]) {
  const modern = createModernCatalog(modernRecords);
  const result = await modern.api.fetchCatalogProductsByQuery({
    page: offset / 5 + 1, limit: 5, directOffset: offset, forceAllgoodsSource: true, includePriceEnrichment: false,
  });
  assert.deepEqual(productCodes(result.items), modernExpected.slice(offset, offset + 5), `direct page at ${offset}`);
  assert.ok(modern.requests.filter((body) => body.ПрямаяСтраница).length <= 2, "A direct page costs at most two 1C requests");
  assert.ok(!modern.requests.some((body) => body.Лимит === 500), "No window walking when 1C opens pages directly");
  const next = await modern.api.fetchCatalogProductsByQuery({
    page: offset / 5 + 2, limit: 5, cursor: result.nextCursor, forceAllgoodsSource: true, includePriceEnrichment: false,
  });
  assert.deepEqual(productCodes(next.items), modernExpected.slice(offset + 5, offset + 10), `cursor after direct page at ${offset}`);
}
const modernWalk = createModernCatalog(modernRecords);
const walked = [];
let modernCursor = "";
for (let page = 1; page < 30; page++) {
  const result = await modernWalk.api.fetchCatalogProductsByQuery({
    page, limit: 7, cursor: modernCursor, forceAllgoodsSource: true, includePriceEnrichment: false,
  });
  walked.push(...productCodes(result.items));
  if (!result.hasMore) break;
  modernCursor = result.nextCursor;
}
assert.deepEqual(walked, modernExpected, "Cursor paging with ТолькоБезЦены keeps every item once");
assert.ok(modernWalk.requests.some((body) => body.ТолькоБезЦены === true), "The price-less part uses 1C's filter");
console.log("Priced-first windows passed: small first window, legacy cursors, direct pages and ТолькоБезЦены paging on a current 1C.");

// A small filtered listing is read once as a plain window and split here:
// the current 1C answers ТолькоСЦеной with a filter about 4x slower.
const filtered = createCatalog();
const filteredCodes = [];
let filteredCursor = "";
for (let page = 1; page < 10; page++) {
  const result = await filtered.api.fetchCatalogProductsByQuery({
    page, limit: 2, cursor: filteredCursor, producer: "BOSCH", forceAllgoodsSource: true, includePriceEnrichment: false,
  });
  filteredCodes.push(...productCodes(result.items));
  if (!result.hasMore) break;
  filteredCursor = result.nextCursor;
}
assert.deepEqual(filteredCodes, ["A", "D", "E", "B", "C", "F"], "A single window keeps priced-first order and every item once");
assert.ok(!filtered.requests.some(({ body }) => body.ТолькоСЦеной), "A small filtered listing skips the slow 1C price filter");
assert.equal(new Set(filtered.requests.filter(({ body }) => body.Лимит === 500).map(({ body }) => JSON.stringify(body))).size, 1, "Both parts reuse one window request");
const filteredDirect = await createCatalog().api.fetchCatalogProductsByQuery({
  page: 2, limit: 2, directOffset: 2, producer: "BOSCH", forceAllgoodsSource: true, includePriceEnrichment: false,
});
assert.deepEqual(productCodes(filteredDirect.items), ["E", "B"]);
console.log("Small filtered listing passed: one plain window, priced-first order, direct pages.");
