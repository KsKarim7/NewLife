import axiosClient from "@/api/axiosClient";

export interface Customer {
  _id: string;
  name: string;
  phone: string;
  address?: string;
  createdAt?: string;
  created_at?: string;
}

export interface CustomersQueryParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface CustomersResponse {
  customers: Customer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const getCustomers = async (params: CustomersQueryParams): Promise<CustomersResponse> => {
  const response = await axiosClient.get("/customers", { params });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch customers");
  }

  const data = response.data.data ?? {};

  return {
    customers: data.customers ?? [],
    pagination: data.pagination ?? {
      page: params.page ?? 1,
      limit: params.limit ?? 10,
      total: (data.customers ?? []).length ?? 0,
      totalPages: 1,
    },
  };
};

export const getCustomerById = async (id: string): Promise<Customer> => {
  const response = await axiosClient.get(`/customers/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch customer");
  }

  return response.data.data?.customer ?? response.data.data;
};

export interface CustomerOrderSummary {
  _id: string;
  order_no: string;
  total: string;
  status: string;
  createdAt?: string;
  created_at?: string;
}

export const getCustomerOrders = async (id: string): Promise<CustomerOrderSummary[]> => {
  const response = await axiosClient.get(`/customers/${id}/orders`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch customer orders");
  }

  return response.data.data?.orders ?? response.data.data ?? [];
};

export interface CustomerPayload {
  name: string;
  phone: string;
  address?: string;
}

export const createCustomer = async (data: CustomerPayload): Promise<Customer> => {
  const response = await axiosClient.post("/customers", data);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create customer");
  }

  return response.data.data?.customer ?? response.data.data;
};

export const updateCustomer = async (id: string, data: CustomerPayload): Promise<Customer> => {
  const response = await axiosClient.put(`/customers/${id}`, data);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update customer");
  }

  return response.data.data?.customer ?? response.data.data;
};

