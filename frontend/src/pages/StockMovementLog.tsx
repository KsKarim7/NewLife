import { useEffect, useMemo, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import axiosClient from "@/api/axiosClient";
import { getStockMovements, type StockMovement, type StockMovementType } from "@/api/stockLogApi";
import { formatDateTime } from "@/utils/formatDate";

interface StockLogProduct {
  _id: string;
  name: string;
  code?: string;
}

function mapTypeToLabel(type: StockMovementType | undefined): string {
  switch (type) {
    case "purchase_in":
      return "Purchase";
    case "sale_out":
      return "Sale";
    case "purchase_return":
      return "Purchase Return";
    case "sale_return":
      return "Sales Return";
    case "adjustment":
      return "Manual Adjustment";
    default:
      return "Unknown";
  }
}

function mapReasonFilterToType(value: string): StockMovementType | undefined {
  switch (value) {
    case "sale":
      return "sale_out";
    case "purchase":
      return "purchase_in";
    case "purchase-return":
      return "purchase_return";
    case "sales-return":
      return "sale_return";
    case "manual":
      return "adjustment";
    case "all":
    default:
      return undefined;
  }
}

export default function StockMovementLog() {
  const [page, setPage] = useState(1);
  const [reasonFilter, setReasonFilter] = useState("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<StockLogProduct | null>(null);
  const [showProductResults, setShowProductResults] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedProductSearch(productSearch);
    }, 400);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const {
    data: productResults,
    isLoading: isProductLoading,
  } = useQuery({
    queryKey: ["stockLogProducts", debouncedProductSearch],
    enabled: debouncedProductSearch.trim().length > 1,
    queryFn: async () => {
      const response = await axiosClient.get("/products", {
        params: {
          search: debouncedProductSearch.trim(),
          limit: 10,
        },
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || "Failed to search products");
      }
      const items: StockLogProduct[] = response.data.data?.products ?? response.data.data ?? [];
      return items;
    },
  });

  const {
    data: stockData,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: [
      "stockLog",
      page,
      selectedProduct?._id ?? null,
      reasonFilter,
      fromDate,
      toDate,
    ],
    queryFn: () =>
      getStockMovements({
        page,
        limit: 10,
        product_id: selectedProduct?._id ?? undefined,
        type: mapReasonFilterToType(reasonFilter),
        from: fromDate || undefined,
        to: toDate || undefined,
      }),
    keepPreviousData: true,
  });

  const movements: StockMovement[] = stockData?.transactions ?? [];
  const pagination = stockData?.pagination;

  const total = pagination?.total ?? movements.length;
  const limit = pagination?.limit ?? 10;
  const currentPage = pagination?.page ?? page;
  const totalPages = pagination?.totalPages ?? 1;

  const rangeText = useMemo(() => {
    if (!total) return "Showing 0 results";
    const start = (currentPage - 1) * limit + 1;
    const end = Math.min(currentPage * limit, total);
    return `Showing ${start}–${end} of ${total} results`;
  }, [currentPage, limit, total]);

  const handleSelectProduct = (product: StockLogProduct) => {
    setSelectedProduct(product);
    const label = product.code ? `${product.name} (${product.code})` : product.name;
    setProductSearch(label);
    setShowProductResults(false);
    setPage(1);
  };

  const handleClearProduct = () => {
    setSelectedProduct(null);
    setProductSearch("");
    setShowProductResults(false);
    setPage(1);
  };

  return (
    <PageLayout title="Stock Movement Log" searchPlaceholder="Search by product name or code...">
      <div className="flex items-center justify-between mb-4">
        <div className="hidden md:flex items-center gap-3">
          <Select
            value={reasonFilter}
            onValueChange={(value) => {
              setReasonFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reasons</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="purchase-return">Purchase Return</SelectItem>
              <SelectItem value="sales-return">Sales Return</SelectItem>
              <SelectItem value="manual">Manual Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
          <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel</Button>
        </div>
        {/* Mobile: filter + export in one row */}
        <div className="md:hidden flex items-center gap-2 w-full">
          <Select defaultValue="all">
            <SelectTrigger className="flex-1 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reasons</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="purchase-return">Purchase Return</SelectItem>
              <SelectItem value="sales-return">Sales Return</SelectItem>
              <SelectItem value="manual">Manual Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <div className="w-full md:max-w-xs">
          <div className="relative">
            <Input
              placeholder={selectedProduct ? "Filter by product" : "Search products for filter..."}
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setShowProductResults(true);
              }}
              className="h-9 pr-8"
            />
            {selectedProduct && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleClearProduct}
              >
                Clear
              </button>
            )}
          </div>
          {showProductResults && productSearch.trim().length > 1 && (
            <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-sm text-sm">
              {isProductLoading && (
                <div className="px-3 py-2 text-muted-foreground">Searching...</div>
              )}
              {!isProductLoading &&
                (productResults ?? []).map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted"
                    onClick={() => handleSelectProduct(product)}
                  >
                    <div className="font-medium text-foreground">{product.name}</div>
                    {product.code && (
                      <div className="text-xs text-muted-foreground">{product.code}</div>
                    )}
                  </button>
                ))}
              {!isProductLoading && (productResults ?? []).length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No products found.</div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="h-9 text-sm"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Date & Time", "Product", "Code", "Change", "Reason", "Before", "After", "Done By"].map(h => (
                  <th key={h} className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    Loading stock movements...
                  </td>
                </tr>
              )}
              {!isLoading && movements.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    No stock movements found.
                  </td>
                </tr>
              )}
              {!isLoading &&
                movements.map((movement, index) => (
                  <tr
                    key={movement._id}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-row-hover transition-colors",
                      index % 2 === 1 ? "bg-muted/20" : "",
                    )}
                  >
                    <td className="px-4 py-3 text-table-body text-muted-foreground">
                      {formatDateTime(movement.occurred_at)}
                    </td>
                    <td className="px-4 py-3 text-table-body font-medium">
                      {movement.product_name}
                    </td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">
                      {movement.product_code}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-table-body font-bold",
                        movement.qty > 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {movement.qty > 0 ? `+${movement.qty}` : movement.qty}
                    </td>
                    <td className="px-4 py-3 text-table-body">
                      {mapTypeToLabel(movement.type)}
                    </td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">
                      {movement.before_qty}
                    </td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">
                      {movement.after_qty}
                    </td>
                    <td className="px-4 py-3 text-table-body text-muted-foreground">
                      {movement.done_by}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {isFetching ? "Updating..." : rangeText}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage <= 1 || isFetching}
            >
              Previous
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground"
            >
              {currentPage}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={currentPage >= totalPages || isFetching}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Loading stock movements...
          </p>
        )}
        {!isLoading && movements.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No stock movements found.
          </p>
        )}
        {!isLoading &&
          movements.map((movement) => (
            <div
              key={movement._id}
              className="bg-card rounded-xl p-4 shadow-sm border border-border"
            >
              <div className="flex items-start justify-between mb-1">
                <p className="font-semibold text-sm text-card-foreground">
                  {movement.product_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(movement.occurred_at)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-bold text-sm",
                      movement.qty > 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {movement.qty > 0 ? `+${movement.qty}` : movement.qty}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {mapTypeToLabel(movement.type)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{movement.done_by}</p>
              </div>
            </div>
          ))}
      </div>
    </PageLayout>
  );
}
