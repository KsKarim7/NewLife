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
import { ShoppingCart, DollarSign, AlertCircle, Plus, FileText, FileSpreadsheet, X, Eye, Printer, ChevronsUpDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { usePeriod } from "@/context/PeriodContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getOrders, type Order, type OrdersResponse, createOrder, type CreateOrderPayload, addPayment, cancelOrder, deleteOrder } from "@/api/ordersApi";
import { getCustomers, type Customer } from "@/api/customersApi";
import { getProducts, type Product } from "@/api/productsApi";
import { getSettings } from "@/api/settingsApi";
import {
  printViaUSB,
  printViaBluetooth,
  printViaWindowPrint,
  buildReceiptLines,
  buildReceiptText,
  type ReceiptData,
} from "@/utils/thermalPrinter";

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
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo } = usePeriod();

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

  // Product search state for combobox
  const [productSearch, setProductSearch] = useState('');
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);

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

  // Print receipt dialog state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printTargetOrder, setPrintTargetOrder] = useState<Order | null>(null);

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
    queryKey: ["orders", page, statusFilter, fromDate, toDate],
    queryFn: () =>
      getOrders({
        page,
        limit: 10,
        status: statusFilter || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      }),
    enabled: shouldFetch,
  });

  // Fetch period-aware stats independently (no status filter)
  const { data: statsData } = useQuery<OrdersResponse>({
    queryKey: ["orders-stats", fromDate, toDate],
    queryFn: () =>
      getOrders({
        page: 1,
        limit: 1,
        from: fromDate || undefined,
        to: toDate || undefined,
      }),
    enabled: shouldFetch,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers"],
    queryFn: () => getCustomers({ limit: 100 }),
  });

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts({ limit: 100 }),
  });

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
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

  // Get period-aware stats from summary
  const summaryData = statsData?.summary;
  const totalOrders = summaryData?.total_orders ?? 0;
  const totalRevenue = parseFloat(summaryData?.total_revenue ?? "0");
  const totalDue = Math.max(0, parseFloat(summaryData?.total_due ?? "0"));

  // Build period label for stat cards
  const periodLabel = period === 'all'    ? 'All time'      :
                      period === 'today'  ? 'Today'         :
                      period === '7d'     ? 'Last 7 days'   :
                      period === '30d'    ? 'Last 30 days'  :
                      period === 'month'  ? 'This month'    :
                      period === 'custom' ? 'Custom range'  : '';

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
    setProductSearch("");
    setProductPopoverOpen(false);
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
    // Reset search and close popover after selection
    setProductSearch("");
    setProductPopoverOpen(false);
  };

  // Filter products for combobox based on search
  const filteredProducts = (productsData?.products ?? []).filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_code?.toLowerCase().includes(productSearch.toLowerCase())
  );

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

  const buildReceiptData = (order: Order): ReceiptData => {
    const totalNum = Math.max(0, toPriceNumber(order.total_paisa));
    const paidNum = Math.max(0, toPriceNumber(order.amount_received_paisa));
    const dueNum = Math.max(0, totalNum - paidNum);

    const fmt = (val: number) => `Tk ${val.toFixed(2)}`;
    const fmtLine = (val: string | number) =>
      `Tk ${Math.max(0, toPriceNumber(val)).toFixed(2)}`;

    const d = new Date(order.createdAt);
    const datePart = d.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const dateStr = `${datePart} | ${timePart}`;

    const year = new Date(order.createdAt).getFullYear();
    const num = order.order_number.replace("ORD-", "").padStart(4, "0");

    return {
      storeName: settingsData?.store_info?.store_name ?? "YOUR SHOP NAME",
      storeAddress:
        settingsData?.store_info?.physical_address ?? "123 Business Road, City",
      storePhone: settingsData?.store_info?.phone_number ?? "",
      salesRep: settingsData?.store_info?.owner_name ?? "Staff",
      orderNumber: order.order_number,
      invoiceId: `INV-${year}-${num}`,
      dateStr,
      statusLabel:
        order.status === "Paid"
          ? "PAID"
          : order.status === "Partially Paid"
            ? "PARTIAL"
            : order.status === "Confirmed"
              ? "PENDING"
              : order.status === "Cancelled"
                ? "CANCELLED"
                : order.status.toUpperCase(),
      items: order.lines.map((l) => ({
        name: l.product_name,
        qty: l.qty,
        price: fmtLine(l.unit_price_paisa),
        total: fmtLine(l.line_total_paisa),
      })),
      totalAmount: fmt(totalNum),
      paidAmount: fmt(paidNum),
      dueAmount: fmt(dueNum),
    };
  };

  const printReceipt = (order: Order) => {
    setPrintTargetOrder(order);
    setShowPrintDialog(true);
  };

  const handlePrintMethod = async (method: "usb" | "bluetooth" | "window") => {
    if (!printTargetOrder) return;
    setShowPrintDialog(false);
    setPrintTargetOrder(null);
    const data = buildReceiptData(printTargetOrder);

    try {
      if (method === "usb") {
        await printViaUSB(buildReceiptLines(data));
        toast({ title: "Receipt printed successfully via USB" });
      } else if (method === "bluetooth") {
        await printViaBluetooth(buildReceiptLines(data));
        toast({ title: "Receipt printed successfully via Bluetooth" });
      } else {
        printViaWindowPrint(
          buildReceiptText(data),
          printTargetOrder.order_number
        );
      }
    } catch (err: unknown) {
      toast({
        title: "Print failed",
        description:
          (err instanceof Error ? err.message : null) ??
          "Could not connect to printer.",
        variant: "destructive",
      });
    }
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
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Total Orders"
          value={String(totalOrders)}
          trend={{ value: periodLabel, positive: true }}
          icon={ShoppingCart}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          trend={{ value: `${totalOrders} orders · ${periodLabel}`, positive: true }}
          icon={DollarSign}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Pending Due"
          value={formatCurrency(totalDue)}
          subtitle={totalDue > 0 ? `Due · ${periodLabel}` : "No pending dues"}
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
                    <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-border rounded-md bg-background hover:bg-muted transition-colors h-8"
                        >
                          <span className={line.product_id ? 'text-foreground text-sm' : 'text-muted-foreground text-sm'}>
                            {line.product_id
                              ? (() => {
                                  const product = (productsData?.products ?? []).find(p => p._id === line.product_id);
                                  return product ? `${product.name} (${product.product_code})` : 'Select product';
                                })()
                              : 'Search product...'}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Type product name or code..."
                            value={productSearch}
                            onValueChange={setProductSearch}
                          />
                          <CommandList className="max-h-48 overflow-y-auto">
                            <CommandEmpty>No products found.</CommandEmpty>
                            {filteredProducts.map((product) => (
                              <CommandItem
                                key={product._id}
                                value={product.name}
                                onSelect={() => handleProductSelect(index, product._id)}
                              >
                                <div className="flex flex-col w-full">
                                  <span className="text-sm font-medium">{product.name}</span>
                                  <span className="text-xs text-muted-foreground">{product.product_code}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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

                  {/* Line Total Preview */}
                  {(() => {
                    const qty = parseFloat(String(line.qty)) || 0;
                    const price = parseFloat(line.unit_price) || 0;
                    const lineTotal = qty * price;
                    return lineTotal > 0 ? (
                      <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted border border-border">
                        <span className="text-sm text-muted-foreground">Line Total</span>
                        <span className="text-sm font-semibold text-foreground">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              ))}

              {/* Order Subtotal Preview */}
              {(() => {
                const completedTotal = orderLines.reduce((sum, line) => {
                  const qty = parseFloat(String(line.qty)) || 0;
                  const price = parseFloat(line.unit_price) || 0;
                  return sum + (qty * price);
                }, 0);
                return (completedTotal > 0) ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 border border-border border-dashed">
                    <span className="text-sm text-muted-foreground">Order Subtotal</span>
                    <span className="text-sm font-medium text-foreground">
                      {formatCurrency(completedTotal)}
                    </span>
                  </div>
                ) : null;
              })()}
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

          <div className="flex flex-col gap-2 pt-4 border-t border-border mt-4">
            <div className="flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => viewingOrder && printReceipt(viewingOrder)}
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                USB &amp; Bluetooth require Chrome or Edge
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => handleOpenDeleteDialog(viewingOrder!)}
            >
              Delete Order
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Print Receipt AlertDialog */}
      <AlertDialog
        open={showPrintDialog}
        onOpenChange={(open) => {
          setShowPrintDialog(open);
          if (!open) setPrintTargetOrder(null);
        }}
      >
        <AlertDialogContent className="max-w-xs rounded-2xl p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <AlertDialogTitle className="text-lg font-semibold text-center">
              Print Receipt
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground text-center mt-1">
              How is your thermal printer connected?
            </AlertDialogDescription>
          </div>

          <div className="flex flex-col px-4 pb-2 gap-2">
            <button
              type="button"
              onClick={() => handlePrintMethod("usb")}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-left"
            >
              <span className="text-xl">🔌</span>
              <div>
                <p className="text-sm font-medium">USB Cable</p>
                <p className="text-xs text-muted-foreground">Direct print · Chrome or Edge only</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePrintMethod("bluetooth")}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-left"
            >
              <span className="text-xl">📶</span>
              <div>
                <p className="text-sm font-medium">Bluetooth</p>
                <p className="text-xs text-muted-foreground">Direct print · Chrome or Edge only</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePrintMethod("window")}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-left"
            >
              <span className="text-xl">🖨️</span>
              <div>
                <p className="text-sm font-medium">System Print Dialog</p>
                <p className="text-xs text-muted-foreground">Works in any browser</p>
              </div>
            </button>
          </div>

          <div className="px-4 pb-5 pt-1">
            <AlertDialogCancel className="w-full rounded-xl border border-border text-sm font-medium">
              Cancel
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

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

