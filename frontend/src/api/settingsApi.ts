import axiosClient from "@/api/axiosClient";

// Store Information
export interface StoreInfo {
  store_name?: string;
  owner_name?: string;
  phone_number?: string;
  email_address?: string;
  physical_address?: string;
  city?: string;
  logo_url?: string;
  currency_symbol: string;
}

export interface Settings {
  _id: string;
  store_info: StoreInfo;
  purge_after_days: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateStoreInfoPayload {
  store_name?: string;
  owner_name?: string;
  phone_number?: string;
  email_address?: string;
  physical_address?: string;
  city?: string;
  logo_url?: string;
}

// Retention
export interface RetentionSettings {
  purge_after_days: number;
}

export interface UpdateRetentionPayload {
  purge_after_days: number;
}

// User Management
export interface User {
  _id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "staff";
  phone?: string;
  is_active: boolean;
  last_login?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: "manager" | "staff";
  password: string;
  phone?: string;
}

export interface UpdateUserPayload {
  name?: string;
  phone?: string;
}

// Normalization functions
const normalizeSettings = (item: Partial<Settings> & Record<string, unknown>): Settings => {
  return {
    _id: item._id || "",
    store_info: {
      store_name: item.store_info?.store_name || "",
      owner_name: item.store_info?.owner_name || "",
      phone_number: item.store_info?.phone_number || "",
      email_address: item.store_info?.email_address || "",
      physical_address: item.store_info?.physical_address || "",
      city: item.store_info?.city || "",
      logo_url: item.store_info?.logo_url || "",
      currency_symbol: item.store_info?.currency_symbol || "৳",
    },
    purge_after_days: item.purge_after_days || 30,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
};

const normalizeUser = (item: Partial<User> & Record<string, unknown>): User => {
  return {
    _id: item._id || "",
    name: item.name || "",
    email: item.email || "",
    role: item.role || "staff",
    phone: item.phone,
    is_active: item.is_active !== false,
    last_login: item.last_login,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt,
  };
};

// Store Information API
export const getSettings = async (): Promise<Settings> => {
  const response = await axiosClient.get("/settings");

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch settings");
  }

  return normalizeSettings(response.data.data);
};

export const updateStoreInfo = async (payload: UpdateStoreInfoPayload): Promise<Settings> => {
  const response = await axiosClient.patch("/settings", payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update store information");
  }

  return normalizeSettings(response.data.data);
};

// Retention Settings API
export const getRetentionSettings = async (): Promise<RetentionSettings> => {
  const response = await axiosClient.get("/settings/retention");

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch retention settings");
  }

  return {
    purge_after_days: response.data.data.purge_after_days || 30,
  };
};

export const updateRetention = async (payload: UpdateRetentionPayload): Promise<RetentionSettings> => {
  const response = await axiosClient.patch("/settings/retention", payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update retention settings");
  }

  return {
    purge_after_days: response.data.data.purge_after_days || 30,
  };
};

// User Management API
export const listUsers = async (page: number = 1, limit: number = 10): Promise<UsersResponse> => {
  const response = await axiosClient.get("/settings/users", {
    params: { page, limit },
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch users");
  }

  return {
    users: response.data.data.map(normalizeUser),
    pagination: response.data.pagination || { page, limit, total: 0, pages: 0 },
  };
};

export const createUser = async (payload: CreateUserPayload): Promise<User> => {
  const response = await axiosClient.post("/settings/users", payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create user");
  }

  return normalizeUser(response.data.data);
};

export const updateUser = async (id: string, payload: UpdateUserPayload): Promise<User> => {
  const response = await axiosClient.patch(`/settings/users/${id}`, payload);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update user");
  }

  return normalizeUser(response.data.data);
};

export const deactivateUser = async (id: string): Promise<User> => {
  const response = await axiosClient.post(`/settings/users/${id}/deactivate`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to deactivate user");
  }

  return normalizeUser(response.data.data);
};
