import axiosClient from "@/api/axiosClient";

export interface Category {
  _id: string;
  name: string;
  description?: string;
}

export interface CategoryPayload {
  name: string;
  description?: string;
}

interface CategoryApiError extends Error {
  status?: number;
  response?: unknown;
}

export const getCategories = async (): Promise<Category[]> => {
  const response = await axiosClient.get("/categories");
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch categories");
  }

  const categories: Category[] = response.data.data?.categories ?? response.data.data ?? [];
  return categories;
};

export const createCategory = async (data: CategoryPayload): Promise<Category> => {
  const response = await axiosClient.post("/categories", data);
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create category");
  }
  return response.data.data?.category ?? response.data.data;
};

export const updateCategory = async (id: string, data: CategoryPayload): Promise<Category> => {
  const response = await axiosClient.put(`/categories/${id}`, data);
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update category");
  }
  return response.data.data?.category ?? response.data.data;
};

export const deleteCategory = async (id: string): Promise<void> => {
  const response = await axiosClient.delete(`/categories/${id}`);
  if (!response.data?.success) {
    // Surface API error message so consumers (e.g., Inventory page) can show it via toast
    const message: string = response.data?.message || "Failed to delete category";
    const error: CategoryApiError = new Error(message);
    error.status = response.status;
    error.response = response;
    throw error;
  }
};

