import { useEffect, useMemo, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatusBadge, StatusType } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Minus, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Category,
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from "@/api/categoriesApi";
import {
  Product,
  type ProductsResponse,
  type ProductPayload,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getProducts,
} from "@/api/productsApi";

type CategoryMutationError = {
  message?: string;
  response?: {
    data?: {
      message?: string;
    };
  };
};

type ProductFormValues = {
  name: string;
  product_code: string;
  category_id: string;
  unit: string;
  selling_price: string;
  buying_price: string;
  vat_enabled: boolean;
  vat_percent?: number;
  description?: string;
  image_url?: string;
};

type ProductMutationError = {
  message?: string;
  response?: {
    data?: {
      message?: string;
    };
  };
};

function getStockStatus(stock: number): StatusType {
  if (stock === 0) return "outofstock";
  if (stock <= 10) return "lowstock";
  return "instock";
}

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [isProductSheetOpen, setIsProductSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: categories,
    isLoading: isCategoriesLoading,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const categoriesList = useMemo(() => categories ?? [], [categories]);

  const selectedCategoryName = useMemo(() => {
    if (!activeCategory || !categoriesList.length) return null;
    const selected = categoriesList.find((c) => c._id === activeCategory);
    return selected?.name ?? null;
  }, [activeCategory, categoriesList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data: productsData,
    isLoading: isProductsLoading,
    isFetching: isProductsFetching,
  } = useQuery<ProductsResponse, Error>({
    queryKey: ["products", page, debouncedSearch, activeCategory],
    queryFn: () =>
      getProducts({
        page,
        limit: 10,
        search: debouncedSearch || undefined,
        category_id: activeCategory,
      }),
  });

  const products = productsData?.products ?? [];
  const productsPagination = productsData?.pagination;

  const productsTotal = productsPagination?.total ?? products.length;
  const productsLimit = productsPagination?.limit ?? 10;
  const productsPage = productsPagination?.page ?? page;
  const productsTotalPages = productsPagination?.totalPages ?? 1;

  const productsRangeText = useMemo(() => {
    if (!productsTotal) return "Showing 0 results";
    const start = (productsPage - 1) * productsLimit + 1;
    const end = Math.min(productsPage * productsLimit, productsTotal);
    return `Showing ${start}–${end} of ${productsTotal} results`;
  }, [productsPage, productsLimit, productsTotal]);

  const productForm = useForm<ProductFormValues>({
    defaultValues: {
      name: "",
      product_code: "",
      category_id: "",
      unit: "",
      selling_price: "",
      buying_price: "",
      vat_enabled: false,
      vat_percent: undefined,
      description: "",
      image_url: "",
    },
  });

  const handleOpenAddDialog = () => {
    setCategoryName("");
    setCategoryDescription("");
    setIsAddDialogOpen(true);
  };

  const handleOpenProductSheetForCreate = () => {
    setEditingProduct(null);
    productForm.reset({
      name: "",
      product_code: "",
      category_id: activeCategory ?? "",
      unit: "",
      selling_price: "",
      buying_price: "",
      vat_enabled: false,
      vat_percent: undefined,
      description: "",
      image_url: "",
    });
    setIsProductSheetOpen(true);
  };

  const handleOpenProductSheetForEdit = (product: Product) => {
    setEditingProduct(product);
    productForm.reset({
      name: product.name,
      product_code: product.product_code,
      category_id: product.category?._id ?? "",
      unit: product.unit,
      selling_price: product.selling_price_taka,
      buying_price: product.buying_price_taka,
      vat_enabled: product.vat_enabled ?? false,
      vat_percent: product.vat_percent,
      description: product.description ?? "",
      image_url: product.image_url ?? "",
    });
    setIsProductSheetOpen(true);
  };

  const handleCloseProductSheet = () => {
    setIsProductSheetOpen(false);
    setEditingProduct(null);
  };

  const handleOpenDeleteProduct = (product: Product) => {
    setDeletingProduct(product);
  };

  const handleCloseDeleteProduct = () => {
    setDeletingProduct(null);
  };

  const handleOpenAdjustDialog = (product: Product, direction: "increase" | "decrease") => {
    setAdjustProduct(product);
    setAdjustQty(direction === "increase" ? 1 : -1);
    setAdjustReason("");
    setIsAdjustDialogOpen(true);
  };

  const handleCloseAdjustDialog = () => {
    setAdjustProduct(null);
    setAdjustQty(0);
    setAdjustReason("");
    setIsAdjustDialogOpen(false);
  };

  const handleOpenEditDialog = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryDescription(category.description ?? "");
  };

  const handleCloseEditDialog = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryDescription("");
  };

  const handleOpenDeleteDialog = (category: Category) => {
    setDeletingCategory(category);
  };

  const handleCloseDeleteDialog = () => {
    setDeletingCategory(null);
  };

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({
        title: "Category created",
      });
      setIsAddDialogOpen(false);
      setCategoryName("");
      setCategoryDescription("");
    },
    onError: (error: unknown) => {
      const apiError = error as CategoryMutationError;
      toast({
        title: "Failed to create category",
        description: apiError.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; description?: string } }) =>
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({
        title: "Category updated",
      });
      handleCloseEditDialog();
    },
    onError: (error: unknown) => {
      const apiError = error as CategoryMutationError;
      toast({
        title: "Failed to update category",
        description: apiError.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({
        title: "Category deleted",
      });
      handleCloseDeleteDialog();
      if (activeCategory && deletingCategory && deletingCategory._id === activeCategory) {
        setActiveCategory(null);
      }
    },
    onError: (error: unknown) => {
      const apiError = error as CategoryMutationError;
      const apiMessage =
        apiError.response?.data?.message || apiError.message || "Failed to delete category";
      toast({
        title: "Cannot delete category",
        description: apiMessage,
        variant: "destructive",
      });
    },
  });
  const createProductMutation = useMutation<Product, Error, ProductPayload>({
    mutationFn: (data) => createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Product created",
      });
      handleCloseProductSheet();
    },
    onError: (error: unknown) => {
      const apiError = error as ProductMutationError;
      toast({
        title: "Failed to create product",
        description: apiError.response?.data?.message || apiError.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateProductMutation = useMutation<Product, Error, { id: string; data: ProductPayload }>({
    mutationFn: ({ id, data }) => updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Product updated",
      });
      handleCloseProductSheet();
    },
    onError: (error: unknown) => {
      const apiError = error as ProductMutationError;
      toast({
        title: "Failed to update product",
        description: apiError.response?.data?.message || apiError.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteProductMutation = useMutation<void, Error, string>({
    mutationFn: (id) => deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Product deleted",
      });
      handleCloseDeleteProduct();
    },
    onError: (error: unknown) => {
      const apiError = error as ProductMutationError;
      toast({
        title: "Failed to delete product",
        description: apiError.response?.data?.message || apiError.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const adjustStockMutation = useMutation<void, Error, { id: string; payload: { qty: number; reason: string } }>({
    mutationFn: ({ id, payload }) =>
      adjustStock(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Stock adjusted",
      });
      handleCloseAdjustDialog();
    },
    onError: (error: unknown) => {
      const apiError = error as ProductMutationError;
      toast({
        title: "Failed to adjust stock",
        description: apiError.response?.data?.message || apiError.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSubmitProduct = (values: ProductFormValues) => {
    const payload: ProductPayload = {
      name: values.name,
      product_code: values.product_code,
      category_id: values.category_id,
      unit: values.unit,
      selling_price: values.selling_price,
      buying_price: values.buying_price,
      vat_enabled: values.vat_enabled,
      vat_percent: values.vat_enabled ? values.vat_percent : undefined,
      description: values.description || undefined,
      image_url: values.image_url || undefined,
    };

    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct._id, data: payload });
    } else {
      createProductMutation.mutate(payload);
    }
  };

  const handleConfirmDeleteProduct = () => {
    if (!deletingProduct) return;
    deleteProductMutation.mutate(deletingProduct._id);
  };

  const handleConfirmAdjustStock = () => {
    if (!adjustProduct || !adjustQty) return;
    adjustStockMutation.mutate({
      id: adjustProduct._id,
      payload: {
        qty: adjustQty,
        reason: adjustReason || "Manual adjustment",
      },
    });
  };

  return (
    <PageLayout
      title="Inventory"
      searchPlaceholder="Search products by name or code..."
      searchValue={search}
      onSearchChange={(value) => setSearch(value)}
    >
      {/* Category Filter */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border min-h-[36px]",
            activeCategory === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border hover:bg-muted"
          )}
        >
          All
        </button>
        {isCategoriesLoading &&
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-9 w-24 rounded-full"
            />
          ))}
        {!isCategoriesLoading &&
          categoriesList.map((category) => (
            <div key={category._id} className="flex items-center gap-1">
              <button
                onClick={() => setActiveCategory(category._id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border min-h-[36px]",
                  activeCategory === category._id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                )}
              >
                {category.name}
              </button>
              <button
                type="button"
                className="h-6 w-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => handleOpenEditDialog(category)}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="h-6 w-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => handleOpenDeleteDialog(category)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        <button
          type="button"
          className="h-8 w-8 rounded-full border-2 border-dashed border-primary/40 text-primary flex items-center justify-center hover:bg-primary/5 transition-colors flex-shrink-0"
          onClick={handleOpenAddDialog}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Table header with Add Product */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {isProductsFetching ? "Updating products..." : productsRangeText}
        </p>
        <Button
          className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90 ml-3"
          type="button"
          onClick={handleOpenProductSheetForCreate}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Product
        </Button>
      </div>

      {/* Desktop Product Table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left text-table-header uppercase text-muted-foreground px-4 py-3 w-10">
                  <input type="checkbox" className="rounded border-input" />
                </th>
                <th className="text-left text-table-header uppercase text-muted-foreground px-4 py-3 w-12"></th>
                <th className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">Product Name</th>
                <th className="text-left text-table-header uppercase text-muted-foreground px-4 py-3">Category</th>
                <th className="text-right text-table-header uppercase text-muted-foreground px-4 py-3">Price</th>
                <th className="text-center text-table-header uppercase text-muted-foreground px-4 py-3">Stock</th>
                <th className="text-right text-table-header uppercase text-muted-foreground px-4 py-3 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isProductsLoading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    Loading products...
                  </td>
                </tr>
              )}
              {!isProductsLoading && products.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    No products found.
                  </td>
                </tr>
              )}
              {!isProductsLoading && products.map((product, i) => (
                <tr
                  key={product._id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    i % 2 === 1 ? "bg-muted/20" : "bg-card",
                    "hover:bg-row-hover"
                  )}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td className="px-4 py-3"><input type="checkbox" className="rounded border-input" /></td>
                  <td className="px-4 py-3">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-lg">
                      {product.image_url ? (
                        <span className="text-xs text-muted-foreground">IMG</span>
                      ) : (
                        product.name.charAt(0).toUpperCase()
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-table-body font-medium text-card-foreground">{product.name}</p>
                      <p className="text-badge text-muted-foreground">{product.product_code}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-table-body text-muted-foreground">
                    {product.category_name}
                  </td>
                  <td className="px-4 py-3 text-table-body text-right font-medium text-card-foreground">
                    {formatCurrency(parseFloat(product.selling_price_taka))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge
                      status={getStockStatus(product.stock_qty)}
                      label={`${product.stock_qty} ${product.unit}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={cn("flex items-center justify-end gap-1 transition-opacity duration-200", hoveredRow === i ? "opacity-100" : "opacity-0")}>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={() => handleOpenAdjustDialog(product, "decrease")}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={() => handleOpenAdjustDialog(product, "increase")}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                        onClick={() => handleOpenProductSheetForEdit(product)}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => handleOpenDeleteProduct(product)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {isProductsFetching ? "Updating products..." : productsRangeText}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={productsPage <= 1 || isProductsFetching}
            >
              Previous
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground"
            >
              {productsPage}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={productsPage >= productsTotalPages || isProductsFetching}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Product Cards */}
      <div className="md:hidden space-y-3">
        {isProductsLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Loading products...
          </p>
        )}
        {!isProductsLoading && products.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No products found.
          </p>
        )}
        {!isProductsLoading && products.map((product) => (
          <div key={product._id} className="bg-card rounded-xl p-3 flex items-center gap-3 shadow-sm border border-border">
            <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center text-2xl shrink-0">
              {product.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate text-card-foreground">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.product_code}</p>
              <p className="text-xs text-muted-foreground">{product.category_name}</p>
              <div className="flex items-center justify-between mt-1">
                <StatusBadge status={getStockStatus(product.stock_qty)} label={`${product.stock_qty} ${product.unit}`} />
                <span className="font-bold text-sm">
                  {formatCurrency(parseFloat(product.selling_price_taka))}
                </span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="min-h-[44px] min-w-[44px] flex items-center justify-center">
                <MoreVertical size={18} className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenProductSheetForEdit(product)}>
                  <Pencil size={14} className="mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOpenAdjustDialog(product, "increase")}>
                  <Plus size={14} className="mr-2" /> Adjust Stock
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleOpenDeleteProduct(product)}
                >
                  <Trash2 size={14} className="mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <Sheet open={isProductSheetOpen} onOpenChange={(open) => !open && handleCloseProductSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{editingProduct ? "Edit Product" : "Add Product"}</SheetTitle>
            <SheetDescription>
              {editingProduct
                ? "Update the product details."
                : "Create a new product in your inventory."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Form {...productForm}>
              <form
                className="space-y-3"
                onSubmit={productForm.handleSubmit(handleSubmitProduct)}
              >
                <FormField
                  control={productForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Product name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={productForm.control}
                  name="product_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. ELC-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={productForm.control}
                  name="category_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categoriesList.map((category) => (
                            <SelectItem key={category._id} value={category._id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={productForm.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. pcs, kg" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={productForm.control}
                    name="selling_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selling Price (৳)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={productForm.control}
                    name="buying_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Buying Price (৳)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={productForm.control}
                  name="vat_enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <div className="space-y-0.5">
                        <FormLabel>VAT</FormLabel>
                        <p className="text-xs text-muted-foreground">Enable VAT for this product</p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {productForm.watch("vat_enabled") && (
                  <FormField
                    control={productForm.control}
                    name="vat_percent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT Percent</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" max="100" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={productForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={productForm.control}
                  name="image_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image URL</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional image URL" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <SheetFooter className="mt-4">
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={
                      createProductMutation.isPending || updateProductMutation.isPending
                    }
                  >
                    {createProductMutation.isPending || updateProductMutation.isPending
                      ? "Saving..."
                      : editingProduct
                        ? "Save Changes"
                        : "Create Product"}
                  </Button>
                </SheetFooter>
              </form>
            </Form>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>Create a new category for your products.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="category-name">
                Name
              </label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Electronics"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="category-description">
                Description
              </label>
              <Input
                id="category-description"
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() =>
                createMutation.mutate({
                  name: categoryName,
                  description: categoryDescription || undefined,
                })
              }
              disabled={createMutation.isPending || !categoryName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && handleCloseEditDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>Update the category name or description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="edit-category-name">
                Name
              </label>
              <Input
                id="edit-category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="edit-category-description">
                Description
              </label>
              <Input
                id="edit-category-description"
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!editingCategory) return;
                updateMutation.mutate({
                  id: editingCategory._id,
                  data: {
                    name: categoryName,
                    description: categoryDescription || undefined,
                  },
                });
              }}
              disabled={updateMutation.isPending || !categoryName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {updateMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deletingCategory} onOpenChange={(open) => !open && handleCloseDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the category{" "}
              <span className="font-semibold">
                {deletingCategory?.name}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deletingCategory) return;
                deleteMutation.mutate(deletingCategory._id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => !open && handleCloseDeleteProduct()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product{" "}
              <span className="font-semibold">
                {deletingProduct?.name}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteProduct}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isAdjustDialogOpen} onOpenChange={(open) => !open && handleCloseAdjustDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>
              Adjust the stock quantity for{" "}
              <span className="font-semibold">
                {adjustProduct?.name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="adjust-qty">
                Quantity
              </label>
              <Input
                id="adjust-qty"
                type="number"
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Use positive numbers to increase stock, negative to decrease.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="adjust-reason">
                Reason
              </label>
              <Input
                id="adjust-reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Purchase, Correction, Damage"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={handleConfirmAdjustStock}
              disabled={adjustStockMutation.isPending || !adjustQty}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {adjustStockMutation.isPending ? "Saving..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
