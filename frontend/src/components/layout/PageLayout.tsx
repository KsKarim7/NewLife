import { ReactNode, useState } from "react";
import { AppSidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileSidebarDrawer } from "./MobileSidebarDrawer";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showPeriodFilter?: boolean;
}

export function PageLayout({
  children,
  title,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  showPeriodFilter = true,
}: PageLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:block">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Mobile sidebar overlay */}
      <MobileSidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300",
          collapsed ? "lg:ml-16" : "lg:ml-[220px]"
        )}
      >
        <Header
          searchPlaceholder={searchPlaceholder}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          showPeriodFilter={showPeriodFilter}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {title && <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-4 md:mb-6">{title}</h1>}
          {children}
        </main>
      </div>
    </div>
  );
}
