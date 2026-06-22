import "server-only";
import { NextRequest, NextResponse } from "next/server";

import { getProductTreeDataset } from "app/lib/product-tree";

export const runtime = "nodejs";

const VALID_TYPES = new Set(["group", "subGroup", "category"]);

const json = (payload: unknown) =>
  new NextResponse(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600, stale-while-revalidate=300",
    },
  });

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "";
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const parent = (searchParams.get("parent") || "").trim().toLowerCase();

  if (!VALID_TYPES.has(type)) {
    return json({ suggestions: [] });
  }

  const dataset = await getProductTreeDataset();
  const seen = new Set<string>();

  if (type === "category") {
    // Top-level groups in the tree → category field in catalog
    for (const group of dataset.groups) {
      if (group.label) seen.add(group.label);
    }
  } else if (type === "group") {
    // Second-level (subgroups) → group field in catalog
    // Optionally filtered by parent category
    for (const group of dataset.groups) {
      if (parent && group.label.toLowerCase() !== parent) continue;
      for (const sub of group.subgroups) {
        if (sub.label) seen.add(sub.label);
      }
    }
    // If no parent provided, also include top-level group labels (some products
    // use the top level directly as their group)
    if (!parent) {
      for (const group of dataset.groups) {
        if (group.label) seen.add(group.label);
      }
    }
  } else if (type === "subGroup") {
    // Third-level (children) → subGroup field in catalog
    // Optionally filtered by parent group name
    for (const group of dataset.groups) {
      for (const sub of group.subgroups) {
        if (parent && sub.label.toLowerCase() !== parent) continue;
        for (const child of sub.children) {
          if (child.label) seen.add(child.label);
        }
        // If no parent provided or subgroup itself matches, include subgroup label too
        if (!parent) seen.add(sub.label);
      }
    }
  }

  const suggestions = Array.from(seen)
    .filter((v) => !q || v.toLowerCase().includes(q))
    .sort((a, b) => {
      const al = a.toLowerCase();
      const bl = b.toLowerCase();
      const aStarts = al.startsWith(q);
      const bStarts = bl.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b, "uk");
    });

  return json({ suggestions });
}
