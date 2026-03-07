import axiosClient from "@/api/axiosClient";

export interface OrderCustomer {
  customer_id?: string;
  name: string;
  phone: string;
}

export interface OrderLine {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
  unit_price_paisa?: number;
  vat_percent: number;
  line_total_paisa?: number;
}

export interface Order {
  _id: string;
  order_number: string;
  status: "Confirmed" | "Partially Paid" | "Paid" | "Cancelled" | "Returned";
  customer: OrderCustomer;
  lines: OrderLine[];
  subtotal_paisa: number;
  vat_total_paisa: number;
  total_paisa: number;
  amount_received_paisa: number;
  amount_due_paisa: number;
  payments?: Array<{
    amount_paisa: number;
    date: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary?: {
    total_revenue: string;
    total_due: string;
    total_received: string;
    total_orders: number;
  };
}

export interface OrdersQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  customer_id?: string;
  from?: string;
  to?: string;
}

export interface CreateOrderPayload {
  customer_name: string;
  customer_phone: string;
  lines: Array<{
    product_id: string;
    qty: number;
    unit_price: string;
    vat_percent: number;
  }>;
  amount_received?: number;
}

export interface AddPaymentPayload {
  amount: number;
  note?: string;
}

const normalizeOrder = (item: Partial<Order> & Record<string, unknown>): Order => {
  return {
    _id: item._id,
    order_number: item.order_number,
    status: item.status,
    customer: item.customer,
    lines: item.lines,
    subtotal_paisa: item.subtotal_paisa,
    vat_total_paisa: item.vat_total_paisa,
    total_paisa: item.total_paisa,
    amount_received_paisa: item.amount_received_paisa,
    amount_due_paisa: item.amount_due_paisa,
    payments: item.payments,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

export const getOrders = async (
  params: OrdersQueryParams
): Promise<OrdersResponse> => {
  const response = await axiosClient.get("/orders", {
    params,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch orders");
  }

  const orders = response.data.data.orders.map(normalizeOrder);

  return {
    orders,
    pagination: response.data.data.pagination,
    summary: response.data.data.summary,
  };
};

export const getOrderById = async (id: string): Promise<Order> => {
  const response = await axiosClient.get(`/orders/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch order");
  }

  return normalizeOrder(response.data.data.order);
};

export const createOrder = async (payload: CreateOrderPayload): Promise<Order> => {
  const response = await axiosClient.post("/orders", payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create order");
  }

  return normalizeOrder(response.data.data.order);
};

export const addPayment = async (
  id: string,
  payload: AddPaymentPayload
): Promise<Order> => {
  const response = await axiosClient.post(`/orders/${id}/pay`, payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to add payment");
  }

  return normalizeOrder(response.data.data.order);
};

export const cancelOrder = async (id: string): Promise<Order> => {
  const response = await axiosClient.post(`/orders/${id}/cancel`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to cancel order");
  }

  return normalizeOrder(response.data.data.order);
};

export const deleteOrder = async (id: string): Promise<void> => {
  const response = await axiosClient.delete(`/orders/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete order");
  }
};
