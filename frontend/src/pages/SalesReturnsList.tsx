import { useState } from "react";
import { AxiosError } from "axios";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Package, Plus, FileText, FileSpreadsheet, Trash2, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSalesReturns, createSalesReturn, type SalesReturn } from "@/api/salesReturnsApi";
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
import type { StatusType } from "@/components/shared/StatusBadge";

interface ReturnLineItem {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
}

// Convert status to StatusBadge StatusType
const returnStatusToStatusType = (status: string): StatusType => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus === "pending") return "confirmed";
  if (lowerStatus === "completed") return "paid";
  if (lowerStatus === "returned") return "returned";
  if (lowerStatus === "cancelled") return "cancelled";
  return "confirmed";
};

export default function SalesReturnsList() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create Return form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [returnNotes, setReturnNotes] = useState("");
  const [lineItems, setLineItems] = useState<ReturnLineItem[]>([]);

  // Fetch sales returns
  const { data: returnsData, isLoading, isError, error } = useQuery({
    queryKey: ["sales-returns", page],
    queryFn: () =>
      getSalesReturns({
        page,
        limit: 10,
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

  const salesReturns = returnsData?.returns ?? [];
  const products = productsData?.products ?? [];
  const pagination = returnsData?.pagination;
  const totalReturns = pagination?.total ?? 0;
  const totalPages = pagination?.pages ?? 1;

  // Calculate stats
  const totalQtyReturned = salesReturns.reduce((sum, r) => sum + r.lines.reduce((lineSum, l) => lineSum + l.qty, 0), 0);

  // Filter by search term locally
  const filteredReturns = salesReturns.filter(r =>
    r.return_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.original_order_ref && r.original_order_ref.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Create Return mutation
  const createReturnMutation = useMutation({
    mutationFn: async () => {
      if (!customerName) {
        throw new Error("Customer name is required");
      }
      if (lineItems.length === 0) {
        throw new Error("Add at least one product to the return");
      }

      return createSalesReturn({
        customer_name: customerName,
        customer_phone: customerPhone,
        original_order_ref: orderRef || undefined,
        lines: lineItems.map(item => ({
          product_id: item.product_id,
          qty: item.qty,
        })),
        return_date: new Date().toISOString().split("T")[0],
        notes: returnNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-returns"] });
      setIsCreateSheetOpen(false);
      // Reset form
      setCustomerName("");
      setCustomerPhone("");
      setOrderRef("");
      setSelectedProduct("");
      setQuantity(1);
      setReturnNotes("");
      setLineItems([]);
      toast({
        title: "Return created successfully",
      });
    },
    onError: (error: AxiosError) => {
      let description = error.message || "Something went wrong";

      if (error.response?.status === 400) {
        const msg = (error.response?.data as { message?: string })?.message;
        description = msg || "Failed to create return";
      }

      toast({
        title: "Failed to create return",
        description: description,
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
    const headers = ["Return No", "Date", "Customer", "Order Ref", "Items", "Qty", "Notes"];
    const rows = filteredReturns.map(r => [
      r.return_number,
      new Date(r.return_date).toLocaleDateString(),
      r.customer.name,
      r.original_order_ref || "-",
      r.lines.map(l => l.product_name).join(", "),
      r.lines.reduce((sum, l) => sum + l.qty, 0),
      r.notes || "-",
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-returns-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Returns exported",
      description: `Exported ${filteredReturns.length} returns as CSV`,
    });
  };

  // Export returns as Excel (simple CSV conversion)
  const handleExportExcel = async () => {
    try {
      const data = filteredReturns.map(r => ({
        "Return No": r.return_number,
        "Date": new Date(r.return_date).toLocaleDateString(),
        "Customer": r.customer.name,
        "Phone": r.customer.phone || "-",
        "Order Ref": r.original_order_ref || "-",
        "Items": r.lines.map(l => l.product_name).join(", "),
        "Total Qty": r.lines.reduce((sum, l) => sum + l.qty, 0),
        "Notes": r.notes || "-",
      }));

      const headers = Object.keys(data[0] || {});
      const csv = [
        headers.join(","),
        ...data.map(row => headers.map(h => `"${row[h as keyof typeof row]}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-returns-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Returns exported",
        description: `Exported ${filteredReturns.length} returns as Excel`,
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
      <PageLayout title="Sales Returns" searchPlaceholder="Search returns...">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          Error loading returns: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Sales Returns"
      searchPlaceholder="Search returns by number, customer, or order ref..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Total Returns"
          value={String(totalReturns)}
          trend={{ value: "This month", positive: true }}
          icon={Package}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Units Returned"
          value={String(totalQtyReturned)}
          subtitle={`${filteredReturns.length} returns`}
          icon={Package}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
      </div>

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filteredReturns.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={filteredReturns.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
          </Button>
        </div>
        <Button
          className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setIsCreateSheetOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Return
        </Button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Return No", "Date", "Customer", "Products", "Qty", "Order Ref", "Status"].map(h => (
                  <th key={h} className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No returns found
                  </td>
                </tr>
              ) : (
                filteredReturns.map((r, i) => (
                  <tr key={r._id} className={`border-b border-border last:border-0 hover:bg-row-hover transition-colors ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                    <td className="px-4 py-3 text-table-body font-medium text-secondary">{r.return_number}</td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">{new Date(r.return_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-table-body text-card-foreground">{r.customer.name}</td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">{r.lines.map(l => l.product_name).join(", ")}</td>
                    <td className="px-4 py-3 text-table-body">{r.lines.reduce((sum, l) => sum + l.qty, 0)}</td>
                    <td className="px-4 py-3 text-table-body text-secondary">{r.original_order_ref || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={returnStatusToStatusType("pending")} /></td>
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
        ) : filteredReturns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No returns found</div>
        ) : (
          filteredReturns.map((r) => (
            <div key={r._id} className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm text-secondary">{r.return_number}</p>
                  <p className="text-xs text-muted-foreground">{r.customer.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(r.return_date).toLocaleDateString()}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate mb-2">
                {r.lines.map(l => l.product_name).join(", ")} (x{r.lines.reduce((sum, l) => sum + l.qty, 0)})
              </p>
              <StatusBadge status={returnStatusToStatusType("pending")} />
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

      {/* Create Return Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent side="right" className="w-full md:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create Sales Return</SheetTitle>
            <SheetDescription>Record a return from a customer</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            {/* Customer Information */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer Name *</label>
              <Input
                placeholder="Enter customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Customer Phone</label>
              <Input
                placeholder="Enter phone number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Original Order Ref</label>
              <Input
                placeholder="e.g., ORD-0001"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
              />
            </div>

            {/* Add Products */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Return Items</h3>

              <div className="space-y-2 mb-3">
                <label className="text-sm font-medium">Select Product</label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name} ({p.product_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">Quantity</label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="flex items-end">
                  <Button size="sm" onClick={handleAddLineItem}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Line Items */}
              {lineItems.length > 0 && (
                <div className="space-y-2 bg-muted/50 p-3 rounded-lg mb-3">
                  <h4 className="text-sm font-medium">Return Items ({lineItems.length})</h4>
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{item.qty} units</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLineItem(idx)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2 border-t pt-4">
              <label className="text-sm font-medium">Return Notes</label>
              <Input
                placeholder="Reason for return, condition, etc."
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createReturnMutation.mutate()}
              disabled={createReturnMutation.isPending || lineItems.length === 0}
            >
              {createReturnMutation.isPending ? "Creating..." : "Create Return"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
