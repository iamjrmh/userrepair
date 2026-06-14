import { useEffect, useState } from "react";
import { BookOpen, Plus, Save, Link2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import {
  listArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  backlinks,
} from "@/lib/repos/knowledge";
import { formatRelative } from "@/lib/format";
import type { KnowledgeArticle } from "@/types";

export default function KnowledgePage() {
  const { data: articles, reload } = useAsync(listArticles, []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ title: string; category: string; body: string }>({ title: "", category: "", body: "" });
  const [links, setLinks] = useState<KnowledgeArticle[]>([]);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (selectedId === null) return;
    void (async () => {
      const a = await getArticle(selectedId);
      if (a) {
        setDraft({ title: a.title, category: a.category ?? "", body: a.body_html });
        setLinks(await backlinks(a.title));
        setCreating(false);
      }
    })();
  }, [selectedId]);

  function startNew() {
    setSelectedId(null);
    setCreating(true);
    setDraft({ title: "", category: "", body: "" });
    setLinks([]);
  }

  async function save() {
    if (draft.title.trim() === "") {
      toast.error("Title is required");
      return;
    }
    if (creating || selectedId === null) {
      const id = await createArticle({ title: draft.title, category: draft.category || null, body_html: draft.body, author_id: null });
      toast.success("Article created");
      setCreating(false);
      setSelectedId(id);
    } else {
      await updateArticle(selectedId, { title: draft.title, category: draft.category || null, body_html: draft.body, author_id: null });
      toast.success("Article saved");
    }
    reload();
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Knowledge Base"
        description="Wiki-style articles with backlinks, categories, and version history."
        actions={<Button onClick={startNew}><Plus /> New article</Button>}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-4">
        <div className="overflow-y-auto rounded-lg border border-border bg-card">
          {(articles?.length ?? 0) === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No articles yet.</div>
          ) : (
            (articles ?? []).map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`block w-full border-b border-border px-3 py-2.5 text-left text-sm hover:bg-secondary/40 ${selectedId === a.id ? "bg-secondary/60" : ""}`}
              >
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.category ?? "Uncategorised"} - {formatRelative(a.updated_at)}</div>
              </button>
            ))
          )}
        </div>

        <div className="min-h-0 overflow-y-auto">
          {selectedId === null && !creating ? (
            <EmptyState icon={BookOpen} title="Select an article" description="Pick an article on the left or create a new one." action={<Button onClick={startNew}><Plus /> New article</Button>} />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Category</Label><Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Repair Guides/MacBook/No Power" /></div>
              </div>
              <RichTextEditor value={draft.body} onChange={(html) => setDraft((d) => ({ ...d, body: html }))} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {links.length > 0 && (
                    <>
                      <Link2 className="h-4 w-4" /> Linked from:
                      {links.map((l) => <Badge key={l.id} variant="secondary">{l.title}</Badge>)}
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedId !== null && !creating && (
                    <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 /> Remove
                    </Button>
                  )}
                  <Button onClick={save}><Save /> Save</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this article?"
        description="The article will be removed from the knowledge base."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (selectedId !== null) {
            await deleteArticle(selectedId);
            setSelectedId(null);
            setDraft({ title: "", category: "", body: "" });
            reload();
          }
        }}
      />
    </div>
  );
}
