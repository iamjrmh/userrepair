import { getOne, run, select, softDelete } from "@/lib/db";
import { htmlToText } from "@/lib/utils";
import type { KnowledgeArticle } from "@/types";

export async function listArticles(): Promise<KnowledgeArticle[]> {
  return select<KnowledgeArticle>(
    "SELECT * FROM knowledge_articles WHERE deleted_at IS NULL ORDER BY title COLLATE NOCASE",
  );
}

export async function getArticle(id: number): Promise<KnowledgeArticle | null> {
  return getOne<KnowledgeArticle>(
    "SELECT * FROM knowledge_articles WHERE id = ?1 AND deleted_at IS NULL",
    [id],
  );
}

/** Extract [[Wiki Title]] targets from article HTML. */
function extractLinks(html: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const title = m[1]?.trim();
    if (title) out.push(title);
  }
  return out;
}

async function syncLinks(articleId: number, html: string): Promise<void> {
  await run("UPDATE knowledge_links SET deleted_at = ?1 WHERE from_article_id = ?2", [
    new Date().toISOString(),
    articleId,
  ]);
  for (const title of extractLinks(html)) {
    await run("INSERT INTO knowledge_links (from_article_id, to_title) VALUES (?1, ?2)", [
      articleId,
      title,
    ]);
  }
}

export async function createArticle(input: {
  title: string;
  category: string | null;
  body_html: string;
  author_id: number | null;
}): Promise<number> {
  const r = await run(
    `INSERT INTO knowledge_articles (title, category, body_html, body_text, author_id)
     VALUES (?1,?2,?3,?4,?5)`,
    [input.title, input.category, input.body_html, htmlToText(input.body_html), input.author_id],
  );
  await syncLinks(r.lastInsertId, input.body_html);
  return r.lastInsertId;
}

export async function updateArticle(
  id: number,
  input: { title: string; category: string | null; body_html: string; author_id: number | null },
): Promise<void> {
  const existing = await getArticle(id);
  if (existing) {
    // Snapshot the previous version for history before overwriting.
    await run(
      `INSERT INTO knowledge_article_versions (article_id, technician_id, title, body_html)
       VALUES (?1,?2,?3,?4)`,
      [id, existing.author_id, existing.title, existing.body_html],
    );
  }
  await run(
    "UPDATE knowledge_articles SET title=?1, category=?2, body_html=?3, body_text=?4 WHERE id=?5",
    [input.title, input.category, input.body_html, htmlToText(input.body_html), id],
  );
  await syncLinks(id, input.body_html);
}

export async function deleteArticle(id: number): Promise<void> {
  await softDelete("knowledge_articles", id);
}

/** Articles that link to the given title (backlinks). */
export async function backlinks(title: string): Promise<KnowledgeArticle[]> {
  return select<KnowledgeArticle>(
    `SELECT a.* FROM knowledge_links l JOIN knowledge_articles a ON a.id = l.from_article_id
     WHERE l.to_title = ?1 AND l.deleted_at IS NULL AND a.deleted_at IS NULL`,
    [title],
  );
}

export async function listTags(articleId: number): Promise<string[]> {
  const rows = await select<{ tag: string }>(
    "SELECT tag FROM knowledge_tags WHERE article_id = ?1 AND deleted_at IS NULL ORDER BY tag",
    [articleId],
  );
  return rows.map((r) => r.tag);
}

export async function addTag(articleId: number, tag: string): Promise<void> {
  await run("INSERT INTO knowledge_tags (article_id, tag) VALUES (?1, ?2)", [articleId, tag]);
}
