import { useState, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, DollarSign, AlertCircle, Plus, FileText, FileSpreadsheet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOrders, type Order } from "@/api/ordersApi";

const paisaToTaka = (paisa: number) => {
  return paisa / 100;
};

export default function OrdersList() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const debouncedSearch = useMemo(() => {
    const timer = setTimeout(() => {
      // Debounced search is handled in component state
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const { data: ordersData, isLoading, isError, error } = useQuery({
    queryKey: ["orders", page, statusFilter],
    queryFn: () =>
      getOrders({
        page,
        limit: 10,
        status: statusFilter || undefined,
      }),
  });

  const orders = ordersData?.orders ?? [];
  const pagination = ordersData?.pagination;
  const totalOrders = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  // Calculate stats
  const totalReceived = orders.reduce((sum, o) => sum + paisaToTaka(o.amount_received_paisa), 0);
  const totalDue = orders.reduce((sum, o) => sum + paisaToTaka(o.amount_due_paisa), 0);
  const totalRevenue = orders.reduce((sum, o) => sum + paisaToTaka(o.total_paisa), 0);

  // Filter by search term locally
  const filteredOrders = orders.filter(o =>
    o.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customer.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isError) {
    return (
      <PageLayout title="Orders & Sales" searchPlaceholder="Search by order no or customer...">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          Error loading orders: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </PageLayout>
    );
  }

  function orderStatusToStatusType(status: string): import("@/components/shared/StatusBadge").StatusType {
    throw new Error("Function not implemented.");
  }

  return (
    <PageLayout
      title="Orders & Sales"
      searchPlaceholder="Search by order no or customer..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Total Orders"
          value={String(totalOrders)}
          trend={{ value: "This month", positive: true }}
          icon={ShoppingCart}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          trend={{ value: `${orders.length} orders`, positive: true }}
          icon={DollarSign}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Pending Due"
          value={formatCurrency(totalDue)}
          subtitle={`${orders.filter(o => o.amount_due_paisa > 0).length} orders`}
          icon={AlertCircle}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
      </div>

      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
          <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel</Button>
        </div>
        <Button className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-1" /> Create Order
        </Button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button
          variant={statusFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter(null)}
        >
          All
        </Button>
        {["Confirmed", "Partially Paid", "Paid", "Cancelled"].map(status => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </Button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Order No", "Date & Time", "Customer", "Items", "Total", "Received", "Due", "Status"].map(h => (
                  <th key={h} className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o, i) => (
                  <tr key={o._id} className={`border-b border-border last:border-0 hover:bg-row-hover transition-colors ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                    <td className="px-4 py-3 text-table-body font-medium text-secondary">{o.order_number}</td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-table-body text-card-foreground">{o.customer.name}</td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">{o.lines.length}</td>
                    <td className="px-4 py-3 text-table-body font-medium">{formatCurrency(paisaToTaka(o.total_paisa))}</td>
                    <td className="px-4 py-3 text-table-body text-success">{formatCurrency(paisaToTaka(o.amount_received_paisa))}</td>
                    <td className="px-4 py-3 text-table-body text-destructive font-medium">
                      {o.amount_due_paisa > 0 ? formatCurrency(paisaToTaka(o.amount_due_paisa)) : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={orderStatusToStatusType(o.status)} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No orders found</div>
        ) : (
          filteredOrders.map((o) => (
            <div key={o._id} className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm text-secondary">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{o.customer.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">{formatCurrency(paisaToTaka(o.total_paisa))}</p>
                  {o.amount_due_paisa > 0 && <p className="text-xs text-destructive font-medium">Due: {formatCurrency(paisaToTaka(o.amount_due_paisa))}</p>}
                </div>
                <StatusBadge status={orderStatusToStatusType(o.status)} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </PageLayout>
  );
}
