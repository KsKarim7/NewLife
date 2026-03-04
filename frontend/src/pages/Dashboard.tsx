import { useMemo, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/utils/currency";
import { Package, ShoppingCart, ClipboardList, AlertTriangle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats, type DashboardStats } from "@/api/dashboardApi";

function orderStatusToStatusType(status: string): import("@/components/shared/StatusBadge").StatusType {
  switch (status) {
    case "Confirmed":
      return "confirmed";
    case "Partially Paid":
      return "partial";
    case "Paid":
      return "paid";
    case "Cancelled":
      return "cancelled";
    case "Returned":
      return "returned";
    default:
      return "confirmed";
  }
}

export default function Dashboard() {
  const [period, setPeriod] = useState("7d");
  const navigate = useNavigate();

  const {
    data,
    isLoading,
    isFetching,
  } = useQuery<DashboardStats>({
    queryKey: ["dashboard", period],
    queryFn: () => getDashboardStats(period),
    refetchInterval: 60000,
  });

  const salesData = useMemo(() => {
    if (!data?.sales_over_time) return [];
    const current = data.sales_over_time.current_period ?? [];
    const previous = data.sales_over_time.previous_period ?? [];
    const length = Math.max(current.length, previous.length);
    const items = [];
    for (let i = 0; i < length; i += 1) {
      const curr = current[i];
      const prev = previous[i];
      items.push({
        label: curr?.label ?? prev?.label ?? `${i + 1}`,
        current: curr ? parseFloat(curr.amount_taka) : 0,
        previous: prev ? parseFloat(prev.amount_taka) : 0,
      });
    }
    return items;
  }, [data]);

  const categoryData = data?.sales_by_category ?? [];
  const topProducts = data?.top_products ?? [];
  const recentOrders = data?.recent_orders ?? [];

  const statsLoading = isLoading;

  const handlePeriodChange = (value: string) => {
    let next = "7d";
    if (value === "30") next = "30d";
    else if (value === "month") next = "month";
    else if (value === "custom") next = "custom";
    setPeriod(next);
  };

  const todaysSales = data?.todays_sales_taka
    ? formatCurrency(parseFloat(data.todays_sales_taka))
    : formatCurrency(0);

  return (
    <PageLayout
      title="Dashboard"
      searchPlaceholder="Search products, orders, customers..."
      periodValue={period === "7d" ? "7" : period === "30d" ? "30" : period === "month" ? "month" : "custom"}
      onPeriodChange={handlePeriodChange}
    >
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        {statsLoading ? (
          <>
            <Skeleton className="h-[88px] md:h-[110px] bg-card rounded-lg shadow-sm border border-border" />
            <Skeleton className="h-[88px] md:h-[110px] bg-card rounded-lg shadow-sm border border-border" />
            <Skeleton className="h-[88px] md:h-[110px] bg-card rounded-lg shadow-sm border border-border" />
            <Skeleton className="h-[88px] md:h-[110px] bg-card rounded-lg shadow-sm border border-border" />
          </>
        ) : (
          <>
            <StatCard
              label="Total Products"
              value={(data?.total_products ?? 0).toLocaleString()}
              trend={{ value: "", positive: true }}
              icon={Package}
              iconColor="text-primary"
              iconBg="bg-primary/10"
            />
            <StatCard
              label="Today's Sales"
              value={todaysSales}
              trend={{ value: "", positive: true }}
              icon={ShoppingCart}
              iconColor="text-success"
              iconBg="bg-success/10"
            />
            <StatCard
              label="Orders This Month"
              value={(data?.total_orders_this_month ?? 0).toString()}
              trend={{ value: "", positive: true }}
              icon={ClipboardList}
              iconColor="text-secondary"
              iconBg="bg-secondary/10"
            />
            <button
              type="button"
              className="text-left"
              onClick={() => navigate("/inventory")}
            >
              <StatCard
                label="Low Stock Alerts"
                value={(data?.low_stock_count ?? 0).toString()}
                subtitle="Items need restocking"
                icon={AlertTriangle}
                iconColor="text-warning"
                iconBg="bg-warning/10"
              />
            </button>
          </>
        )}
      </div>

      {/* Row 2: Sales Chart + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="lg:col-span-3 bg-card rounded-lg p-3 md:p-5 shadow-sm border border-border">
          <h2 className="text-sm md:text-base font-semibold text-card-foreground mb-3 md:mb-4">Sales Over Time</h2>
          {isLoading ? (
            <Skeleton className="w-full h-[200px] lg:h-[280px]" />
          ) : (
            <ResponsiveContainer width="100%" height={200} className="lg:!h-[280px]">
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(215,14%,46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(215,14%,46%)" tickFormatter={(v) => `৳${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="current" name="Current" stroke="hsl(211,52%,24%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="previous" name="Previous" stroke="hsl(215,14%,46%)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-2 bg-card rounded-lg p-3 md:p-5 shadow-sm border border-border">
          <h2 className="text-sm md:text-base font-semibold text-card-foreground mb-3 md:mb-4">Top Selling Products</h2>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-table-header uppercase text-muted-foreground pb-2">Product</th>
                      <th className="text-right text-table-header uppercase text-muted-foreground pb-2">Qty</th>
                      <th className="text-right text-table-header uppercase text-muted-foreground pb-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.name} className="border-b border-border last:border-0 hover:bg-row-hover transition-colors">
                        <td className="py-2.5 text-table-body font-medium text-card-foreground">{p.name}</td>
                        <td className="py-2.5 text-table-body text-right text-muted-foreground">{p.qty_sold}</td>
                        <td className="py-2.5 text-table-body text-right text-card-foreground font-medium">{formatCurrency(parseFloat(p.revenue_taka))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile list */}
              <div className="md:hidden space-y-2">
                {topProducts.map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.qty_sold} sold</p>
                    </div>
                    <p className="text-sm font-bold text-card-foreground">{formatCurrency(parseFloat(p.revenue_taka))}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Category Chart + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <div className="bg-card rounded-lg p-3 md:p-5 shadow-sm border border-border">
          <h2 className="text-sm md:text-base font-semibold text-card-foreground mb-3 md:mb-4">Sales by Category</h2>
          {isLoading ? (
            <Skeleton className="w-full h-[200px] lg:h-[260px]" />
          ) : (
            <ResponsiveContainer width="100%" height={200} className="lg:!h-[260px]">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215,14%,46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(215,14%,46%)" />
                <Tooltip />
                <Bar dataKey="qty" name="Qty Sold" fill="hsl(211,52%,24%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card rounded-lg p-3 md:p-5 shadow-sm border border-border">
          <h2 className="text-sm md:text-base font-semibold text-card-foreground mb-3 md:mb-4">Recent Orders</h2>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-table-header uppercase text-muted-foreground pb-2">Order</th>
                      <th className="text-left text-table-header uppercase text-muted-foreground pb-2">Customer</th>
                      <th className="text-right text-table-header uppercase text-muted-foreground pb-2">Amount</th>
                      <th className="text-center text-table-header uppercase text-muted-foreground pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o) => (
                      <tr key={o.order_number} className="border-b border-border last:border-0 hover:bg-row-hover transition-colors">
                        <td className="py-2.5 text-table-body font-medium text-secondary">{o.order_number}</td>
                        <td className="py-2.5 text-table-body text-card-foreground">{o.customer_name}</td>
                        <td className="py-2.5 text-table-body text-right text-card-foreground">{formatCurrency(parseFloat(o.total_taka))}</td>
                        <td className="py-2.5 text-center"><StatusBadge status={orderStatusToStatusType(o.status)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile card list */}
              <div className="md:hidden space-y-2">
                {recentOrders.map((o) => (
                  <div key={o.order_number} className="bg-card rounded-lg p-3 flex justify-between items-start border border-border">
                    <div>
                      <p className="font-semibold text-sm text-secondary">{o.order_number}</p>
                      <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{o.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{formatCurrency(parseFloat(o.total_taka))}</p>
                      <StatusBadge status={orderStatusToStatusType(o.status)} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right">
                <button
                  type="button"
                  className="text-sm text-secondary hover:underline"
                  onClick={() => navigate("/orders")}
                >
                  View all orders →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
