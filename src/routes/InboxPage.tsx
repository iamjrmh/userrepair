import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox as InboxIcon, RefreshCw, Trash2, Send, CheckCheck, Clock, User } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { cn } from "@/lib/utils";
import {
  listInboxMessages,
  markInboxRead,
  markAllInboxRead,
  deleteInboxMessage,
  type InboxMessage,
} from "@/lib/repos/inbox";
import { sendPingramReply } from "@/lib/email";
import { formatRelative, formatDateTime } from "@/lib/format";

export default function InboxPage() {
  const { data, loading, reload } = useAsync(listInboxMessages, []);
  const messages = data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = messages.find((m) => m.id === selectedId) ?? null;
  const unread = messages.filter((m) => m.is_read === 0).length;

  async function selectMessage(m: InboxMessage) {
    setSelectedId(m.id);
    if (m.is_read === 0) {
      await markInboxRead(m.id);
      reload();
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Inbox"
        description="Replies customers send to your text updates."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={async () => { await markAllInboxRead(); reload(); }} disabled={unread === 0}>
              <CheckCheck /> Mark all read
            </Button>
            <Button variant="outline" onClick={reload}><RefreshCw /> Refresh</Button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        {/* Conversation list */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
            Messages
            {unread > 0 && <Badge variant="default" className="ml-auto">{unread} new</Badge>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : messages.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No replies yet.</div>
            ) : (
              messages.map((m) => {
                const isUnread = m.is_read === 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void selectMessage(m)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/60 cursor-pointer",
                      selectedId === m.id && "bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        <span className={cn("truncate text-sm", isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
                          {m.from_name ?? m.from_addr}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelative(m.created_at)}</span>
                    </div>
                    <span className={cn("truncate pl-0 text-xs", isUnread ? "text-foreground/80" : "text-muted-foreground")}>
                      {m.body}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Reading pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <ReadingPane message={selected} onChanged={reload} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={InboxIcon}
                title={messages.length === 0 ? "No replies yet" : "Select a message"}
                description={messages.length === 0 ? "When a customer texts back, their reply shows up here." : "Pick a conversation on the left to read and reply."}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadingPane({ message, onChanged }: { message: InboxMessage; onChanged: () => void }) {
  const navigate = useNavigate();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const name = message.from_name ?? message.from_addr;

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await sendPingramReply(message.from_addr, reply.trim());
      toast.success("Reply sent");
      setReply("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {message.from_name ? `${message.from_addr} . ` : ""}{formatDateTime(message.created_at)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {message.customer_id && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/customers/${message.customer_id}`)}>
              <User /> Customer
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => { await deleteInboxMessage(message.id); onChanged(); }}
            aria-label="Delete message"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Message body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="max-w-lg rounded-2xl rounded-tl-sm border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {message.body}
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">{formatRelative(message.created_at)}</div>
      </div>

      {/* Composer */}
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          This number is checked weekly. Reply here for anything urgent and it sends as a real text right away.
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder={`Reply to ${name}...`}
            className="resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }}
          />
          <Button onClick={send} disabled={sending || !reply.trim()}>
            <Send /> {sending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
