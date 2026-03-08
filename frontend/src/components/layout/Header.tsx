import { useEffect, useState } from "react";
import { Search, ChevronDown, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { getNextDayMode, setNextDayMode } from "@/api/nextDayApi";
import { usePeriod } from "@/context/PeriodContext";

interface HeaderProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showPeriodFilter?: boolean;
  onMenuClick?: () => void;
}

export function Header({
  searchPlaceholder = "Search products, orders, customers...",
  searchValue,
  onSearchChange,
  showPeriodFilter = true,
  onMenuClick,
}: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [nextDayMode, setNextDayModeState] = useState(false);
  const [isLoadingNextDayMode, setIsLoadingNextDayMode] = useState(false);
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo } = usePeriod();

  useEffect(() => {
    let isMounted = true;
    const loadMode = async () => {
      setIsLoadingNextDayMode(true);
      try {
        const state = await getNextDayMode();
        if (isMounted) {
          setNextDayModeState(state.next_day_mode);
        }
      } catch (error) {
        // Silent failure – UI will just show toggle as off
      } finally {
        if (isMounted) {
          setIsLoadingNextDayMode(false);
        }
      }
    };

    void loadMode();

    const intervalId = window.setInterval(() => {
      void getNextDayMode()
        .then((state) => {
          if (!isMounted) return;
          if (nextDayMode && !state.next_day_mode) {
            setNextDayModeState(false);
            toast({
              title: "Next Day Mode turned off",
              description: "Next Day Mode automatically turned off at midnight.",
            });
          } else if (!nextDayMode && state.next_day_mode) {
            setNextDayModeState(true);
          }
        })
        .catch(() => {
          // Ignore polling errors
        });
    }, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [nextDayMode, toast]);

  const handleToggleNextDayMode = async (checked: boolean) => {
    setNextDayModeState(checked);
    try {
      const state = await setNextDayMode(checked);
      setNextDayModeState(state.next_day_mode);
      toast({
        title: state.next_day_mode ? "Next Day Mode ON" : "Next Day Mode OFF",
        description: state.next_day_mode
          ? "New records will count as tomorrow's."
          : "New records will count as today's.",
      });
    } catch (error) {
      setNextDayModeState(!checked);
      toast({
        title: "Failed to update Next Day Mode",
        variant: "destructive",
      });
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  };

  const initials = getInitials(user?.name);

  return (
    <>
      <header className="h-[56px] md:h-[60px] bg-card border-b border-border flex items-center justify-between px-3 md:px-6 flex-shrink-0">
        {/* Left side */}
        <div className="flex items-center gap-2">
          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-foreground"
            onClick={onMenuClick}
          >
            <Menu size={22} />
          </button>

          {/* Search — desktop */}
          <div className="relative w-[300px] hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="pl-9 bg-muted border-0 h-9 text-sm"
            />
          </div>

          {/* Search icon — mobile */}
          <button
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={20} />
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Next Day toggle — hidden on mobile */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Next Day</span>
            <Switch
              checked={nextDayMode}
              disabled={isLoadingNextDayMode}
              onCheckedChange={handleToggleNextDayMode}
              className={nextDayMode ? "bg-destructive data-[state=checked]:bg-destructive" : "bg-emerald-500"}
            />
          </div>

          {/* Date range — hidden on mobile */}
          {showPeriodFilter && (
            <div className="hidden md:block">
              <Select
                value={period}
                onValueChange={(value) => setPeriod(value)}
              >
                <SelectTrigger className="w-[150px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom date range inputs — show only when custom is selected */}
          {showPeriodFilter && period === "custom" && (
            <div className="hidden md:flex items-center gap-2">
              <Input
                type="date"
                value={customFrom ?? ""}
                onChange={(e) => setCustomFrom(e.target.value)}
                placeholder="From"
                className="h-9 text-sm w-32"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo ?? ""}
                onChange={(e) => setCustomTo(e.target.value)}
                placeholder="To"
                className="h-9 text-sm w-32"
              />
            </div>
          )}

          {/* User */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 text-sm outline-none min-h-[44px]">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                {initials}
              </div>
              <span className="hidden md:block font-medium text-foreground">{user?.name ?? "User"}</span>
              <ChevronDown className="hidden md:block h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/settings")}>Settings</DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  void logout();
                }}
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="fixed top-[56px] left-0 right-0 z-40 bg-card border-b border-border px-4 py-2 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="pl-9 bg-muted border-0 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>
      )}
    </>
  );
}
