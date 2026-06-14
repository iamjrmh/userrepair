import { select } from "@/lib/db";

export interface SearchHit {
  type: "ticket" | "customer" | "inventory" | "knowledge" | "measurement" | "reference";
  id: number;
  title: string;
  subtitle: string;
  path: string;
}

/** Build a safe FTS5 MATCH expression with prefix matching on each token. */
function toMatchQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`);
  return tokens.join(" ");
}

/**
 * Global full-text search across tickets, customers, inventory, knowledge, and
 * measurements using the FTS5 virtual tables. Results are grouped by type in the
 * UI. `limitPerType` caps each category.
 */
export async function globalSearch(raw: string, limitPerType = 6): Promise<SearchHit[]> {
  const q = toMatchQuery(raw);
  if (q === "") return [];

  const hits: SearchHit[] = [];

  const tickets = await select<{ id: number; ticket_number: string; title: string }>(
    `SELECT t.id, t.ticket_number, t.title
     FROM fts_tickets f JOIN tickets t ON t.id = f.rowid
     WHERE fts_tickets MATCH ?1 AND t.deleted_at IS NULL LIMIT ?2`,
    [q, limitPerType],
  );
  for (const t of tickets) {
    hits.push({
      type: "ticket",
      id: t.id,
      title: t.title,
      subtitle: t.ticket_number,
      path: `/tickets/${t.id}`,
    });
  }

  const customers = await select<{ id: number; name: string; phone: string | null }>(
    `SELECT c.id, c.name, c.phone
     FROM fts_customers f JOIN customers c ON c.id = f.rowid
     WHERE fts_customers MATCH ?1 AND c.deleted_at IS NULL LIMIT ?2`,
    [q, limitPerType],
  );
  for (const c of customers) {
    hits.push({
      type: "customer",
      id: c.id,
      title: c.name,
      subtitle: c.phone ?? "Customer",
      path: `/customers/${c.id}`,
    });
  }

  const items = await select<{ id: number; description: string; sku: string | null }>(
    `SELECT i.id, i.description, i.sku
     FROM fts_inventory f JOIN inventory_items i ON i.id = f.rowid
     WHERE fts_inventory MATCH ?1 AND i.deleted_at IS NULL LIMIT ?2`,
    [q, limitPerType],
  );
  for (const i of items) {
    hits.push({
      type: "inventory",
      id: i.id,
      title: i.description,
      subtitle: i.sku ?? "Part",
      path: `/inventory`,
    });
  }

  const articles = await select<{ id: number; title: string; category: string | null }>(
    `SELECT a.id, a.title, a.category
     FROM fts_knowledge f JOIN knowledge_articles a ON a.id = f.rowid
     WHERE fts_knowledge MATCH ?1 AND a.deleted_at IS NULL LIMIT ?2`,
    [q, limitPerType],
  );
  for (const a of articles) {
    hits.push({
      type: "knowledge",
      id: a.id,
      title: a.title,
      subtitle: a.category ?? "Article",
      path: `/knowledge`,
    });
  }

  const refParts = await select<{ id: number; name: string; device_models: string | null }>(
    `SELECT r.id, r.name, r.device_models
     FROM fts_reference f JOIN reference_parts r ON r.id = f.rowid
     WHERE fts_reference MATCH ?1 AND r.deleted_at IS NULL LIMIT ?2`,
    [q, limitPerType],
  );
  for (const r of refParts) {
    hits.push({
      type: "reference",
      id: r.id,
      title: r.name,
      subtitle: r.device_models ?? "Reference part",
      path: `/reference`,
    });
  }

  return hits;
}
