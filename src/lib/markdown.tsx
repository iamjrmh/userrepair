import type { ReactNode } from "react";

/**
 * A small, safe markdown renderer for release notes shown in the update dialog.
 *
 * It is intentionally not a full markdown engine: it renders the parts our notes
 * use (headings, bold, inline code, links-as-text, bullet lists, tables, rules)
 * and quietly drops things that do not belong inside a small in-app dialog -
 * raw HTML blocks, the centered logo, and badge/images (which the app's CSP
 * would not load anyway).
 */

// Bold, inline code, or [text](url) - captured so we can style each.
const INLINE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

function renderInline(raw: string, keyBase: string): ReactNode[] {
  const text = raw
    .replace(/&times;/g, "×")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // drop images / badges
    .replace(/<[^>]+>/g, ""); // drop any inline HTML tags

  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      out.push(<strong key={`${keyBase}-${i}`} className="font-medium text-foreground">{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      out.push(<code key={`${keyBase}-${i}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{m[4]}</code>);
    } else if (m[6] !== undefined) {
      out.push(<span key={`${keyBase}-${i}`} className="text-foreground">{m[6]}</span>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderTable(rows: string[], key: number): ReactNode {
  const parse = (r: string) =>
    r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = parse(rows[0] ?? "");
  const body = rows.slice(2).map(parse);
  const hasHeader = header.some((h) => h !== "");
  return (
    <div key={key} className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-[11px]">
        {hasHeader && (
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              {header.map((h, idx) => (
                <th key={idx} className="px-2 py-1 text-left font-medium">{renderInline(h, `th${key}-${idx}`)}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((cells, ri) => (
            <tr key={ri} className="border-t border-border/60">
              {cells.map((c, ci) => (
                <td key={ci} className="px-2 py-1 align-top text-muted-foreground">{renderInline(c, `td${key}-${ri}-${ci}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const isHtmlLine = (l: string) => /^<\/?[a-zA-Z]/.test(l);
const isImageLine = (l: string) => /^!\[[^\]]*\]\([^)]*\)$/.test(l);
const isRule = (l: string) => /^(-{3,}|\*{3,}|_{3,})$/.test(l);
const isHeading = (l: string) => /^#{1,6}\s+/.test(l);
const isListItem = (l: string) => /^[-*]\s+/.test(l);

export function renderMarkdown(md: string): ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const t = (lines[i] ?? "").trim();

    if (t === "" || isHtmlLine(t) || isImageLine(t)) { i++; continue; }

    if (isRule(t)) { blocks.push(<hr key={key++} className="my-3 border-border" />); i++; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const level = (h[1] ?? "").length;
      const cls =
        level <= 2
          ? "mt-2 text-sm font-semibold text-foreground"
          : "mt-2 text-xs font-semibold text-foreground";
      blocks.push(<div key={key++} className={cls}>{renderInline(h[2] ?? "", `h${key}`)}</div>);
      i++;
      continue;
    }

    if (t.startsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        tbl.push((lines[i] ?? "").trim());
        i++;
      }
      blocks.push(renderTable(tbl, key++));
      continue;
    }

    if (t.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        quote.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="border-l-2 border-border pl-3 text-xs text-muted-foreground">
          {renderInline(quote.join(" "), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    if (isListItem(t)) {
      const items: string[] = [];
      while (i < lines.length && isListItem((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="ml-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `li${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraph: gather consecutive plain lines.
    const para: string[] = [];
    while (i < lines.length) {
      const pt = (lines[i] ?? "").trim();
      if (
        pt === "" || isHtmlLine(pt) || isImageLine(pt) || isRule(pt) ||
        isHeading(pt) || isListItem(pt) || pt.startsWith("|") || pt.startsWith(">")
      ) break;
      para.push(pt);
      i++;
    }
    if (para.length) {
      blocks.push(
        <p key={key++} className="text-xs leading-relaxed text-muted-foreground">{renderInline(para.join(" "), `p${key}`)}</p>,
      );
    }
  }

  return <div className="space-y-1.5">{blocks}</div>;
}
