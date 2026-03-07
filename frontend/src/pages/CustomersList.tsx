import { useEffect, useMemo, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/utils/formatDate";
import { Plus, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  Customer,
  CustomersResponse,
  createCustomer,
  getCustomers,
  updateCustomer,
  deleteCustomer,
} from "@/api/customersApi";

export default function CustomersList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [search]);

  const {
    data,
    isLoading,
  } = useQuery<CustomersResponse>({
    queryKey: ["customers", debouncedSearch, page],
    queryFn: () =>
      getCustomers({
        search: debouncedSearch || undefined,
        page,
        limit: 10,
      }),
    placeholderData: keepPreviousData,
  });

  const customers = data?.customers ?? [];
  const pagination = data?.pagination;

  const total = pagination?.total ?? customers.length;
  const limit = pagination?.limit ?? 10;
  const currentPage = pagination?.page ?? page;
  const totalPages = pagination?.totalPages ?? 1;

  const rangeText = useMemo(() => {
    if (!total) return "Showing 0 results";
    const start = (currentPage - 1) * limit + 1;
    const end = Math.min(currentPage * limit, total);
    return `Showing ${start}–${end} of ${total} results`;
  }, [currentPage, limit, total]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setShopName("");
    setAddress("");
  };

  const openAddSheet = () => {
    setEditingCustomer(null);
    resetForm();
    setIsSheetOpen(true);
  };

  const openEditSheet = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone);
    setShopName(customer.shop_name ?? "");
    setAddress(customer.address ?? "");
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setEditingCustomer(null);
    resetForm();
  };

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer added" });
      closeSheet();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add customer",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; phone: string; shop_name?: string; address?: string } }) =>
      updateCustomer(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer updated" });
      closeSheet();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update customer",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer deleted" });
      setIsDeleteDialogOpen(false);
      setCustomerToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete customer",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) return;

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      shop_name: shopName.trim() || undefined,
      address: address.trim() || undefined,
    };

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDeleteCustomer = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (customerToDelete) {
      deleteCustomerMutation.mutate(customerToDelete._id);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || deleteCustomerMutation.isPending;

  return (
    <PageLayout
      title="Customers"
      searchPlaceholder="Search customers by name or phone..."
      searchValue={search}
      onSearchChange={(val) => setSearch(val)}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <Button
          className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={openAddSheet}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Customer
        </Button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Name", "Phone", "Shop Name", "Address", "Created", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-table-header uppercase text-muted-foreground px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Loading customers...
                  </td>
                </tr>
              )}
              {!isLoading && customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No customers found.
                  </td>
                </tr>
              )}
              {!isLoading &&
                customers.map((customer, index) => {
                  const created = customer.createdAt || customer.created_at;
                  return (
                    <tr
                      key={customer._id}
                      className={cn(
                        "border-b border-border last:border-0 hover:bg-row-hover transition-colors",
                        index % 2 === 1 ? "bg-muted/20" : "",
                      )}
                    >
                      <td className="px-4 py-3 text-table-body font-medium text-card-foreground">
                        {customer.name}
                      </td>
                      <td className="px-4 py-3 text-table-body text-muted-foreground">
                        {customer.phone}
                      </td>
                      <td className="px-4 py-3 text-table-body text-muted-foreground">
                        {customer.shop_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-table-body text-muted-foreground">
                        {customer.address || "—"}
                      </td>
                      <td className="px-4 py-3 text-table-body text-muted-foreground">
                        {created ? formatDateTime(created) : "—"}
                      </td>
                      <td className="px-4 py-3 text-table-body text-secondary">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                            onClick={() => openEditSheet(customer)}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => handleDeleteCustomer(customer)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">{rangeText}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage <= 1}
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
              disabled={currentPage >= totalPages}
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
            Loading customers...
          </p>
        )}
        {!isLoading && customers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No customers found.
          </p>
        )}
        {!isLoading &&
          customers.map((customer) => {
            const created = customer.createdAt || customer.created_at;
            return (
              <div
                key={customer._id}
                className="bg-card rounded-xl p-4 shadow-sm border border-border"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm text-card-foreground">
                      {customer.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {customer.phone}
                    </p>
                    {customer.shop_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {customer.shop_name}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {created ? formatDateTime(created) : "—"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {customer.address || "No address"}
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                    onClick={() => openEditSheet(customer)}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => handleDeleteCustomer(customer)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      <Sheet open={isSheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</SheetTitle>
            <SheetDescription>
              {editingCustomer
                ? "Update the customer details."
                : "Create a new customer record."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="customer-name">
                Name
              </label>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="customer-phone">
                Phone
              </label>
              <Input
                id="customer-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="customer-shop-name">
                Shop Name
              </label>
              <Input
                id="customer-shop-name"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Optional shop name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="customer-address">
                Address
              </label>
              <Input
                id="customer-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Optional address"
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button
              type="button"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSubmit}
              disabled={isSubmitting || !name.trim() || !phone.trim()}
            >
              {isSubmitting
                ? "Saving..."
                : editingCustomer
                  ? "Save Changes"
                  : "Create Customer"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="font-semibold">{customerToDelete?.name}</p>
            <p className="text-sm text-muted-foreground">{customerToDelete?.phone}</p>
          </div>
          <div className="flex gap-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteCustomerMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCustomerMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

