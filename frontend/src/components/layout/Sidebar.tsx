import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Undo2,
  Truck,
  RefreshCw,
  Wallet,
  Activity,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { getSettings } from "@/api/settingsApi";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Orders & Sales", url: "/orders", icon: ShoppingCart },
  { title: "Sales Returns", url: "/sales-returns", icon: Undo2 },
  { title: "Purchases", url: "/purchases", icon: Truck },
  { title: "Purchase Returns", url: "/purchase-returns", icon: RefreshCw },
  { title: "Expenses", url: "/expenses", icon: Wallet },
  { title: "Stock Log", url: "/stock-log", icon: Activity },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings, ownerOnly: true },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Fetch settings to display logo
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  // Filter nav items based on user role
  const visibleNavItems = navItems.filter((item) => {
    if ((item as any).ownerOnly && user?.role !== "owner") {
      return false;
    }
    return true;
  });

  // Generate user initials
  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  };

  // Capitalize role
  const capitalizeRole = (role?: string | null) => {
    if (!role) return "User";
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  const userInitials = getInitials(user?.name);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 z-50",
        collapsed ? "w-16" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 px-4 h-[60px] border-b border-sidebar-border hover:opacity-80 transition-opacity">
        {/* Logo — 60×60px */}
        <div className="flex-shrink-0 h-[60px] w-[60px] flex items-center justify-center">
          {settings?.store_info.logo_base64 ? (
            <img
              src={settings.store_info.logo_base64}
              alt="Store Logo"
              className="h-[60px] w-[60px] object-contain rounded-md"
            />
          ) : (
            <div className="h-[60px] w-[60px] flex items-center justify-center rounded-md bg-primary/10">
              <Package className="h-8 w-8 text-secondary flex-shrink-0" />
            </div>
          )}
        </div>

        {/* Store name and address */}
        {!collapsed && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-semibold text-sm text-sidebar-foreground truncate">
              {settings?.store_info.store_name || "New Life"}
            </span>
            <span className="text-xs text-sidebar-foreground/60 truncate">
              {settings?.store_info.physical_address || "New Market"}
            </span>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.url ||
              (item.url !== "/" && location.pathname.startsWith(item.url));
            return (
              <li key={item.url}>
                <Link
                  to={item.url}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom user */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground flex-shrink-0">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
              <p className="text-xs text-sidebar-foreground/60">{capitalizeRole(user?.role)}</p>
            </div>
          )}
          {!collapsed && (
            <button
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              onClick={async () => {
                await logout();
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[72px] h-6 w-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
}
