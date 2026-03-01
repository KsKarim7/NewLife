import axiosClient from "@/api/axiosClient";

export interface DashboardSalesPoint {
  label: string;
  amount_taka: string;
}

export interface DashboardTopProduct {
  name: string;
  qty_sold: number;
  revenue_taka: string;
}

export interface DashboardCategoryPoint {
  name: string;
  qty: number;
  revenue_taka?: string;
}

export interface DashboardRecentOrder {
  order_number: string;
  customer_name: string;
  total_taka: string;
  status: string;
  date: string;
}

export interface DashboardStats {
  total_products: number;
  todays_sales_taka: string;
  total_orders_this_month: number;
  low_stock_count: number;
  sales_over_time: {
    current_period: DashboardSalesPoint[];
    previous_period: DashboardSalesPoint[];
  };
  top_products: DashboardTopProduct[];
  sales_by_category: DashboardCategoryPoint[];
  recent_orders: DashboardRecentOrder[];
}

export const getDashboardStats = async (period: string): Promise<DashboardStats> => {
  const response = await axiosClient.get("/dashboard/stats", {
    params: { period },
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch dashboard stats");
  }

  return response.data.data as DashboardStats;
};

