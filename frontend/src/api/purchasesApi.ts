import axiosClient from "@/api/axiosClient";

export interface PurchaseLine {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
  buying_price_paisa: number;
  line_total_paisa: number;
}

export interface Purchase {
  _id: string;
  purchase_number: string;
  date: string;
  lines: PurchaseLine[];
  net_amount_paisa: number;
  paid_amount_paisa: number;
  due_amount_paisa: number;
  inventory_movements?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchasesResponse {
  purchases: Purchase[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface PurchasesQueryParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export interface CreatePurchasePayload {
  date?: string;
  lines: Array<{
    product_id: string;
    qty: number;
    buying_price: string;
  }>;
  paid_amount?: number;
}

const normalizePurchase = (
  item: Partial<Purchase> & Record<string, unknown>
): Purchase => {
  return {
    _id: item._id,
    purchase_number: item.purchase_number,
    date: item.date,
    lines: item.lines,
    net_amount_paisa: item.net_amount_paisa,
    paid_amount_paisa: item.paid_amount_paisa,
    due_amount_paisa: item.due_amount_paisa,
    inventory_movements: item.inventory_movements,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

export const getPurchases = async (
  params: PurchasesQueryParams
): Promise<PurchasesResponse> => {
  const response = await axiosClient.get("/purchases", {
    params,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch purchases");
  }

  const purchases = response.data.data.purchases.map(normalizePurchase);

  return {
    purchases,
    pagination: response.data.data.pagination,
  };
};

export const getPurchaseById = async (id: string): Promise<Purchase> => {
  const response = await axiosClient.get(`/purchases/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch purchase");
  }

  return normalizePurchase(response.data.data.purchase);
};

export const createPurchase = async (
  payload: CreatePurchasePayload
): Promise<Purchase> => {
  const response = await axiosClient.post("/purchases", payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create purchase");
  }

  return normalizePurchase(response.data.data.purchase);
};
