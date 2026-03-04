import axiosClient from "@/api/axiosClient";

export type StockMovementType =
  | "purchase_in"
  | "sale_out"
  | "purchase_return"
  | "sale_return"
  | "adjustment"
  | string;

export interface StockMovement {
  _id: string;
  occurred_at: string;
  product_name: string;
  product_code: string;
  qty: number;
  type: StockMovementType;
  before_qty?: number;
  after_qty?: number;
  done_by: string;
}

export interface StockMovementsParams {
  product_id?: string;
  from?: string;
  to?: string;
  type?: StockMovementType;
  page?: number;
  limit?: number;
}

export interface StockMovementsResponse {
  transactions: StockMovement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const getStockMovements = async (
  params: StockMovementsParams,
): Promise<StockMovementsResponse> => {
  const response = await axiosClient.get("/inventory/transactions", {
    params,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch stock movements");
  }

  const data = response.data.data ?? {};

  const transactions: StockMovement[] = data.transactions ?? data.items ?? [];
  const pagination = data.pagination ?? {
    page: params.page ?? 1,
    limit: params.limit ?? 10,
    total: transactions.length,
    totalPages: 1,
  };

  return {
    transactions,
    pagination,
  };
};

