import axiosClient from "@/api/axiosClient";

export interface PurchaseReturnLine {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
}

export interface PurchaseReturn {
  _id: string;
  return_number: string;
  purchase_number: string;
  lines: PurchaseReturnLine[];
  date: string;
  inventory_movements?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseReturnsResponse {
  returns: PurchaseReturn[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface PurchaseReturnsQueryParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export interface CreatePurchaseReturnPayload {
  purchase_number: string;
  lines: Array<{
    product_id: string;
    qty: number;
  }>;
  date?: string;
}

const normalizePurchaseReturn = (item: Partial<PurchaseReturn> & Record<string, unknown>): PurchaseReturn => {
  return {
    _id: item._id,
    return_number: item.return_number,
    purchase_number: item.purchase_number,
    lines: item.lines,
    date: item.date,
    inventory_movements: item.inventory_movements,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

export const getPurchaseReturns = async (
  params: PurchaseReturnsQueryParams
): Promise<PurchaseReturnsResponse> => {
  const response = await axiosClient.get("/purchase-returns", {
    params,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch purchase returns");
  }

  const purchaseReturns = response.data.data.returns.map(normalizePurchaseReturn);

  return {
    returns: purchaseReturns,
    pagination: response.data.data.pagination,
  };
};

export const getPurchaseReturnById = async (id: string): Promise<PurchaseReturn> => {
  const response = await axiosClient.get(`/purchase-returns/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch purchase return");
  }

  return normalizePurchaseReturn(response.data.data.return);
};

export const createPurchaseReturn = async (
  payload: CreatePurchaseReturnPayload
): Promise<PurchaseReturn> => {
  const response = await axiosClient.post("/purchase-returns", payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create purchase return");
  }

  return normalizePurchaseReturn(response.data.data.return);
};
