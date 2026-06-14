import { Puzzle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAsync } from "@/hooks/useAsync";
import { listPlugins, setPluginEnabled } from "@/lib/repos/plugins";

const EVENT_HOOKS = ["onTicketCreate", "onTicketClose", "onInventoryChange", "onInvoicePaid"];

const FUTURE_PLUGINS = [
  "POS System",
  "Customer Portal",
  "SMS Notifications",
  "Email Notifications",
  "AI Repair Assistant",
  "Barcode Scanner",
  "Label Printer",
  "Receipt Printer",
  "Device Check-In Kiosk",
];

export default function PluginsPage() {
  const { data, reload } = useAsync(listPlugins, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Plugins" description="Plugin registry and extension hooks. See PLUGIN_API.md for the interface." />

      <Card>
        <CardHeader><CardTitle>Installed plugins</CardTitle><CardDescription>Toggle a plugin to enable or disable its hooks and UI slots.</CardDescription></CardHeader>
        <CardContent>
          {(data?.length ?? 0) === 0 ? (
            <EmptyState icon={Puzzle} title="No plugins installed" description="The loader foundation is ready. Drop a plugin manifest to register one." />
          ) : (
            <div className="divide-y divide-border">
              {(data ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{p.name} <span className="text-xs text-muted-foreground">v{p.version}</span></div>
                    <div className="text-xs text-muted-foreground">{p.author ?? "Unknown author"}</div>
                  </div>
                  <Switch checked={p.enabled === 1} onCheckedChange={async (v) => { await setPluginEnabled(p.id, v); reload(); }} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Event hooks</CardTitle><CardDescription>Plugins subscribe to these lifecycle events.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {EVENT_HOOKS.map((h) => <Badge key={h} variant="secondary" className="font-mono">{h}</Badge>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Planned plugins</CardTitle><CardDescription>The hook points exist for these; implementations are future work.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {FUTURE_PLUGINS.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
