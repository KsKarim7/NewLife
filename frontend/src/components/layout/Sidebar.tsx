import { Link, useLocation } from "react-router-dom";
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
  { title: "Settings", url: "/settings", icon: Settings },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 z-50",
        collapsed ? "w-16" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[60px] border-b border-sidebar-border">
        <Package className="h-6 w-6 text-secondary flex-shrink-0" />
        {!collapsed && <span className="text-lg font-bold tracking-tight">IMS</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
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
            JD
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">John Doe</p>
              <p className="text-xs text-sidebar-foreground/60">Owner</p>
            </div>
          )}
          {!collapsed && (
            <button className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
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
