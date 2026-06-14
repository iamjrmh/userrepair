import { select } from "@/lib/db";
import type { ReferencePart } from "@/types";

function toMatchQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" ");
}

export interface ReferenceFilter {
  q: string;
  category: string; // "all" or a specific category
  limit?: number;
}

/**
 * Search the reference catalog. Uses FTS5 when a query is present, otherwise
 * lists by category. Results are capped (default 500) for the virtualized table.
 */
export async function searchReference(filter: ReferenceFilter): Promise<ReferencePart[]> {
  const limit = filter.limit ?? 500;
  const catClause = filter.category !== "all" ? "AND r.category = ?2" : "";

  if (filter.q.trim() !== "") {
    const q = toMatchQuery(filter.q);
    const params: (string | number)[] = filter.category !== "all" ? [q, filter.category, limit] : [q, limit];
    const limitIdx = filter.category !== "all" ? 3 : 2;
    return select<ReferencePart>(
      `SELECT r.* FROM fts_reference f JOIN reference_parts r ON r.id = f.rowid
       WHERE fts_reference MATCH ?1 AND r.deleted_at IS NULL ${catClause}
       ORDER BY rank LIMIT ?${limitIdx}`,
      params,
    );
  }

  const params: (string | number)[] = filter.category !== "all" ? [filter.category, limit] : [limit];
  const limitIdx = filter.category !== "all" ? 2 : 1;
  return select<ReferencePart>(
    `SELECT r.* FROM reference_parts r
     WHERE r.deleted_at IS NULL ${filter.category !== "all" ? "AND r.category = ?1" : ""}
     ORDER BY r.brand, r.device_models, r.part_type LIMIT ?${limitIdx}`,
    params,
  );
}

/** Category facets with counts for the filter chips. */
export async function referenceCategories(): Promise<{ category: string; n: number }[]> {
  return select<{ category: string; n: number }>(
    `SELECT category, COUNT(*) AS n FROM reference_parts WHERE deleted_at IS NULL
     GROUP BY category ORDER BY n DESC`,
  );
}

const CAT_PREFIX: Record<string, string> = {
  Mobile: "MOB",
  Tablet: "TAB",
  Laptop: "LAP",
  Desktop: "DSK",
  Console: "CON",
  TV: "TV",
  Consumable: "CSM",
  Microcontroller: "MCU",
  "Single-Board Computer": "SBC",
};

/** Deterministic catalog SKU for a reference part (stable for a given row). */
export function skuFor(part: { id: number; category: string }): string {
  const prefix = CAT_PREFIX[part.category] ?? part.category.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  return `UR-${prefix}-${String(part.id).padStart(5, "0")}`;
}

export async function referenceTotal(): Promise<number> {
  const rows = await select<{ n: number }>(
    "SELECT COUNT(*) AS n FROM reference_parts WHERE deleted_at IS NULL",
  );
  return rows[0]?.n ?? 0;
}
