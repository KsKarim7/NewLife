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

const normalizeProduct = (item: Partial<Product> & Record<string, unknown>): Product => {
  // Handle selling price - be defensive about multiple formats
  // The backend stores prices in paisa, converts to taka string for transmission
  let selling = "0";

  // Try to find selling price in order of preference
  if (item.selling_price_taka && item.selling_price_taka > 0) {
    selling = String(item.selling_price_taka);
  } else if (item.selling_price && item.selling_price > 0) {
    selling = String(item.selling_price);
  } else if (item.selling_price_paisa !== undefined && item.selling_price_paisa !== null) {
    const val = item.selling_price_paisa;
    if (typeof val === "number") {
      if (val > 100) {
        selling = (val / 100).toFixed(2);
      } else {
        selling = val.toFixed(2);
      }
    } else {
      selling = String(val);
    }
  }

  // Same for buying price
  let buying = "0";

  if (item.buying_price_taka && item.buying_price_taka > 0) {
    buying = String(item.buying_price_taka);
  } else if (item.buying_price && item.buying_price > 0) {
    buying = String(item.buying_price);
  } else if (item.buying_price_paisa !== undefined && item.buying_price_paisa !== null) {
    const val = item.buying_price_paisa;
    if (typeof val === "number") {
      if (val > 100) {
        buying = (val / 100).toFixed(2);
      } else {
        buying = val.toFixed(2);
      }
    } else {
      buying = String(val);
    }
  }

  // Handle category from populated category_id or category field
  const category = item.category ?? item.category_id ?? null;
  const categoryName = item.category_name ?? category?.name ?? "";

  return {
    _id: item._id,
    name: item.name,
    product_code: item.product_code ?? item.code ?? "",
    category: category,
    category_name: categoryName,
    unit: item.unit ?? "",
    selling_price_taka: String(selling),
    buying_price_taka: String(buying),
    stock_qty: item.stock_qty ?? item.stock ?? item.on_hand ?? 0,
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
  const rawProducts: Array<Partial<Product> & Record<string, unknown>> = data.products ?? data.items ?? [];
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
  stock_qty?: number;
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

export const adjustStock = async (id: string, data: AdjustStockPayload): Promise<Product> => {
  const response = await axiosClient.post(`/products/${id}/adjust`, data);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to adjust stock");
  }

  return normalizeProduct(response.data.data?.product ?? response.data.data);
};

