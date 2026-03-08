import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/shared/StatCard";
import { formatCurrency } from "@/utils/currency";
import { formatDate } from "@/utils/formatDate";
import { getPeriodDateRange } from "@/utils/dateRangeUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, DollarSign, AlertCircle, Plus, FileText, FileSpreadsheet, Edit2, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
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
import { Skeleton } from "@/components/ui/skeleton";
import { getExpenses, createExpense, updateExpense, deleteExpense, type Expense, type ExpensesResponse } from "@/api/expensesApi";

interface AxiosErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

export default function ExpensesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("7d");
  const [fromDate, setFromDate] = useState(() => {
    const initialRange = getPeriodDateRange("7d");
    return initialRange?.from ?? "";
  });
  const [toDate, setToDate] = useState(() => {
    const initialRange = getPeriodDateRange("7d");
    return initialRange?.to ?? "";
  });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditingId, setIsEditingId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState("");

  // Delete dialog state
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const getQueryDateRange = () => {
    if (period === "custom") {
      return { from: customFrom, to: customTo };
    }
    return { from: fromDate, to: toDate };
  };

  const { from: queryFrom, to: queryTo } = getQueryDateRange();

  const shouldFetch = period !== "custom" || !!(customFrom && customTo);

  // Fetch expenses
  const { data, isLoading, error } = useQuery<ExpensesResponse>({
    queryKey: ["expenses", page, queryFrom, queryTo],
    queryFn: () =>
      getExpenses({
        page,
        limit: 10,
        from: queryFrom || undefined,
        to: queryTo || undefined,
      }),
    enabled: shouldFetch,
  });

  const expenses = data?.data?.expenses || [];
  const summary = data?.data?.summary || {
    total_amount: "0.00",
    total_paid: "0.00",
    total_due: "0.00",
  };
  const pagination = data?.data?.pagination || {
    total: 0,
    page: 1,
    limit: 10,
    pages: 1,
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload) =>
      createExpense({
        party_name: partyName,
        total_amount: parseFloat(totalAmount),
        paid_amount: paidAmount ? parseFloat(paidAmount) : undefined,
        description: description || undefined,
        date: expenseDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Success", description: "Expense created successfully" });
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error: AxiosErrorResponse) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      updateExpense(id, {
        party_name: partyName,
        total_amount: parseFloat(totalAmount),
        paid_amount: paidAmount ? parseFloat(paidAmount) : undefined,
        description: description || undefined,
        date: expenseDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Success", description: "Expense updated successfully" });
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error: AxiosErrorResponse) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Success", description: "Expense deleted successfully" });
      setDeletingExpense(null);
    },
    onError: (error: AxiosErrorResponse) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setPartyName("");
    setTotalAmount("");
    setPaidAmount("");
    setDescription("");
    setExpenseDate("");
    setIsEditingId(null);
  };

  const handlePeriodChange = (value: string) => {
    let next = "7d";
    if (value === "today") next = "today";
    else if (value === "30") next = "30d";
    else if (value === "month") next = "month";
    else if (value === "custom") next = "custom";
    setPeriod(next);
    setPage(1);

    // Update date inputs based on period
    if (next === "custom") {
      // For custom, dates come from Header (customFrom/customTo)
      setFromDate("");
      setToDate("");
    } else {
      const { from, to } = getPeriodDateRange(next) || { from: "", to: "" };
      setFromDate(from);
      setToDate(to);
    }
  };

  const handleEditClick = (expense: Expense) => {
    setIsEditingId(expense._id);
    setPartyName(expense.party_name);
    setTotalAmount(parseFloat(expense.total_amount_paisa).toString());
    setPaidAmount(parseFloat(expense.paid_amount_paisa).toString());
    setDescription(expense.description || "");
    setExpenseDate(new Date(expense.date).toISOString().split("T")[0]);
    setIsCreateOpen(true);
  };

  const handleCreateOpen = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!partyName.trim() || !totalAmount) {
      toast({
        title: "Error",
        description: "Party name and total amount are required",
        variant: "destructive",
      });
      return;
    }

    if (isEditingId) {
      updateMutation.mutate(isEditingId);
    } else {
      createMutation.mutate(null);
    }
  };

  return (
    <PageLayout 
      title="Expenses" 
      searchPlaceholder="Search expenses..."
      periodValue={period === "today" ? "today" : period === "7d" ? "7" : period === "30d" ? "30" : period === "month" ? "month" : "custom"}
      onPeriodChange={handlePeriodChange}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFromChange={setCustomFrom}
      onCustomToChange={setCustomTo}
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Total Expenses"
          value={isLoading ? "—" : formatCurrency(parseFloat(summary.total_amount))}
          icon={Wallet}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Total Paid"
          value={isLoading ? "—" : formatCurrency(parseFloat(summary.total_paid))}
          icon={DollarSign}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Total Due"
          value={isLoading ? "—" : formatCurrency(parseFloat(summary.total_due))}
          icon={AlertCircle}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
      </div>

      {/* Filters and Add button */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="hidden md:flex items-center gap-2">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-1" /> Export PDF
            </Button>
            <Button variant="outline" size="sm">
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
            </Button>
          </div>
          <Button
            onClick={handleCreateOpen}
            className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Date", "Party Name", "Description", "Total", "Paid", "Due", "Actions"].map((h) => (
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
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No expenses found
                  </td>
                </tr>
              ) : (
                expenses.map((e, i) => {
                  const dueAmount = parseFloat(e.total_amount_paisa) - parseFloat(e.paid_amount_paisa);
                  return (
                    <tr
                      key={e._id}
                      className={`border-b border-border last:border-0 hover:bg-row-hover transition-colors ${
                        i % 2 === 1 ? "bg-muted/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-table-body text-muted-foreground">
                        {formatDate(e.date)}
                      </td>
                      <td className="px-4 py-3 text-table-body font-medium">{e.party_name}</td>
                      <td className="px-4 py-3 text-table-body text-muted-foreground text-sm truncate">
                        {e.description || "—"}
                      </td>
                      <td className="px-4 py-3 text-table-body font-medium">
                        {formatCurrency(parseFloat(e.total_amount_paisa))}
                      </td>
                      <td className="px-4 py-3 text-table-body text-success">
                        {formatCurrency(parseFloat(e.paid_amount_paisa))}
                      </td>
                      <td className="px-4 py-3 text-table-body text-destructive font-medium">
                        {dueAmount > 0 ? formatCurrency(dueAmount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-table-body">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditClick(e)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                          >
                            <Edit2 className="h-4 w-4 text-secondary" />
                          </button>
                          <button
                            onClick={() => setDeletingExpense(e)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
              <Skeleton className="h-3 w-32 mb-2" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))
        ) : expenses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No expenses found</div>
        ) : (
          expenses.map((e) => {
            const dueAmount = parseFloat(e.total_amount_paisa) - parseFloat(e.paid_amount_paisa);
            return (
              <div key={e._id} className="bg-card rounded-xl p-4 shadow-sm border border-border">
                <div className="flex items-start justify-between mb-1">
                  <p className="font-semibold text-sm text-card-foreground">{e.party_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate mb-2">{e.description || "—"}</p>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-sm">{formatCurrency(parseFloat(e.total_amount_paisa))}</p>
                  {dueAmount > 0 ? (
                    <p className="text-xs text-destructive font-medium">Due: {formatCurrency(dueAmount)}</p>
                  ) : (
                    <p className="text-xs text-success font-medium">Paid</p>
                  )}
                </div>
                <div className="flex items-center gap-1 pt-2 border-t border-border">
                  <button
                    onClick={() => handleEditClick(e)}
                    className="flex-1 py-1 px-2 hover:bg-muted rounded text-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => setDeletingExpense(e)}
                    className="flex-1 py-1 px-2 hover:bg-muted rounded text-xs transition-colors flex items-center justify-center gap-1 text-destructive"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2 mt-6">
        <Button
          variant="outline"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {pagination.pages}
        </span>
        <Button
          variant="outline"
          onClick={() => setPage(Math.min(pagination.pages, page + 1))}
          disabled={page === pagination.pages}
        >
          Next
        </Button>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditingId ? "Edit Expense" : "Create New Expense"}</DialogTitle>
            <DialogDescription>
              {isEditingId ? "Update the expense details below" : "Add a new operational expense"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Party Name *</label>
              <Input
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder="e.g., BD Courier, Electricity Board"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Total Amount (৳) *</label>
              <Input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0"
                step="0.01"
                min="0"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Paid Amount (৳)</label>
              <Input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
                step="0.01"
                min="0"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Monthly rent, Office supplies"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Date</label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setIsCreateOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingExpense} onOpenChange={() => setDeletingExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense from {deletingExpense?.party_name}? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingExpense && deleteMutation.mutate(deletingExpense._id)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
