import { useState, useMemo } from "react";
import { AxiosError } from "axios";
import { usePeriod } from "@/context/PeriodContext";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { getPeriodDateRange } from "@/utils/dateRangeUtils";
import { Package, Plus, FileText, FileSpreadsheet, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPurchaseReturns, createPurchaseReturn, type PurchaseReturn, type PurchaseReturnsResponse } from "@/api/purchaseReturnsApi";
import { getPurchases } from "@/api/purchasesApi";
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

interface ReturnLineItem {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
}

interface AxiosErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

export default function PurchaseReturnsList() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const { period, customFrom, setCustomFrom, customTo, setCustomTo } = usePeriod();
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create Return form state
  const [purchaseNumber, setPurchaseNumber] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lineItems, setLineItems] = useState<ReturnLineItem[]>([]);

  const getDateRange = () => {
    if (period === "custom") {
      return { from: customFrom, to: customTo };
    }
    const range = getPeriodDateRange(period);
    return range || { from: "", to: "" };
  };

  const { from: fromDate, to: toDate } = getDateRange();
  const shouldFetch = period !== "custom" || !!(customFrom && customTo);

  // Fetch purchase returns
  const { data: returnsData, isLoading } = useQuery<PurchaseReturnsResponse>({
    queryKey: ["purchaseReturns", page, fromDate, toDate],
    queryFn: () =>
      getPurchaseReturns({
        page,
        limit: 10,
        from: fromDate || undefined,
        to: toDate || undefined,
      }),
    enabled: shouldFetch,
  });

  // Fetch purchases for selection
  const { data: purchasesData } = useQuery({
    queryKey: ["purchases", "all"],
    queryFn: () =>
      getPurchases({
        limit: 100,
      }),
  });

  // Fetch products for return creation
  const { data: productsData } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () =>
      fetchProducts({
        limit: 100,
      }),
  });

  const purchaseReturns = returnsData?.returns ?? [];
  const purchases = purchasesData?.purchases ?? [];
  const products = productsData?.products ?? [];
  const pagination = returnsData?.pagination;
  const summary = returnsData?.summary ?? { total_returns: 0, total_qty_returned: 0 };
  const totalReturns = summary?.total_returns ?? 0;
  const totalPages = pagination?.pages ?? 1;
  const totalQtyReturned = summary?.total_qty_returned ?? 0;

  const rangeText = useMemo(() => {
    if (!totalReturns) return "Showing 0 results";
    const limit = pagination?.limit ?? 10;
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, totalReturns);
    return `Showing ${start}–${end} of ${totalReturns} results`;
  }, [page, totalReturns, pagination?.limit]);

  // Build period label for stat cards
  const periodLabel = period === 'all'    ? 'All time'      :
                      period === 'today'  ? 'Today'         :
                      period === '7d'     ? 'Last 7 days'   :
                      period === '30d'    ? 'Last 30 days'  :
                      period === 'month'  ? 'This month'    :
                      period === 'custom' ? 'Custom range'  : '';

  // Filter by search term locally
  const filteredReturns = purchaseReturns.filter(r =>
    r.return_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.purchase_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Create Return mutation
  const createReturnMutation = useMutation({
    mutationFn: async () => {
      if (!purchaseNumber) {
        throw new Error("Purchase number is required");
      }
      if (lineItems.length === 0) {
        throw new Error("Add at least one product to the return");
      }

      return createPurchaseReturn({
        purchase_number: purchaseNumber,
        lines: lineItems.map(item => ({
          product_id: item.product_id,
          qty: item.qty,
        })),
        date: new Date().toISOString().split("T")[0],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseReturns"] });
      setIsCreateSheetOpen(false);
      // Reset form
      setPurchaseNumber("");
      setSelectedProduct("");
      setQuantity(1);
      setLineItems([]);
      toast({
        title: "Return created successfully",
      });
    },
    onError: (error: AxiosError) => {
      const errorMessage = (error as AxiosErrorResponse)?.response?.data?.message || (error as Error)?.message || "Something went wrong";
      toast({
        title: "Failed to create return",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleAddLineItem = () => {
    if (!selectedProduct || quantity <= 0) {
      toast({
        title: "Invalid product or quantity",
        variant: "destructive",
      });
      return;
    }

    const product = products.find(p => p._id === selectedProduct);
    if (!product) return;

    setLineItems([
      ...lineItems,
      {
        product_id: product._id,
        product_code: product.product_code,
        product_name: product.name,
        qty: quantity,
      },
    ]);

    setSelectedProduct("");
    setQuantity(1);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Export returns as CSV
  const handleExportCSV = () => {
    const headers = ["Return No", "Purchase No", "Date", "Items", "Qty"];
    const rows = filteredReturns.map(r => [
      r.return_number,
      r.purchase_number,
      new Date(r.date).toLocaleDateString(),
      r.lines.map(l => l.product_name).join(", "),
      r.lines.reduce((sum, l) => sum + l.qty, 0),
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-returns-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openAddSheet = () => {
    setPurchaseNumber("");
    setSelectedProduct("");
    setQuantity(1);
    setLineItems([]);
    setIsCreateSheetOpen(true);
  };

  return (
    <PageLayout 
      title="Purchase Returns" 
      searchPlaceholder="Search purchase returns..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard label="Total Returns" value={totalReturns.toString()} trend={{ value: periodLabel, positive: true }} icon={Package} iconColor="text-primary" iconBg="bg-primary/10" />
        <StatCard label="Total Units Returned" value={totalQtyReturned.toString()} subtitle={`${totalReturns} returns · ${periodLabel}`} icon={Package} iconColor="text-success" iconBg="bg-success/10" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
        <Button className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90" onClick={openAddSheet}>
          <Plus className="h-4 w-4 mr-1" /> Add Return
        </Button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Return No", "Purchase No", "Date", "Items", "Qty Returned", "Actions"].map(h => (
                  <th key={h} className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center">
                    <Skeleton className="h-12 w-full" />
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-muted-foreground">No purchase returns found</td>
                </tr>
              ) : (
                filteredReturns.map((r, i) => (
                  <tr key={r._id} className={`border-b border-border last:border-0 hover:bg-row-hover transition-colors ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                    <td className="px-4 py-3 text-table-body font-medium text-secondary">{r.return_number}</td>
                    <td className="px-4 py-3 text-table-body">{r.purchase_number}</td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">{r.lines.length}</td>
                    <td className="px-4 py-3 text-table-body">{r.lines.reduce((sum, l) => sum + l.qty, 0)}</td>
                    <td className="px-4 py-3 text-table-body text-secondary hover:underline cursor-pointer">View</td>
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
          <>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </>
        ) : filteredReturns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No purchase returns found</div>
        ) : (
          filteredReturns.map((r) => (
            <div key={r._id} className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-start justify-between mb-1">
                <p className="font-semibold text-sm text-secondary">{r.return_number}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString()}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate mb-2">Ref: {r.purchase_number}</p>
              <p className="font-bold text-sm">{r.lines.reduce((sum, l) => sum + l.qty, 0)} units</p>
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

      {/* Create Return Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent side="right" className="w-full sm:w-[540px] flex flex-col">
          <SheetHeader>
            <SheetTitle>Create Purchase Return</SheetTitle>
            <SheetDescription>Record products being returned to the supplier</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-4 overflow-y-auto">
            {/* Purchase Number */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Purchase Number *</label>
              <Select value={purchaseNumber} onValueChange={setPurchaseNumber}>
                <SelectTrigger>
                  <SelectValue placeholder="Select purchase" />
                </SelectTrigger>
                <SelectContent>
                  {purchases.map(p => (
                    <SelectItem key={p._id} value={p.purchase_number}>
                      {p.purchase_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Select Product</label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product to return" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                placeholder="Enter quantity"
              />
            </div>

            {/* Add Line Button */}
            <Button
              variant="outline"
              onClick={handleAddLineItem}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" /> Add Product to Return
            </Button>

            {/* Line Items List */}
            {lineItems.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Return Items</label>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.product_code} — Qty: {item.qty}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveLineItem(idx)}
                      className="text-destructive hover:bg-destructive/10 p-1 rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateSheetOpen(false)}
              disabled={createReturnMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createReturnMutation.mutate()}
              disabled={createReturnMutation.isPending || lineItems.length === 0 || !purchaseNumber}
            >
              {createReturnMutation.isPending ? "Creating..." : "Create Return"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
