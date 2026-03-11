import { useState } from "react";
import { AxiosError } from "axios";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/utils/currency";
import { formatDate, formatDateTime } from "@/utils/formatDate";
import { getPeriodDateRange } from "@/utils/dateRangeUtils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Truck, DollarSign, AlertCircle, Plus, FileText, FileSpreadsheet, Trash2, Eye, ChevronsUpDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePeriod } from "@/context/PeriodContext";
import { getPurchases, createPurchase, addPurchasePayment, cancelPurchase, type Purchase, type PurchasesResponse } from "@/api/purchasesApi";
import { getProducts as fetchProducts } from "@/api/productsApi";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useToast } from "@/components/ui/use-toast";

const paisaToTaka = (paisa: number) => {
  return paisa / 100;
};

const toPriceNumber = (value: string | number): number => {
  if (typeof value === "string") {
    return parseFloat(value);
  }
  return paisaToTaka(value);
};

interface AxiosErrorType {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

interface PurchaseLineItem {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
  selling_price_paisa: number;
  buying_price_paisa: number;
}

export default function PurchasesList() {
  const [page, setPage] = useState(1);
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo } = usePeriod();
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  // Payment and cancel dialog state
  const [payingPurchase, setPayingPurchase] = useState<Purchase | null>(null);
  const [cancellingPurchase, setCancellingPurchase] = useState<Purchase | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  // View purchase sheet state
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create Purchase form state
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [partyName, setPartyName] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lineItems, setLineItems] = useState<PurchaseLineItem[]>([]);
  const [paidAmount, setPaidAmount] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");

  // Product search state for combobox
  const [productSearch, setProductSearch] = useState('');
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);

  const getQueryDateRange = () => {
    if (period === "custom") {
      return { from: customFrom, to: customTo };
    }
    const range = getPeriodDateRange(period);
    return range || { from: "", to: "" };
  };

  const { from: queryFrom, to: queryTo } = getQueryDateRange();

  const shouldFetch = period !== "custom" || !!(customFrom && customTo);

  // Fetch purchases
  const { data: purchasesData, isLoading, isError, error } = useQuery<PurchasesResponse>({
    queryKey: ["purchases", page, queryFrom, queryTo],
    queryFn: () =>
      getPurchases({
        page,
        limit: 10,
        from: queryFrom || undefined,
        to: queryTo || undefined,
      }),
    enabled: shouldFetch,
  });

  // Fetch products for dropdown
  const { data: productsData } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () =>
      fetchProducts({
        limit: 100,
      }),
  });

  const purchases = purchasesData?.purchases ?? [];
  const products = productsData?.products ?? [];
  const pagination = purchasesData?.pagination;
  const summary = purchasesData?.summary ?? { net_amount: '0.00', paid_amount: '0.00', due_amount: '0.00', total_purchases: 0 };
  const totalPurchases = summary?.total_purchases ?? 0;
  const totalPages = pagination?.pages ?? 1;

  // Get period-aware stats from summary
  const totalNet = parseFloat(summary?.net_amount ?? "0");
  const totalPaid = parseFloat(summary?.paid_amount ?? "0");
  const totalDue = parseFloat(summary?.due_amount ?? "0");

  // Build period label for stat cards
  const periodLabel = period === 'all'    ? 'All time'      :
                      period === 'today'  ? 'Today'         :
                      period === '7d'     ? 'Last 7 days'   :
                      period === '30d'    ? 'Last 30 days'  :
                      period === 'month'  ? 'This month'    :
                      period === 'custom' ? 'Custom range'  : '';

  // Filter products for combobox based on search
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_code?.toLowerCase().includes(productSearch.toLowerCase())
  );

  // Calculate current form values
  const netAmount = lineItems.reduce((sum, item) => {
    return sum + item.qty * paisaToTaka(item.buying_price_paisa);
  }, 0);

  const dueAmount = netAmount - (paidAmount ? parseFloat(paidAmount) : 0);

  // Create Purchase mutation
  const createPurchaseMutation = useMutation({
    mutationFn: async () => {
      if (!partyName.trim()) {
        throw new Error("Supplier/Party name is required");
      }
      if (lineItems.length === 0) {
        throw new Error("Add at least one product to the purchase");
      }

      const payload = {
        party_name: partyName,
        date: purchaseDate ? purchaseDate : undefined,
        lines: lineItems.map((item) => ({
          product_id: item.product_id,
          product_code: item.product_code,
          product_name: item.product_name,
          qty: item.qty,
          selling_price_paisa: item.selling_price_paisa,
          buying_price_paisa: item.buying_price_paisa,
        })),
        paid_amount: paidAmount ? parseFloat(paidAmount) : 0,
        note: purchaseNote || undefined,
      };

      return createPurchase(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setIsCreateSheetOpen(false);
      // Reset form
      setPurchaseDate(new Date().toISOString().split("T")[0]);
      setPartyName("");
      setSelectedProduct("");
      setQuantity(1);
      setLineItems([]);
      setPaidAmount("");
      setPurchaseNote("");
      toast({
        title: "Purchase recorded successfully",
      });
    },
    onError: (error: AxiosError) => {
      const description = error.message || "Something went wrong";
      toast({
        title: "Failed to record purchase",
        description: description,
        variant: "destructive",
      });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) =>
      addPurchasePayment(id, { amount, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"], exact: false });
      toast({ title: "Payment recorded successfully" });
      setPayingPurchase(null);
      setPaymentAmount("");
      setPaymentNote("");
    },
    onError: (error: unknown) => {
      const errorMessage = (error as AxiosErrorType)?.response?.data?.message || (error as Error)?.message || "Something went wrong";
      toast({
        title: "Failed to record payment",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const cancelPurchaseMutation = useMutation({
    mutationFn: (id: string) => cancelPurchase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"], exact: false });
      toast({ title: "Purchase cancelled successfully" });
      setCancellingPurchase(null);
    },
    onError: (error: unknown) => {
      const errorMessage = (error as AxiosErrorType)?.response?.data?.message || (error as Error)?.message || "Something went wrong";
      toast({
        title: "Failed to cancel purchase",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleAddLineItem = () => {
    if (!selectedProduct || quantity <= 0) {
      toast({
        title: "Invalid selection",
        description: "Product and quantity are required",
        variant: "destructive",
      });
      return;
    }

    const product = products.find((p) => p._id === selectedProduct);
    if (!product) return;

    const buyingPrice = parseFloat(product.buying_price_taka ?? "0") || 0;
    const sellingPrice = parseFloat(product.selling_price_taka ?? "0") || 0;

    const sellingPricePaisa = Math.round(sellingPrice * 100);
    const buyingPricePaisa = Math.round(buyingPrice * 100);

    setLineItems([
      ...lineItems,
      {
        product_id: product._id,
        product_code: product.product_code,
        product_name: product.name,
        qty: quantity,
        selling_price_paisa: sellingPricePaisa,
        buying_price_paisa: buyingPricePaisa,
      },
    ]);

    setSelectedProduct("");
    setQuantity(1);
    setProductSearch("");
    setProductPopoverOpen(false);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleOpenPaymentDialog = (purchase: Purchase) => {
    const amountDue = toPriceNumber(purchase.due_amount_paisa);
    setPayingPurchase(purchase);
    setPaymentAmount(amountDue.toFixed(2));
    setPaymentNote("");
  };

  const handleSubmitPayment = () => {
    if (!payingPurchase) return;

    const enteredAmount = parseFloat(paymentAmount || "0");
    const dueAmount = toPriceNumber(payingPurchase.due_amount_paisa);

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
      id: payingPurchase._id,
      amount,
      note: paymentNote || undefined,
    });
  };

  const handleOpenCancelDialog = (purchase: Purchase) => {
    setCancellingPurchase(purchase);
  };

  const handleConfirmCancel = () => {
    if (!cancellingPurchase) return;
    cancelPurchaseMutation.mutate(cancellingPurchase._id);
  };

  const handleOpenViewSheet = (purchase: Purchase) => {
    setViewingPurchase(purchase);
  };

  // Export purchases as CSV
  const handleExportCSV = () => {
    const headers = ["Purchase No", "Date", "Products", "Net Amount", "Paid", "Due"];
    const rows = purchases.map((p) => [
      p.purchase_number,
      formatDate(p.date),
      p.lines.map((l) => `${l.product_name} (${l.qty})`).join(", "),
      toPriceNumber(p.net_amount_paisa).toFixed(2),
      toPriceNumber(p.paid_amount_paisa).toFixed(2),
      toPriceNumber(p.due_amount_paisa).toFixed(2),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchases-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Purchases exported",
      description: `Exported ${purchases.length} purchases as CSV`,
    });
  };

  // Export purchases as Excel
  const handleExportExcel = async () => {
    try {
      const data = purchases.map((p) => ({
        "Purchase No": p.purchase_number,
        Date: formatDate(p.date),
        Items: p.lines.length,
        "Net Amount (Taka)": toPriceNumber(p.net_amount_paisa).toFixed(2),
        "Paid (Taka)": toPriceNumber(p.paid_amount_paisa).toFixed(2),
        "Due (Taka)": toPriceNumber(p.due_amount_paisa).toFixed(2),
      }));

      const headers = Object.keys(data[0] || {});
      const csv = [
        headers.join(","),
        ...data.map((row) => headers.map((h) => `"${row[h as keyof typeof row]}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchases-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Purchases exported",
        description: `Exported ${purchases.length} purchases as Excel`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        variant: "destructive",
      });
    }
  };

  function purchaseStatusToStatusType(status: string): import("@/components/shared/StatusBadge").StatusType {
    switch (status) {
      case "Pending":
        return "confirmed";
      case "Partially Paid":
        return "partial";
      case "Paid":
        return "paid";
      case "Cancelled":
        return "cancelled";
      default:
        return "confirmed";
    }
  }

  if (isError) {
    return (
      <PageLayout title="Purchases" searchPlaceholder="Search purchases...">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          Error loading purchases: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Purchases" 
      searchPlaceholder="Search purchases..."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Total Purchases"
          value={String(totalPurchases)}
          trend={{ value: `${periodLabel}`, positive: true }}
          icon={Truck}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Total Spent"
          value={formatCurrency(totalNet)}
          trend={{ value: periodLabel, positive: true }}
          icon={DollarSign}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Total Due"
          value={formatCurrency(totalDue)}
          subtitle={totalDue > 0 ? `Due · ${periodLabel}` : "No pending dues"}
          icon={AlertCircle}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
      </div>

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={purchases.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={purchases.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
          </Button>
        </div>
        <Button
          className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setIsCreateSheetOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Purchase
        </Button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Purchase No", "Supplier", "Product", "Category", "Net Amount", "Paid", "Due", "Actions"].map((h) => (
                  <th key={h} className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No purchases found
                  </td>
                </tr>
              ) : (
                purchases.map((p, i) => (
                  <tr
                    key={p._id}
                    className={`border-b border-border last:border-0 hover:bg-row-hover transition-colors ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                  >
                    <td className="px-4 py-3 text-table-body font-medium text-secondary">{p.purchase_number}</td>
                    <td className="px-4 py-3 text-table-body text-foreground">{p.party_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-table-body">
                      {p.lines && p.lines.length > 0
                        ? p.lines.length === 1
                          ? p.lines[0].product_name
                          : `${p.lines[0].product_name} +${p.lines.length - 1} more`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-table-body text-card-foreground max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {p.lines.slice(0, 2).map((l, idx) => (
                          <span key={idx} className="text-xs bg-muted/50 px-2 py-1 rounded">
                            {l.product_code}
                          </span>
                        ))}
                        {p.lines.length > 2 && (
                          <span className="text-xs bg-muted/50 px-2 py-1 rounded">+{p.lines.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-table-body font-medium">{formatCurrency(toPriceNumber(p.net_amount_paisa))}</td>
                    <td className="px-4 py-3 text-table-body text-success">{formatCurrency(toPriceNumber(p.paid_amount_paisa))}</td>
                    <td className="px-4 py-3 text-table-body text-destructive font-medium">
                      {toPriceNumber(p.due_amount_paisa) > 0 ? formatCurrency(toPriceNumber(p.due_amount_paisa)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-table-body">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenViewSheet(p)}
                          className="text-xs"
                          title="View purchase details"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {toPriceNumber(p.due_amount_paisa) > 0 && p.status !== "Cancelled" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPaymentDialog(p)}
                            className="text-xs"
                          >
                            Pay
                          </Button>
                        )}
                        {p.status !== "Cancelled" && p.status !== "Paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenCancelDialog(p)}
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
        ) : purchases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No purchases found</div>
        ) : (
          purchases.map((p) => (
            <div key={p._id} className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm text-secondary">{p.purchase_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.date)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {p.lines.map((l) => l.product_code).join(", ")}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">{formatCurrency(toPriceNumber(p.net_amount_paisa))}</p>
                  {toPriceNumber(p.due_amount_paisa) > 0 && (
                    <p className="text-xs text-destructive font-medium">Due: {formatCurrency(toPriceNumber(p.due_amount_paisa))}</p>
                  )}
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
          onClick={() => setPage((p) => Math.max(1, p - 1))}
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
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      {/* Create Purchase Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent side="right" className="w-full md:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Purchase</SheetTitle>
            <SheetDescription>Record new stock replenishment</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            {/* Purchase Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Purchase Date</label>
              <Input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>

            {/* Supplier / Party Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Supplier / Party Name *</label>
              <Input
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder="Enter supplier name"
              />
            </div>

            {/* Add Products */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Add Products</h3>

              <div className="space-y-2 mb-3">
                <label className="text-sm font-medium">Select Product</label>
                <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-sm border border-border rounded-md bg-background hover:bg-muted transition-colors"
                    >
                      <span className={selectedProduct ? 'text-foreground' : 'text-muted-foreground'}>
                        {selectedProduct
                          ? (() => {
                              const product = products.find(p => p._id === selectedProduct);
                              return product ? `${product.name} (${product.product_code}) - Stock: ${product.stock_qty}` : 'Choose a product...';
                            })()
                          : 'Search product by name or code...'}
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
                            onSelect={() => {
                              setSelectedProduct(product._id);
                              setProductPopoverOpen(false);
                              setProductSearch("");
                            }}
                          >
                            <div className="flex flex-col w-full">
                              <span className="text-sm font-medium">{product.name}</span>
                              <span className="text-xs text-muted-foreground">{product.product_code} - Stock: {product.stock_qty}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2 mb-3">
                <label className="text-sm font-medium">Quantity (pcs) *</label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              {selectedProduct && (() => {
                const product = products.find(p => p._id === selectedProduct);
                if (!product) return null;

                const buyingPrice = parseFloat(product.buying_price_taka ?? "0") || 0;
                const sellingPrice = parseFloat(product.selling_price_taka ?? "0") || 0;

                return (
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted border border-border">
                      <span className="text-sm text-muted-foreground">Buying Price (from inventory)</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(buyingPrice)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted border border-border">
                      <span className="text-sm text-muted-foreground">Selling Price (from inventory)</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(sellingPrice)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Line Total Preview */}
              {selectedProduct && (() => {
                const product = products.find(p => p._id === selectedProduct);
                if (!product) return null;

                const buyingPrice = parseFloat(product.buying_price_taka ?? "0") || 0;
                const qty = parseFloat(String(quantity)) || 0;
                const lineTotal = qty * buyingPrice;

                return lineTotal > 0 ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted border border-border mb-3">
                    <span className="text-sm text-muted-foreground">Line Total</span>
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(lineTotal)}
                    </span>
                  </div>
                ) : null;
              })()}

              <Button size="sm" onClick={handleAddLineItem} className="w-full">
                Add to Purchase
              </Button>

              {/* Line Items */}
              {lineItems.length > 0 && (
                <div className="space-y-2 bg-muted/50 p-3 rounded-lg mt-4">
                  <h4 className="text-sm font-medium">Purchase Items</h4>
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.qty} x {formatCurrency(paisaToTaka(item.buying_price_paisa))} = {formatCurrency(item.qty * paisaToTaka(item.buying_price_paisa))}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLineItem(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2">
                    <p className="text-sm font-semibold">Net Amount: {formatCurrency(netAmount)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Section */}
            {lineItems.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold">Payment</h3>

                <div className="bg-muted/50 p-3 rounded space-y-2">
                  <div className="flex justify-between">
                    <p className="text-sm text-muted-foreground">Net Amount:</p>
                    <p className="font-semibold">{formatCurrency(netAmount)}</p>
                  </div>
                  <div className="flex justify-between">
                    <p className="text-sm text-muted-foreground">Paid:</p>
                    <p className="font-semibold text-success">{formatCurrency(paidAmount ? parseFloat(paidAmount) : 0)}</p>
                  </div>
                  <div className="border-t pt-2 flex justify-between">
                    <p className="text-sm text-muted-foreground font-medium">Due:</p>
                    <p className="font-semibold text-destructive">{formatCurrency(dueAmount)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount Paid (Optional)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Leave empty to record full as due</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Note (Optional)</label>
                  <Input
                    value={purchaseNote}
                    onChange={(e) => setPurchaseNote(e.target.value)}
                    placeholder="Add any purchase notes..."
                  />
                </div>
              </div>
            )}
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createPurchaseMutation.mutate()}
              disabled={createPurchaseMutation.isPending || !partyName.trim() || lineItems.length === 0}
            >
              {createPurchaseMutation.isPending ? "Recording..." : "Record Purchase"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Payment Dialog */}
      <Dialog open={payingPurchase !== null} onOpenChange={(open) => !open && setPayingPurchase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Add a payment for purchase {payingPurchase?.purchase_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Amount Due (Tk)</label>
              <p className="text-lg font-semibold text-muted-foreground">
                {payingPurchase ? formatCurrency(toPriceNumber(payingPurchase.due_amount_paisa)) : "—"}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Amount Paying (Tk) *</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={payingPurchase ? toPriceNumber(payingPurchase.due_amount_paisa) : undefined}
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
              onClick={() => setPayingPurchase(null)}
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

      {/* Cancel Purchase AlertDialog */}
      <AlertDialog open={cancellingPurchase !== null} onOpenChange={(open) => !open && setCancellingPurchase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the purchase and restore stock. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel disabled={cancelPurchaseMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmCancel}
            disabled={cancelPurchaseMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelPurchaseMutation.isPending ? "Cancelling..." : "Cancel Purchase"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Purchase Sheet */}
      <Sheet open={viewingPurchase !== null} onOpenChange={(open) => !open && setViewingPurchase(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Purchase Details</SheetTitle>
            <SheetDescription>
              {viewingPurchase?.purchase_number}
            </SheetDescription>
          </SheetHeader>

          {viewingPurchase && (
            <div className="mt-6 space-y-6">
              {/* Purchase Header */}
              <div className="space-y-2 border-b pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">{formatDateTime(viewingPurchase.date)}</p>
                  </div>
                  <StatusBadge status={purchaseStatusToStatusType(viewingPurchase.status)} />
                </div>
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
                      {viewingPurchase.lines.map((line, idx) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-2 py-2">
                            <div className="font-medium">{line.product_name}</div>
                            <div className="text-muted-foreground">{line.product_code}</div>
                          </td>
                          <td className="text-center px-2 py-2">{line.qty}</td>
                          <td className="text-right px-2 py-2">{formatCurrency(toPriceNumber(line.buying_price_paisa))}</td>
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
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium">{formatCurrency(toPriceNumber(viewingPurchase.net_amount_paisa))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paid:</span>
                  <span className="font-medium text-success">{formatCurrency(toPriceNumber(viewingPurchase.paid_amount_paisa))}</span>
                </div>
                <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                  <span>Due:</span>
                  <span className="text-destructive">{formatCurrency(toPriceNumber(viewingPurchase.due_amount_paisa))}</span>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
