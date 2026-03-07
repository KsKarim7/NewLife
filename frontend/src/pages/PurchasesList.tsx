import { useState } from "react";
import { AxiosError } from "axios";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { formatCurrency } from "@/utils/currency";
import { getPeriodDateRange } from "@/utils/dateRangeUtils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Truck, DollarSign, AlertCircle, Plus, FileText, FileSpreadsheet, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPurchases, createPurchase, type Purchase, type PurchasesResponse } from "@/api/purchasesApi";
import { getProducts as fetchProducts } from "@/api/productsApi";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface PurchaseLineItem {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
  buying_price_paisa: number;
}

export default function PurchasesList() {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [period, setPeriod] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create Purchase form state
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [buyingPrice, setBuyingPrice] = useState("");
  const [lineItems, setLineItems] = useState<PurchaseLineItem[]>([]);
  const [paidAmount, setPaidAmount] = useState("");

  const getQueryDateRange = () => {
    if (period === "custom") {
      return { from: customFrom, to: customTo };
    }
    return { from: dateFrom, to: dateTo };
  };

  const { from: queryFrom, to: queryTo } = getQueryDateRange();

  // Fetch purchases
  const { data: purchasesData, isLoading, isError, error } = useQuery<PurchasesResponse>({
    queryKey: ["purchases", page, dateFrom, dateTo, period, customFrom, customTo],
    queryFn: () =>
      getPurchases({
        page,
        limit: 10,
        from: queryFrom || undefined,
        to: queryTo || undefined,
      }),
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
  const totalPurchases = pagination?.total ?? 0;
  const totalPages = pagination?.pages ?? 1;

  // Calculate stats
  const totalNet = purchases.reduce((sum, p) => sum + toPriceNumber(p.net_amount_paisa), 0);
  const totalPaid = purchases.reduce((sum, p) => sum + toPriceNumber(p.paid_amount_paisa), 0);
  const totalDue = purchases.reduce((sum, p) => sum + toPriceNumber(p.due_amount_paisa), 0);

  // Calculate current form values
  const netAmount = lineItems.reduce((sum, item) => {
    return sum + item.qty * paisaToTaka(item.buying_price_paisa);
  }, 0);

  const dueAmount = netAmount - (paidAmount ? parseFloat(paidAmount) : 0);

  // Create Purchase mutation
  const createPurchaseMutation = useMutation({
    mutationFn: async () => {
      if (lineItems.length === 0) {
        throw new Error("Add at least one product to the purchase");
      }

      const payload = {
        date: purchaseDate ? purchaseDate : undefined,
        lines: lineItems.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          buying_price: paisaToTaka(item.buying_price_paisa).toFixed(2),
        })),
        paid_amount: paidAmount ? parseFloat(paidAmount) : 0,
      };

      return createPurchase(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setIsCreateSheetOpen(false);
      // Reset form
      setPurchaseDate(new Date().toISOString().split("T")[0]);
      setSelectedProduct("");
      setQuantity(1);
      setBuyingPrice("");
      setLineItems([]);
      setPaidAmount("");
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

  const handleAddLineItem = () => {
    if (!selectedProduct || quantity <= 0 || !buyingPrice) {
      toast({
        title: "Invalid product, quantity, or price",
        variant: "destructive",
      });
      return;
    }

    const product = products.find((p) => p._id === selectedProduct);
    if (!product) return;

    const buyingPriceTaka = parseFloat(buyingPrice);
    const buyingPricePaisa = Math.round(buyingPriceTaka * 100);

    setLineItems([
      ...lineItems,
      {
        product_id: product._id,
        product_code: product.product_code,
        product_name: product.name,
        qty: quantity,
        buying_price_paisa: buyingPricePaisa,
      },
    ]);

    setSelectedProduct("");
    setQuantity(1);
    setBuyingPrice("");
  };

  const handlePeriodChange = (value: string) => {
    let next = "7d";
    if (value === "today") next = "today";
    else if (value === "30") next = "30d";
    else if (value === "month") next = "month";
    else if (value === "custom") next = "custom";
    setPeriod(next);
    
    // Update date inputs based on period
    if (next === "custom") {
      // For custom, dates come from Header (customFrom/customTo)
      setDateFrom("");
      setDateTo("");
    } else {
      const { from, to } = getPeriodDateRange(next) || { from: "", to: "" };
      setDateFrom(from);
      setDateTo(to);
    }
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Export purchases as CSV
  const handleExportCSV = () => {
    const headers = ["Purchase No", "Date", "Products", "Net Amount", "Paid", "Due"];
    const rows = purchases.map((p) => [
      p.purchase_number,
      new Date(p.date).toLocaleDateString(),
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
        Date: new Date(p.date).toLocaleDateString(),
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
      periodValue={period === "today" ? "today" : period === "7d" ? "7" : period === "30d" ? "30" : period === "month" ? "month" : "custom"}
      onPeriodChange={handlePeriodChange}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFromChange={setCustomFrom}
      onCustomToChange={setCustomTo}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Total Purchases"
          value={formatCurrency(totalNet)}
          trend={{ value: `${totalPurchases} purchases`, positive: true }}
          icon={Truck}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(totalPaid)}
          trend={{ value: "This month", positive: true }}
          icon={DollarSign}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Total Due"
          value={formatCurrency(totalDue)}
          subtitle={`${purchases.filter((p) => toPriceNumber(p.due_amount_paisa) > 0).length} pending`}
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

      {/* Date Range Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs text-muted-foreground mb-1 block">From Date</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs text-muted-foreground mb-1 block">To Date</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {(dateFrom || dateTo) && (
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setPage(1);
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Purchase No", "Date", "Products", "Net Amount", "Paid", "Due"].map((h) => (
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
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
                    <td className="px-4 py-3 text-table-body text-muted-foreground">{new Date(p.date).toLocaleString()}</td>
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
                  <p className="text-xs text-muted-foreground">{new Date(p.date).toLocaleDateString()}</p>
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

            {/* Add Products */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Add Products</h3>

              <div className="space-y-2 mb-3">
                <label className="text-sm font-medium">Select Product</label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name} ({p.product_code}) - Stock: {p.stock_qty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 mb-3">
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="space-y-2 mb-3">
                <label className="text-sm font-medium">Buying Price (Taka)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter buying price per unit"
                  value={buyingPrice}
                  onChange={(e) => setBuyingPrice(e.target.value)}
                />
              </div>

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
              disabled={createPurchaseMutation.isPending || lineItems.length === 0}
            >
              {createPurchaseMutation.isPending ? "Recording..." : "Record Purchase"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
