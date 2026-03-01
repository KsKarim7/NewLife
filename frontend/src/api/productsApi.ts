import axiosClient from "@/api/axiosClient";

export interface ProductCategoryRef {
  _id: string;
  name: string;
}

export interface Product {
  _id: string;
  name: string;
  product_code: string;
  category?: ProductCategoryRef | null;
  category_name?: string;
  unit: string;
  selling_price_taka: string;
  buying_price_taka: string;
  stock_qty: number;
  vat_enabled?: boolean;
  vat_percent?: number;
  description?: string;
  image_url?: string;
}

export interface ProductsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  category_id?: string | null;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const normalizeProduct = (item: any): Product => {
  const selling = item.selling_price ?? item.selling_price_taka ?? "0";
  const buying = item.buying_price ?? item.buying_price_taka ?? "0";

  return {
    _id: item._id,
    name: item.name,
    product_code: item.product_code ?? item.code ?? "",
    category: item.category ?? null,
    category_name: item.category_name ?? item.category?.name,
    unit: item.unit ?? "",
    selling_price_taka: String(selling),
    buying_price_taka: String(buying),
    stock_qty: item.stock_qty ?? item.stock ?? 0,
    vat_enabled: item.vat_enabled,
    vat_percent: item.vat_percent,
    description: item.description,
    image_url: item.image_url,
  };
};

export const getProducts = async (params: ProductsQueryParams): Promise<ProductsResponse> => {
  const response = await axiosClient.get("/products", {
    params,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch products");
  }

  const data = response.data.data ?? {};
  const rawProducts: any[] = data.products ?? data.items ?? [];
  const products = rawProducts.map(normalizeProduct);
  const pagination = data.pagination ?? {
    page: params.page ?? 1,
    limit: params.limit ?? products.length,
    total: products.length,
    totalPages: 1,
  };

  return {
    products,
    pagination,
  };
};

export interface ProductPayload {
  name: string;
  product_code: string;
  category_id: string;
  unit: string;
  selling_price: string;
  buying_price: string;
  vat_enabled?: boolean;
  vat_percent?: number;
  description?: string;
  image_url?: string;
}

export const getProductById = async (id: string): Promise<Product> => {
  const response = await axiosClient.get(`/products/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch product");
  }

  return normalizeProduct(response.data.data?.product ?? response.data.data);
};

export const createProduct = async (data: ProductPayload): Promise<Product> => {
  const response = await axiosClient.post("/products", data);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create product");
  }

  return normalizeProduct(response.data.data?.product ?? response.data.data);
};

export const updateProduct = async (id: string, data: ProductPayload): Promise<Product> => {
  const response = await axiosClient.put(`/products/${id}`, data);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update product");
  }

  return normalizeProduct(response.data.data?.product ?? response.data.data);
};

export const deleteProduct = async (id: string): Promise<void> => {
  const response = await axiosClient.delete(`/products/${id}`);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete product");
  }
};

export interface AdjustStockPayload {
  qty: number;
  reason: string;
}

export const adjustStock = async (id: string, data: AdjustStockPayload): Promise<void> => {
  const response = await axiosClient.post(`/products/${id}/adjust`, data);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to adjust stock");
  }
};

