import { useState, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ShoppingCart, DollarSign, AlertCircle, Plus, FileText, FileSpreadsheet, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getOrders, type Order, createOrder, type CreateOrderPayload } from "@/api/ordersApi";
import { getCustomers, type Customer } from "@/api/customersApi";
import { getProducts, type Product } from "@/api/productsApi";

const paisaToTaka = (paisa: number) => {
  return paisa / 100;
};

export default function OrdersList() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Create order sheet state
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderLines, setOrderLines] = useState<Array<{
    product_id: string;
    qty: number;
    unit_price: string;
    vat_percent: number;
  }>>([
    { product_id: "", qty: 1, unit_price: "", vat_percent: 0 }
  ]);
  const [amountReceived, setAmountReceived] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const { data: customersData } = useQuery({
    queryKey: ["customers"],
    queryFn: () => getCustomers({ limit: 100 }),
  });

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts({ limit: 100 }),
  });

  const createOrderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Order created successfully" });
      closeSheet();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create order",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const orders = ordersData?.orders ?? [];
  const pagination = ordersData?.pagination;
  const totalOrders = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  // Calculate stats
  const totalReceived = orders.reduce((sum, o) => sum + paisaToTaka(o.amount_received_paisa), 0);
  const totalDue = orders.reduce((sum, o) => sum + paisaToTaka(o.amount_due_paisa), 0);
  const totalRevenue = orders.reduce((sum, o) => sum + paisaToTaka(o.total_paisa), 0);

  // Helper functions for create order
  const openAddSheet = () => {
    setCustomerName("");
    setCustomerPhone("");
    setOrderLines([{ product_id: "", qty: 1, unit_price: "", vat_percent: 0 }]);
    setAmountReceived("");
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
  };

  const resetFormFields = () => {
    setCustomerName("");
    setCustomerPhone("");
    setOrderLines([{ product_id: "", qty: 1, unit_price: "", vat_percent: 0 }]);
    setAmountReceived("");
  };

  const handleAddOrderLine = () => {
    setOrderLines([...orderLines, { product_id: "", qty: 1, unit_price: "", vat_percent: 0 }]);
  };

  const handleRemoveOrderLine = (index: number) => {
    setOrderLines(orderLines.filter((_, i) => i !== index));
  };

  const handleOrderLineChange = (index: number, field: string, value: string | number) => {
    const newLines = [...orderLines];
    newLines[index] = { ...newLines[index], [field]: value };
    setOrderLines(newLines);
  };

  const handleSubmitOrder = () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      toast({
        title: "Validation error",
        description: "Customer name and phone are required",
        variant: "destructive",
      });
      return;
    }

    if (orderLines.length === 0 || orderLines.some(l => !l.product_id || !l.unit_price)) {
      toast({
        title: "Validation error",
        description: "Please add at least one product line with valid product and price",
        variant: "destructive",
      });
      return;
    }

    const payload: CreateOrderPayload = {
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      lines: orderLines.map(line => ({
        product_id: line.product_id,
        qty: line.qty,
        unit_price: line.unit_price,
        vat_percent: line.vat_percent,
      })),
      amount_received: amountReceived ? parseInt(amountReceived) * 100 : undefined,
    };

    createOrderMutation.mutate(payload);
  };

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
        <Button 
          className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={openAddSheet}
        >
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

      {/* Create Order Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create New Order</SheetTitle>
            <SheetDescription>
              Create a new order by adding customer details and products.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {/* Customer Information */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Customer Name *</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Customer Phone *</label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>

            {/* Order Lines */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-foreground">Order Items *</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOrderLine}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>

              {orderLines.map((line, index) => (
                <div key={index} className="bg-muted/30 p-3 rounded-lg mb-3 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Item {index + 1}</span>
                    {orderLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOrderLine(index)}
                        className="p-1 hover:bg-destructive/10 rounded"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Product *</label>
                    <Select value={line.product_id} onValueChange={(value) => handleOrderLineChange(index, "product_id", value)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {(productsData?.products ?? []).map((product: Product) => (
                          <SelectItem key={product._id} value={product._id}>
                            {product.name} ({product.product_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Qty *</label>
                      <Input
                        type="number"
                        min="1"
                        value={line.qty}
                        onChange={(e) => handleOrderLineChange(index, "qty", parseInt(e.target.value) || 1)}
                        className="h-8 text-sm"
                        placeholder="Qty"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Unit Price (Tk) *</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => handleOrderLineChange(index, "unit_price", e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Price"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">VAT %</label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={line.vat_percent}
                      onChange={(e) => handleOrderLineChange(index, "vat_percent", parseInt(e.target.value) || 0)}
                      className="h-8 text-sm"
                      placeholder="VAT %"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Amount Received */}
            <div className="space-y-1.5 border-t pt-4">
              <label className="text-sm font-medium text-foreground">Amount Received (Tk)</label>
              <Input
                type="number"
                step="0.01"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="Enter amount received (optional)"
              />
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSubmitOrder}
              disabled={createOrderMutation.isPending || !customerName.trim() || !customerPhone.trim()}
            >
              {createOrderMutation.isPending ? "Creating..." : "Create Order"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
