import axiosClient from '@/api/axiosClient';

export interface ExpenseLine {
  _id?: string;
  product_id?: string;
  code?: string;
  name?: string;
  qty?: number;
}

export interface Expense {
  _id: string;
  date: string;
  party_name: string;
  description?: string;
  total_amount_paisa: string;
  paid_amount_paisa: string;
  due_amount_paisa: string;
  is_deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpensePayload {
  party_name: string;
  total_amount: number;
  paid_amount?: number;
  description?: string;
  date?: string;
}

export interface ExpensesResponse {
  success: boolean;
  data: {
    expenses: Expense[];
    summary: {
      total_amount: string;
      total_paid: string;
      total_due: string;
    };
    pagination: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  };
}

export interface ExpenseDetailResponse {
  success: boolean;
  data: {
    expense: Expense;
  };
}

export const getExpenses = async (params?: {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<ExpensesResponse> => {
  const { data } = await axiosClient.get('/expenses', { params });
  return data;
};

export const createExpense = async (
  payload: CreateExpensePayload
): Promise<ExpenseDetailResponse> => {
  const { data } = await axiosClient.post('/expenses', payload);
  return data;
};

export const updateExpense = async (
  id: string,
  payload: Partial<CreateExpensePayload>
): Promise<ExpenseDetailResponse> => {
  const { data } = await axiosClient.put(`/expenses/${id}`, payload);
  return data;
};

export const deleteExpense = async (id: string): Promise<{ success: boolean }> => {
  const { data } = await axiosClient.delete(`/expenses/${id}`);
  return data;
};
