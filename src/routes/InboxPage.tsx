import { useEffect, useMemo, useState } from "react";
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
  markContactRead,
  markAllInboxRead,
  deleteContact,
  addOutboundReply,
  type InboxMessage,
} from "@/lib/repos/inbox";
import { sendInboxReply } from "@/lib/email";
import { broadcastChange } from "@/lib/sync";
import { formatRelative, formatDateTime } from "@/lib/format";

/** One contact's full back-and-forth thread, newest activity first. */
interface Conversation {
  contact: string; // phone (+1...) or email - the grouping key
  channel: string;
  name: string | null;
  customerId: number | null;
  messages: InboxMessage[]; // ascending by time
  lastAt: string;
  unread: number;
}

/** Group the flat message log into per-contact conversations. */
function buildConversations(messages: InboxMessage[]): Conversation[] {
  const byContact = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    const list = byContact.get(m.from_addr);
    if (list) list.push(m);
    else byContact.set(m.from_addr, [m]);
  }
  const convos: Conversation[] = [];
  for (const [contact, msgs] of byContact) {
    const asc = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lastInboundNamed = [...asc].reverse().find((m) => m.direction === "in" && m.from_name);
    convos.push({
      contact,
      channel: asc[asc.length - 1]?.channel ?? "sms",
      name: lastInboundNamed?.from_name ?? null,
      customerId: asc.find((m) => m.customer_id != null)?.customer_id ?? null,
      messages: asc,
      lastAt: asc[asc.length - 1]?.created_at ?? "",
      unread: asc.filter((m) => m.direction === "in" && m.is_read === 0).length,
    });
  }
  return convos.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export default function InboxPage() {
  const { data, loading, reload } = useAsync(listInboxMessages, []);
  const conversations = useMemo(() => buildConversations(data ?? []), [data]);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const selected = conversations.find((c) => c.contact === selectedContact) ?? null;
  const unread = conversations.reduce((n, c) => n + c.unread, 0);

  // Replies arrive via the webhook into the database, so poll while open. A rev
  // bump does a background refresh, keeping the thread on screen (no skeleton).
  useEffect(() => {
    const t = setInterval(() => broadcastChange(), 12000);
    return () => clearInterval(t);
  }, []);

  async function selectConversation(c: Conversation) {
    setSelectedContact(c.contact);
    if (c.unread > 0) {
      await markContactRead(c.contact);
      reload();
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Inbox"
        description="Replies customers send to your text and email updates."
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
            Conversations
            {unread > 0 && <Badge variant="default" className="ml-auto">{unread} new</Badge>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && conversations.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No replies yet.</div>
            ) : (
              conversations.map((c) => {
                const last = c.messages[c.messages.length - 1];
                const isUnread = c.unread > 0;
                return (
                  <button
                    key={c.contact}
                    type="button"
                    onClick={() => void selectConversation(c)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/60 cursor-pointer",
                      selectedContact === c.contact && "bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        <span className={cn("truncate text-sm", isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
                          {c.name ?? c.contact}
                        </span>
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {c.channel === "email" ? "Email" : "SMS"}
                        </Badge>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelative(c.lastAt)}</span>
                    </div>
                    <span className={cn("truncate pl-0 text-xs", isUnread ? "text-foreground/80" : "text-muted-foreground")}>
                      {last?.direction === "out" ? "You: " : ""}{last?.body}
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
            <ReadingPane conversation={selected} onChanged={reload} onDeleted={() => setSelectedContact(null)} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={InboxIcon}
                title={conversations.length === 0 ? "No replies yet" : "Select a conversation"}
                description={conversations.length === 0 ? "When a customer texts or emails back, it shows up here." : "Pick a conversation on the left to read and reply."}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadingPane({
  conversation,
  onChanged,
  onDeleted,
}: {
  conversation: Conversation;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const navigate = useNavigate();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const name = conversation.name ?? conversation.contact;
  const isEmail = conversation.channel === "email";

  async function send() {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendInboxReply(conversation.channel, conversation.contact, text);
      await addOutboundReply(conversation.channel, conversation.contact, conversation.customerId, text);
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
            {conversation.name ? `${conversation.contact} . ` : ""}{isEmail ? "Email" : "Text"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {conversation.customerId && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/customers/${conversation.customerId}`)}>
              <User /> Customer
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => { await deleteContact(conversation.contact); onDeleted(); onChanged(); }}
            aria-label="Delete conversation"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Thread */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {conversation.messages.map((m) => {
          const out = m.direction === "out";
          return (
            <div key={m.id} className={cn("flex flex-col", out ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-lg whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed",
                  out
                    ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-2xl rounded-tl-sm border border-border bg-muted/40 text-foreground",
                )}
              >
                {m.body}
              </div>
              <div className="mt-1 px-1 text-[11px] text-muted-foreground">
                {out ? "You" : name} . {formatDateTime(m.created_at)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          {isEmail
            ? "Replies are sent as an email from your account's address."
            : "Replies are sent as a real text from your shop number right away."}
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
