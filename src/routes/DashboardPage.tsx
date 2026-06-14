import { Link } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Ticket, Users, AlertTriangle, DollarSign, Plus, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/useAsync";
import { loadDashboardStats } from "@/lib/repos/dashboard";
import { recentActivity } from "@/lib/repos/activity";
import { revenueByDay } from "@/lib/repos/financial";
import { formatCents, formatRelative } from "@/lib/format";

const PIE_COLORS = ["#3B82F6", "#D97706", "#22C55E", "#A855F7", "#EF4444", "#14B8A6", "#F59E0B"];

export default function DashboardPage() {
  const { data, loading } = useAsync(
    async () => {
      const [stats, activity, revenue] = await Promise.all([
        loadDashboardStats(),
        recentActivity(20),
        revenueByDay(30),
      ]);
      return { stats, activity, revenue };
    },
    [],
  );

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const { stats, activity, revenue } = data;
  const revenueData = revenue.map((r) => ({ day: r.day.slice(5), value: r.total / 100 }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Live snapshot of the bench."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/customers?new=1"><Users /> New customer</Link></Button>
            <Button asChild><Link to="/tickets?new=1"><Plus /> New ticket</Link></Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={Ticket} label="Open tickets" value={String(stats.openTickets)} />
        <StatCard icon={Clock} label="Due today" value={String(stats.dueToday)} warn={stats.dueToday > 0} />
        <StatCard icon={AlertTriangle} label="Low stock" value={String(stats.lowStock)} warn={stats.lowStock > 0} />
        <StatCard icon={DollarSign} label="Revenue (month)" value={formatCents(stats.revenueMonthCents)} />
        <StatCard icon={Users} label="Customers" value={String(stats.totalCustomers)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Revenue, last 30 days</CardTitle></CardHeader>
          <CardContent className="h-64">
            {revenueData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No revenue recorded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                  <RTooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tickets by status</CardTitle></CardHeader>
          <CardContent className="h-64">
            {stats.statusCounts.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No tickets yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.statusCounts} dataKey="n" nameKey="status" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {stats.statusCounts.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="hsl(var(--card))" />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {activity.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{a.summary}</span>
                  <span className="shrink-0 pl-3 text-xs text-muted-foreground">{formatRelative(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Ticket;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${warn ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
