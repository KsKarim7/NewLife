import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Package, ShoppingCart, Undo2, Truck,
  RefreshCw, Wallet, Activity, BarChart3, Settings, LogOut, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { getSettings } from "@/api/settingsApi";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Orders & Sales", url: "/orders", icon: ShoppingCart },
  { title: "Sales Returns", url: "/sales-returns", icon: Undo2 },
  { title: "Purchases", url: "/purchases", icon: Truck },
  { title: "Purchase Returns", url: "/purchase-returns", icon: RefreshCw },
  { title: "Expenses", url: "/expenses", icon: Wallet },
  { title: "Stock Log", url: "/stock-log", icon: Activity },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebarDrawer({ open, onClose }: MobileSidebarDrawerProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Drawer */}
      <div className="absolute left-0 top-0 h-full w-[260px] bg-sidebar text-sidebar-foreground z-10 flex flex-col animate-in slide-in-from-left duration-300">
        {/* Close */}
        <button
          className="absolute top-4 right-4 text-sidebar-foreground/70 hover:text-sidebar-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        {/* Logo */}
        <Link to="/" onClick={onClose} className="flex items-center gap-2 px-4 h-[60px] border-b border-sidebar-border hover:opacity-80 transition-opacity">
          <div className="flex-shrink-0 h-[40px] w-[40px] flex items-center justify-center">
            {settings?.store_info.logo_base64 || settings?.store_info.logo_url ? (
              <img
                src={settings.store_info.logo_base64 || settings.store_info.logo_url}
                alt="Store Logo"
                className="h-[40px] w-[40px] object-contain rounded-md"
              />
            ) : (
              <Package className="h-6 w-6 text-secondary flex-shrink-0" />
            )}
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-bold truncate">{settings?.store_info.store_name || "IMS"}</span>
            {(settings?.store_info.physical_address || settings?.store_info.city) && (
              <span className="text-xs text-sidebar-foreground/60 truncate">
                {[settings?.store_info.physical_address, settings?.store_info.city]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            )}
          </div>
        </Link>

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
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors min-h-[44px]",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                    <span>{item.title}</span>
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
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
              <p className="text-xs text-sidebar-foreground/60">{capitalizeRole(user?.role)}</p>
            </div>
            <button
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={async () => {
                await logout();
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
