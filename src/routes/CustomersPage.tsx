import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/useAsync";
import { listCustomers } from "@/lib/repos/customers";
import { formatCents } from "@/lib/format";
import type { Customer } from "@/types";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";

export default function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, loading, reload } = useAsync(listCustomers, []);
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") {
      setCreateOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name", cell: (c) => <span className="font-medium">{c.row.original.name}</span> },
      { accessorKey: "company", header: "Company", cell: (c) => c.row.original.company ?? "-" },
      { accessorKey: "phone", header: "Phone", cell: (c) => <span className="tabular-nums">{c.row.original.phone ?? "-"}</span> },
      { accessorKey: "email", header: "Email", cell: (c) => c.row.original.email ?? "-" },
      {
        accessorKey: "outstanding_cents",
        header: "Outstanding",
        cell: (c) => <span className="tabular-nums">{formatCents(c.row.original.outstanding_cents)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Customers"
        description="Profiles, device history, and lifetime value."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New customer
          </Button>
        }
      />
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter customers..."
          className="pl-8"
        />
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
            globalFilter={filter}
            onRowClick={(row) => navigate(`/customers/${row.id}`)}
            empty={
              <EmptyState
                icon={Users}
                title="No customers yet"
                description="Add your first customer to start logging repairs."
                action={
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus /> New customer
                  </Button>
                }
              />
            }
          />
        )}
      </div>
      <CustomerFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} />
    </div>
  );
}
