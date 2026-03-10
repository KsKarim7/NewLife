import axiosClient from "@/api/axiosClient";

export interface SalesReturnCustomer {
  customer_id?: string;
  name: string;
  phone?: string;
}

export interface SalesReturnLine {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
}

export interface SalesReturn {
  _id: string;
  return_number: string;
  customer: SalesReturnCustomer;
  original_order_ref?: string;
  lines: SalesReturnLine[];
  return_date: string;
  notes?: string;
  inventory_movements?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SalesReturnsResponse {
  returns: SalesReturn[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  summary?: {
    total_returns: number;
    total_qty_returned: number;
  };
}

export interface SalesReturnsQueryParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  customer_id?: string;
}

export interface CreateSalesReturnPayload {
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  original_order_ref?: string;
  lines: Array<{
    product_id: string;
    qty: number;
  }>;
  return_date?: string;
  notes?: string;
}

const normalizeSalesReturn = (item: Record<string, unknown>): SalesReturn => {
  return {
    _id: item._id as string,
    return_number: item.return_number as string,
    customer: item.customer as SalesReturnCustomer,
    original_order_ref: item.original_order_ref as string | undefined,
    lines: item.lines as SalesReturnLine[],
    return_date: item.return_date as string,
    notes: item.notes as string | undefined,
    inventory_movements: item.inventory_movements as string[] | undefined,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
};

export const getSalesReturns = async (
  params: SalesReturnsQueryParams
): Promise<SalesReturnsResponse> => {
  const response = await axiosClient.get("/sales-returns", {
    params,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch sales returns");
  }

  const salesReturns = response.data.data.returns.map(normalizeSalesReturn);

  return {
    returns: salesReturns,
    pagination: response.data.data.pagination,
  };
};

export const getSalesReturnById = async (id: string): Promise<SalesReturn> => {
  const response = await axiosClient.get(`/sales-returns/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch sales return");
  }

  return normalizeSalesReturn(response.data.data.return);
};

export const createSalesReturn = async (
  payload: CreateSalesReturnPayload
): Promise<SalesReturn> => {
  const response = await axiosClient.post("/sales-returns", payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create sales return");
  }

  return normalizeSalesReturn(response.data.data.return);
};
