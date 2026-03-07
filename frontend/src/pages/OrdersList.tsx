import { useState, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime } from "@/utils/formatDate";
import { getPeriodDateRange } from "@/utils/dateRangeUtils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ShoppingCart, DollarSign, AlertCircle, Plus, FileText, FileSpreadsheet, X, Eye } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getOrders, type Order, type OrdersResponse, createOrder, type CreateOrderPayload, addPayment, cancelOrder, deleteOrder } from "@/api/ordersApi";
import { getCustomers, type Customer } from "@/api/customersApi";
import { getProducts, type Product } from "@/api/productsApi";

interface AxiosError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

const paisaToTaka = (paisa: number) => {
  return paisa / 100;
};

const toPriceNumber = (value: string | number): number => {
  if (typeof value === 'number') return value / 100;
  const num = parseFloat(String(value));
  if (Number.isNaN(num)) return 0;
  return num;
};

export default function OrdersList() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [period, setPeriod] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

  // Payment dialog state
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  // Cancel dialog state
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);

  // View order sheet state
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  // Delete order dialog state
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getDateRange = () => {
    if (period === "custom") {
      return { from: customFrom, to: customTo };
    }
    const range = getPeriodDateRange(period);
    return range || { from: "", to: "" };
  };

  const { from: fromDate, to: toDate } = getDateRange();
  const shouldFetch = period !== "custom" || !!(customFrom && customTo);

  const debouncedSearch = useMemo(() => {
    const timer = setTimeout(() => {
      // Debounced search is handled in component state
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const { data: ordersData, isLoading, isError, error } = useQuery<OrdersResponse>({
    queryKey: ["orders", page, statusFilter, period, customFrom, customTo],
    queryFn: () =>
      getOrders({
        page,
        limit: 10,
        status: statusFilter || undefined,
        from: fromDate,
        to: toDate,
      }),
    enabled: shouldFetch,
  });

  // Fetch global stats independently (no filters)
  const { data: statsData } = useQuery<OrdersResponse>({
    queryKey: ["orders-stats"],
    queryFn: () =>
      getOrders({
        page: 1,
        limit: 1,
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
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
      toast({ title: "Order created successfully" });
      closeSheet();
    },
    onError: (error: unknown) => {
      const errorMessage = (error as AxiosError)?.response?.data?.message || (error as Error)?.message || "Something went wrong";
      toast({
        title: "Failed to create order",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) =>
      addPayment(id, { amount, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
      toast({ title: "Payment recorded successfully" });
      setPayingOrder(null);
      setPaymentAmount("");
      setPaymentNote("");
    },
    onError: (error: unknown) => {
      const errorMessage = (error as AxiosError)?.response?.data?.message || (error as Error)?.message || "Something went wrong";
      toast({
        title: "Failed to record payment",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (id: string) => cancelOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
      toast({ title: "Order cancelled successfully" });
      setCancellingOrder(null);
    },
    onError: (error: unknown) => {
      const errorMessage = (error as AxiosError)?.response?.data?.message || (error as Error)?.message || "Something went wrong";
      toast({
        title: "Failed to cancel order",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
      toast({ title: "Order deleted successfully" });
      setDeletingOrder(null);
      setViewingOrder(null);
    },
    onError: (error: unknown) => {
      const errorMessage = (error as AxiosError)?.response?.data?.message || (error as Error)?.message || "Something went wrong";
      toast({
        title: "Failed to delete order",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const orders = ordersData?.orders ?? [];
  const pagination = ordersData?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  // Get global stats from summary (not from filtered data)
  const summaryData = statsData?.summary;
  const totalOrders = statsData?.pagination?.total ?? 0;
  const totalRevenue = parseFloat(summaryData?.total_revenue ?? "0");
  const totalDue = Math.max(0, parseFloat(summaryData?.total_due ?? "0"));

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

  const handlePeriodChange = (value: string) => {
    let next = "7d";
    if (value === "today") next = "today";
    else if (value === "30") next = "30d";
    else if (value === "month") next = "month";
    else if (value === "custom") next = "custom";
    setPeriod(next);
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

  const handleProductSelect = (index: number, productId: string) => {
    const selectedProduct = (productsData?.products ?? []).find(p => p._id === productId);
    const newLines = [...orderLines];
    newLines[index] = {
      ...newLines[index],
      product_id: productId,
      unit_price: selectedProduct?.selling_price_taka ?? "",
    };
    setOrderLines(newLines);
  };

  const handleOpenPaymentDialog = (order: Order) => {
    const amountDue = toPriceNumber(order.amount_due_paisa);
    setPayingOrder(order);
    setPaymentAmount(amountDue.toFixed(2));
    setPaymentNote("");
  };

  const handleSubmitPayment = () => {
    if (!payingOrder) return;

    const enteredAmount = parseFloat(paymentAmount || "0");
    const dueAmount = toPriceNumber(payingOrder.amount_due_paisa);

    if (enteredAmount > dueAmount) {
      toast({
        title: "Amount exceeds due",
        description: `Maximum payable amount is ${formatCurrency(dueAmount)}`,
        variant: "destructive",
      });
      return;
    }

    if (enteredAmount <= 0 || Number.isNaN(enteredAmount)) {
      toast({
        title: "Invalid amount",
        description: "Payment amount must be greater than zero",
        variant: "destructive",
      });
      return;
    }

    const amount = enteredAmount;
    addPaymentMutation.mutate({
      id: payingOrder._id,
      amount,
      note: paymentNote || undefined,
    });
  };

  const handleOpenCancelDialog = (order: Order) => {
    setCancellingOrder(order);
  };

  const handleConfirmCancel = () => {
    if (!cancellingOrder) return;
    cancelOrderMutation.mutate(cancellingOrder._id);
  };

  const handleOpenViewSheet = (order: Order) => {
    setViewingOrder(order);
  };

  const handleOpenDeleteDialog = (order: Order) => {
    setViewingOrder(null);
    setDeletingOrder(order);
  };

  const handleConfirmDelete = () => {
    if (!deletingOrder) return;
    deleteOrderMutation.mutate(deletingOrder._id);
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
      amount_received: amountReceived ? parseInt(amountReceived) : undefined,
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
      periodValue={period === "today" ? "today" : period === "7d" ? "7" : period === "30d" ? "30" : period === "month" ? "month" : "custom"}
      onPeriodChange={handlePeriodChange}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFromChange={setCustomFrom}
      onCustomToChange={setCustomTo}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Total Orders"
          value={String(totalOrders)}
          trend={{ value: "Across all orders", positive: true }}
          icon={ShoppingCart}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          trend={{ value: `${totalOrders} orders`, positive: true }}
          icon={DollarSign}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Pending Due"
          value={formatCurrency(totalDue)}
          subtitle={totalDue > 0 ? "Due across all orders" : "No pending dues"}
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
                {["Order No", "Date & Time", "Customer", "Items", "Total", "Received", "Due", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
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
                    <td className="px-4 py-3 text-table-body font-medium">{formatCurrency(toPriceNumber(o.total_paisa))}</td>
                    <td className="px-4 py-3 text-table-body text-success">{formatCurrency(toPriceNumber(o.amount_received_paisa))}</td>
                    <td className="px-4 py-3 text-table-body text-destructive font-medium">
                      {toPriceNumber(o.amount_due_paisa) > 0 ? formatCurrency(toPriceNumber(o.amount_due_paisa)) : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={orderStatusToStatusType(o.status)} /></td>
                    <td className="px-4 py-3 text-table-body">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenViewSheet(o)}
                          className="text-xs"
                          title="View order details"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {toPriceNumber(o.amount_due_paisa) > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPaymentDialog(o)}
                            className="text-xs"
                          >
                            Pay
                          </Button>
                        )}
                        {o.status !== "Cancelled" && o.status !== "Returned" && o.status !== "Paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenCancelDialog(o)}
                            className="text-xs text-destructive hover:text-destructive"
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
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
                  <p className="font-bold text-sm">{formatCurrency(toPriceNumber(o.total_paisa))}</p>
                  {o.amount_due_paisa > 0 && <p className="text-xs text-destructive font-medium">Due: {formatCurrency(toPriceNumber(o.amount_due_paisa))}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenViewSheet(o)}
                    className="h-7 w-7 p-0"
                    title="View order details"
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  <StatusBadge status={orderStatusToStatusType(o.status)} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
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
                    <Select value={line.product_id} onValueChange={(value) => handleProductSelect(index, value)}>
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

      {/* Payment Dialog */}
      <Dialog open={payingOrder !== null} onOpenChange={(open) => !open && setPayingOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Add a payment for order {payingOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Amount Due (Tk)</label>
              <p className="text-lg font-semibold text-muted-foreground">
                {payingOrder ? formatCurrency(toPriceNumber(payingOrder.amount_due_paisa)) : "—"}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Amount Paying (Tk) *</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={payingOrder ? toPriceNumber(payingOrder.amount_due_paisa) : undefined}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Note (Optional)</label>
              <Input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Payment note or reference"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayingOrder(null)}
              disabled={addPaymentMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitPayment}
              disabled={addPaymentMutation.isPending || !paymentAmount}
            >
              {addPaymentMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order AlertDialog */}
      <AlertDialog open={cancellingOrder !== null} onOpenChange={(open) => !open && setCancellingOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel order {cancellingOrder?.order_number}? This will restore the stock and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel disabled={cancelOrderMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmCancel}
            disabled={cancelOrderMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelOrderMutation.isPending ? "Cancelling..." : "Cancel Order"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Order Sheet */}
      <Sheet open={viewingOrder !== null} onOpenChange={(open) => !open && setViewingOrder(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Order Details</SheetTitle>
            <SheetDescription>
              {viewingOrder?.order_number}
            </SheetDescription>
          </SheetHeader>

          {viewingOrder && (
            <div className="mt-6 space-y-6">
              {/* Order Header */}
              <div className="space-y-2 border-b pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">{formatDateTime(viewingOrder.createdAt)}</p>
                  </div>
                  <StatusBadge status={orderStatusToStatusType(viewingOrder.status)} />
                </div>
              </div>

              {/* Customer */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Customer</p>
                <p className="font-medium">{viewingOrder.customer.name}</p>
                <p className="text-sm text-muted-foreground">{viewingOrder.customer.phone}</p>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Items</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left px-2 py-2">Product</th>
                        <th className="text-center px-2 py-2">Qty</th>
                        <th className="text-right px-2 py-2">Unit Price</th>
                        <th className="text-right px-2 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingOrder.lines.map((line, idx) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-2 py-2">
                            <div className="font-medium">{line.product_name}</div>
                            <div className="text-muted-foreground">{line.product_code}</div>
                            {line.vat_percent > 0 && (
                              <div className="text-muted-foreground">VAT: {line.vat_percent}%</div>
                            )}
                          </td>
                          <td className="text-center px-2 py-2">{line.qty}</td>
                          <td className="text-right px-2 py-2">{formatCurrency(toPriceNumber(line.unit_price_paisa))}</td>
                          <td className="text-right px-2 py-2 font-medium">{formatCurrency(toPriceNumber(line.line_total_paisa))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Summary */}
              <div className="space-y-2 bg-muted/30 p-3 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(toPriceNumber(viewingOrder.subtotal_paisa))}</span>
                </div>
                {toPriceNumber(viewingOrder.vat_total_paisa) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT:</span>
                    <span className="font-medium">{formatCurrency(toPriceNumber(viewingOrder.vat_total_paisa))}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                  <span>Total:</span>
                  <span>{formatCurrency(toPriceNumber(viewingOrder.total_paisa))}</span>
                </div>
              </div>

              {/* Payments */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Payments</p>
                <div className="bg-muted/30 p-3 rounded-lg space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Received:</span>
                    <span className="font-medium text-success">{formatCurrency(toPriceNumber(viewingOrder.amount_received_paisa))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Due:</span>
                    <span className="font-medium text-destructive">{formatCurrency(toPriceNumber(viewingOrder.amount_due_paisa))}</span>
                  </div>
                </div>

                {viewingOrder.payments && viewingOrder.payments.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-muted-foreground">Payment History</p>
                    {viewingOrder.payments.map((payment, idx) => (
                      <div key={idx} className="flex justify-between text-xs bg-muted/20 p-2 rounded">
                        <span>{formatDateTime(payment.date)}</span>
                        <span className="font-medium">{formatCurrency(toPriceNumber(payment.amount_paisa))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(!viewingOrder.payments || viewingOrder.payments.length === 0) && (
                  <p className="text-xs text-muted-foreground italic">No payments recorded yet.</p>
                )}
              </div>
            </div>
          )}

          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => handleOpenDeleteDialog(viewingOrder!)}
            >
              Delete Order
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Order AlertDialog */}
      <AlertDialog open={deletingOrder !== null} onOpenChange={(open) => !open && setDeletingOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete order {deletingOrder?.order_number}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel disabled={deleteOrderMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={deleteOrderMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteOrderMutation.isPending ? "Deleting..." : "Delete Order"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

