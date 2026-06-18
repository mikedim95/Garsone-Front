import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import type {
  CartItem,
  CookSummary,
  ManagerItemSummary,
  ManagerTableSummary,
  MenuCategory,
  MenuItem,
  Modifier,
  Order,
  OrderStatus,
  QRTile,
  Table,
  WaiterSummary,
  WaiterTableAssignment,
} from "@/types";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api";
import { DashboardHeader } from "@/components/DashboardHeader";
import {
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Download,
  BarChart2,
  ListChecks,
  Users,
  UtensilsCrossed,
  RefreshCcw,
  ChefHat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveStoreDisplayName } from "@/lib/storeSlug";
import { Card } from "@/components/ui/card";
import { ManagerMenuPanel } from "@/features/manager/ManagerMenuPanel";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import type { TooltipProps } from "recharts";

// Type aliases for recharts types that are not exported
type ValueType = string | number | Array<string | number>;
type NameType = string | number;
interface TooltipPayload<TValue, TName> {
  payload?: Record<string, any>;
  name?: TName;
  value?: TValue;
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogFormField,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardGridSkeleton } from "@/components/ui/dashboard-skeletons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageTransition } from "@/components/ui/page-transition";
import { setStoredStoreSlug } from "@/lib/storeSlug";
import { useToast } from "@/components/ui/use-toast";

type ManagerMode = "basic" | "pro";
type ManagerTab = "economics" | "orders" | "personnel" | "menu";
type EconRange = "today" | "last24h" | "week" | "month" | "custom";
type MenuCategoryMode = "units" | "share";
type ActiveWaiter = WaiterSummary & {
  originalDisplayName?: string;
};
type ActiveCook = CookSummary & {
  originalDisplayName?: string;
  originalPrinterTopic?: string | null;
};
type StaffRosterMember = {
  id: string;
  email: string;
  displayName: string;
  isHybrid: boolean;
  waiterDetail?: {
    waiter: WaiterSummary;
    assignedTables: WaiterAssignedTable[];
    shiftOn: boolean;
    ordersHandled: number;
  };
  cook?: CookSummary;
};
type ActiveHybrid = StaffRosterMember & {
  originalDisplayName?: string;
  printerTopic?: string | null;
  originalPrinterTopic?: string | null;
};
type TableSummary = {
  id: string;
  label: string;
  active: boolean;
  isActive: boolean;
  waiterCount: number;
  orderCount: number;
  openOrders: number;
};
interface WaiterForm {
  email: string;
  displayName: string;
  password: string;
  printerTopic?: string | null;
  hybrid?: boolean;
}
interface CookForm {
  email: string;
  displayName: string;
  password: string;
  printerTopic?: string | null;
}
type WaiterAssignedTable = { id: string; label: string; active: boolean };

const STATUS_THRESHOLD_MINUTES: Partial<Record<OrderStatus, number>> = {
  PLACED: 10,
  PREPARING: 15,
  READY: 8,
};
const NO_PRINTER_VALUE = "__none__";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pickLabel = (value?: unknown) =>
  isNonEmptyString(value) ? value.trim() : null;

const buildPrinterOptions = (base: string[]) => base;

const resolvePrinterValue = (value: string | null | undefined, printers: string[]) => {
  if (!value) return NO_PRINTER_VALUE;
  return printers.includes(value) ? value : NO_PRINTER_VALUE;
};

const normalizeTableSummary = (
  table: Partial<Table> & { id?: string; label?: string }
): TableSummary => ({
  id: table.id ?? "",
  label: table.label ?? "",
  active: table.isActive ?? table.active ?? true,
  isActive: table.isActive ?? table.active ?? true,
  waiterCount: 0,
  orderCount: 0,
  openOrders: 0,
});

const extractMenuItem = (source?: unknown): Partial<MenuItem> | null => {
  if (!source || typeof source !== "object") return null;
  if (
    "item" in source &&
    typeof (source as { item?: unknown }).item === "object"
  ) {
    return (source as { item?: Partial<MenuItem> }).item ?? null;
  }
  return source as Partial<MenuItem>;
};

const getLineQuantity = (
  line?: CartItem | { quantity?: number; qty?: number }
) => {
  if (!line) return 1;
  const raw =
    "quantity" in line ? line.quantity : "qty" in line ? line.qty : undefined;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 1;
};

const ProBadge = () => (
  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] shadow-sm">
    ★
  </span>
);

const shortenChartLabel = (value: string, maxLength = 10) =>
  value.length > maxLength
    ? `${value.slice(0, Math.max(3, maxLength - 1))}…`
    : value;

const isWaiterCallEvent = (
  payload: unknown
): payload is { tableId?: string; action?: string; ts?: string } =>
  isRecord(payload) &&
  (typeof payload.tableId === "string" || typeof payload.action === "string");

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, days: number) =>
  new Date(d.getTime() + days * 86400000);
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const withinRange = (d: Date | null, start: Date, end: Date) => {
  if (!d) return false;
  const isWholeDayWindow =
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    start.getSeconds() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0;
  if (isWholeDayWindow) {
    const endExclusive = addDays(end, 1);
    return d >= start && d < endExclusive;
  }
  return d >= start && d <= end;
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPlacedDate = (order: Order) =>
  parseDate(order.placedAt) || parseDate(order.createdAt) || new Date();

const getUpdatedDate = (order: Order) =>
  parseDate(order.updatedAt) ||
  parseDate(order.placedAt) ||
  parseDate(order.createdAt) ||
  new Date();

const getServedDate = (order: Order) =>
  parseDate((order as any).paidAt) ||
  parseDate(order.servedAt) ||
  (isServedStatus(order.status) ? getUpdatedDate(order) : null);
const getRevenueDate = (order: Order) =>
  getServedDate(order) || getPlacedDate(order);

const getOrderTotalCents = (order: Order) => {
  if (
    typeof order.totalCents === "number" &&
    Number.isFinite(order.totalCents)
  ) {
    return order.totalCents;
  }
  return Math.round((order.total ?? 0) * 100);
};

const getOrderRevenue = (order: Order) => {
  const lines = order.items ?? [];
  const lineSum =
    lines.reduce(
      (sum, line) => sum + unitPrice(line) * getLineQuantity(line),
      0
    ) || 0;
  if (lineSum > 0) return lineSum;
  const fallbackCents = getOrderTotalCents(order);
  return fallbackCents / 100;
};

const minutesBetween = (start: Date | null, end: Date | null) => {
  if (!start || !end) return null;
  const minutes = (end.getTime() - start.getTime()) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[idx];
};

const isServedStatus = (status: OrderStatus) =>
  status === "SERVED" || status === "PAID";
const isClosedStatus = (status: OrderStatus) =>
  isServedStatus(status) || status === "CANCELLED";

const formatMinutesValue = (value: number | null) => {
  if (value == null) return "—";
  if (value >= 100) return Math.round(value).toString();
  return value.toFixed(1);
};

const orderLabel = (order: Order) =>
  order.ticketNumber != null
    ? `Ticket #${order.ticketNumber}`
    : `#${order.id.slice(-6).toUpperCase()}`;

const daypartOf = (date: Date) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "Breakfast";
  if (hour >= 11 && hour < 15) return "Lunch";
  if (hour >= 15 && hour < 18) return "Afternoon";
  if (hour >= 18 && hour < 22) return "Evening";
  return "Late";
};

const unitPrice = (
  line?:
    | CartItem
    | { item?: Partial<MenuItem>; price?: number; priceCents?: number }
) => {
  if (!line) return 0;
  if (typeof (line as { unitPrice?: number }).unitPrice === "number") {
    return (line as { unitPrice: number }).unitPrice;
  }
  if (
    typeof (line as { unitPriceCents?: number }).unitPriceCents === "number"
  ) {
    return ((line as { unitPriceCents: number }).unitPriceCents || 0) / 100;
  }
  if (typeof (line as { price?: number }).price === "number") {
    return (line as { price: number }).price;
  }
  if (typeof (line as { priceCents?: number }).priceCents === "number") {
    return ((line as { priceCents: number }).priceCents || 0) / 100;
  }
  const item = extractMenuItem(line);
  if (!item) return 0;
  if (typeof item.price === "number") return item.price;
  if (typeof item.priceCents === "number") return item.priceCents / 100;
  return 0;
};

const LS_ORDERS_KEY = "MANAGER_ORDERS_CACHE";
const LS_ORDERS_TS_KEY = "MANAGER_ORDERS_CACHE_TS";
export default function ManagerDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout, isAuthenticated } = useAuthStore();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const isMobile = useIsMobile();
  const isManagerRole = user?.role === "manager" || user?.role === "architect";
  const uncategorizedLabel = t("manager.uncategorized", {
    defaultValue: "Uncategorized",
  });
  const itemFallbackLabel = t("manager.item", { defaultValue: "Item" });
  const minutesShortLabel = t("manager.minutes_short", { defaultValue: "min" });
  const formatStatusLabel = useCallback(
    (status: OrderStatus) => t(`status.${status}`, { defaultValue: status }),
    [t]
  );
  const formatDaypartLabel = useCallback(
    (label: string) => {
      const key = label.toLowerCase();
      const labels: Record<string, string> = {
        breakfast: t("manager.daypart_breakfast", {
          defaultValue: "Breakfast",
        }),
        lunch: t("manager.daypart_lunch", { defaultValue: "Lunch" }),
        afternoon: t("manager.daypart_afternoon", {
          defaultValue: "Afternoon",
        }),
        evening: t("manager.daypart_evening", { defaultValue: "Evening" }),
        late: t("manager.daypart_late", { defaultValue: "Late" }),
      };
      return labels[key] ?? label;
    },
    [t]
  );
  const formatStatusAxisLabel = useCallback(
    (status: OrderStatus) => {
      const full = formatStatusLabel(status);
      if (!isMobile) return full;
      const compact: Record<OrderStatus, string> = {
        PLACED: shortenChartLabel(full, 4),
        PREPARING: shortenChartLabel(full, 5),
        READY: shortenChartLabel(full, 5),
        SERVED: shortenChartLabel(full, 5),
        PAID: shortenChartLabel(full, 4),
        CANCELLED: shortenChartLabel(full, 5),
      };
      return compact[status];
    },
    [formatStatusLabel, isMobile]
  );
  const formatDaypartAxisLabel = useCallback(
    (label: string) => {
      const translated = formatDaypartLabel(label);
      return isMobile ? shortenChartLabel(translated, 6) : translated;
    },
    [formatDaypartLabel, isMobile]
  );
  const formatCategoryAxisLabel = useCallback(
    (label: string) => (isMobile ? shortenChartLabel(label, 8) : label),
    [isMobile]
  );

  const ordersAll = useOrdersStore((s) => s.orders);
  const setOrdersLocal = useOrdersStore((s) => s.setOrders);

  const [assignments, setAssignments] = useState<WaiterTableAssignment[]>([]);
  const [waiters, setWaiters] = useState<WaiterSummary[]>([]);
  const [cooks, setCooks] = useState<CookSummary[]>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loadingWaiters, setLoadingWaiters] = useState(true);
  const [loadingCooks, setLoadingCooks] = useState(true);
  const [managerTables, setManagerTables] = useState<ManagerTableSummary[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(() => {
    try {
      return localStorage.getItem("STORE_NAME");
    } catch {
      return null;
    }
  });
  const [printerTopics, setPrinterTopics] = useState<string[]>([]);
  const [qrTiles, setQrTiles] = useState<QRTile[]>([]);
  const [loadingQrTiles, setLoadingQrTiles] = useState(false);
  const [updatingTileId, setUpdatingTileId] = useState<string | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeWaiter, setActiveWaiter] = useState<ActiveWaiter | null>(null);
  const [editCookModalOpen, setEditCookModalOpen] = useState(false);
  const [activeCook, setActiveCook] = useState<ActiveCook | null>(null);
  const [hybridModalOpen, setHybridModalOpen] = useState(false);
  const [activeHybrid, setActiveHybrid] = useState<ActiveHybrid | null>(null);
  const [initialTableSelection, setInitialTableSelection] = useState<
    Set<string>
  >(new Set());
  const [tableSelection, setTableSelection] = useState<Set<string>>(new Set());
  const [newWaiterTableSelection, setNewWaiterTableSelection] = useState<Set<string>>(new Set());
  const [savingWaiter, setSavingWaiter] = useState(false);
  const [savingCook, setSavingCook] = useState(false);
  const [savingHybrid, setSavingHybrid] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newWaiter, setNewWaiter] = useState<WaiterForm>({
    email: "",
    displayName: "",
    password: "",
    printerTopic: null,
    hybrid: false,
  });
  const [addingWaiter, setAddingWaiter] = useState(false);
  const [deletingWaiterId, setDeletingWaiterId] = useState<string | null>(null);
  const [addCookModalOpen, setAddCookModalOpen] = useState(false);
  const [newCook, setNewCook] = useState<CookForm>({
    email: "",
    displayName: "",
    password: "",
    printerTopic: null,
  });
  const [addingCook, setAddingCook] = useState(false);
  const [deletingCookId, setDeletingCookId] = useState<string | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [tableForm, setTableForm] = useState<{
    id?: string;
    label: string;
    isActive: boolean;
    qrTileId: string;
  }>({
    label: "",
    isActive: true,
    qrTileId: "unassigned",
  });
  const [savingTable, setSavingTable] = useState(false);
  const [tableDeletingId, setTableDeletingId] = useState<string | null>(null);
  const [menuCategoryLookup, setMenuCategoryLookup] = useState<
    Map<string, string>
  >(new Map());
  const [menuMetaReady, setMenuMetaReady] = useState(false);
  const [managerMode, setManagerMode] = useState<ManagerMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("MANAGER_MODE");
        if (saved === "basic" || saved === "pro") return saved;
      } catch {
        // ignore
      }
    }
    return "basic";
  });
  const [activeTab, setActiveTab] = useState<ManagerTab>("economics");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [econRange, setEconRange] = useState<EconRange>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("MANAGER_ECON_RANGE");
        if (
          saved === "today" ||
          saved === "last24h" ||
          saved === "week" ||
          saved === "month" ||
          saved === "custom"
        )
          return saved as EconRange;
      } catch {
        // ignore
      }
    }
    return "week";
  });
  const [customRange, setCustomRange] = useState<{
    start: string;
    end: string;
  }>(() => {
    const end = new Date();
    const start = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() - 6
    );
    const toInput = (d: Date) => d.toISOString().slice(0, 10);
    return { start: toInput(start), end: toInput(end) };
  });
  const [menuCategoryMode, setMenuCategoryMode] =
    useState<MenuCategoryMode>("units");
  const [modifierLookup, setModifierLookup] = useState<Map<string, string>>(
    new Map()
  );

  useEffect(() => {
    if (!isAuthenticated() || !isManagerRole) {
      navigate("/login");
    }
  }, [isAuthenticated, isManagerRole, navigate]);

  // Load store info to know storeId for QR tile binding and cache slug/name for other screens
  useEffect(() => {
    if (!isAuthenticated() || !isManagerRole) return;
    (async () => {
      try {
        const res = await api.getStore();
        if (res?.store?.id) setStoreId(res.store.id);
        if (res?.store?.slug) {
          try {
            setStoredStoreSlug(res.store.slug);
          } catch {}
        }
        if (res?.store?.name) {
          setStoreName(res.store.name);
          try {
            localStorage.setItem("STORE_NAME", res.store.name);
          } catch {}
        }
        const rawPrinters =
          (res as any)?.store?.settings?.printers ??
          (res as any)?.store?.settingsJson?.printers ??
          (res as any)?.store?.printers ??
          [];
        if (Array.isArray(rawPrinters)) {
          const cleaned = Array.from(
            new Set(
              rawPrinters
                .map((printer) =>
                  typeof printer === "string" ? printer.trim() : ""
                )
                .filter(Boolean)
            )
          );
          setPrinterTopics(cleaned);
        } else {
          setPrinterTopics([]);
        }
      } catch (error) {
        console.error("Failed to load store info", error);
      }
    })();
  }, [isAuthenticated, isManagerRole]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    const initOrders = async () => {
      try {
        // Hydrate from local cache first (if available)
        try {
          const cached = localStorage.getItem(LS_ORDERS_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            const orders = Array.isArray(parsed) ? parsed : parsed?.orders;
            if (Array.isArray(orders) && orders.length) {
              setOrdersLocal(orders);
            }
          }
        } catch (err) {
          console.warn("[Orders cache] failed to read cache", err);
        }

        const take = 5000;
        const ordersRes = await api.getOrders({ take });
        const fetched = ordersRes.orders ?? [];
        setOrdersLocal(fetched);
        try {
          const placed = fetched
            .map((o) => getPlacedDate(o))
            .filter(
              (d): d is Date => d instanceof Date && !Number.isNaN(d.getTime())
            )
            .map((d) => d.getTime())
            .sort((a, b) => a - b);
          const byStatus = fetched.reduce<Record<string, number>>((acc, o) => {
            const key = o.status || "UNKNOWN";
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {});
          console.log("[Orders fetch] fetched orders", {
            requested: take,
            count: fetched.length,
            byStatus,
            earliestPlaced: placed.length
              ? new Date(placed[0]).toISOString()
              : null,
            latestPlaced: placed.length
              ? new Date(placed[placed.length - 1]).toISOString()
              : null,
          });
          try {
            localStorage.setItem(LS_ORDERS_KEY, JSON.stringify(fetched));
            localStorage.setItem(LS_ORDERS_TS_KEY, new Date().toISOString());
          } catch (err) {
            console.warn("[Orders cache] failed to persist cache", err);
          }
        } catch (err) {
          console.warn("[Orders fetch] failed to summarise orders", err);
        }
      } catch (error) {
        console.error("Failed to load orders", error);
      } finally {
        setOrdersLoading(false);
      }
    };
    if (isAuthenticated() && isManagerRole) {
      initOrders();
    } else {
      setOrdersLoading(false);
    }
  }, [isAuthenticated, isManagerRole, setOrdersLocal]);

  const loadWaiterData = async () => {
    setLoadingWaiters(true);
    try {
      const data = await api.getWaiterTables();
      setAssignments(data.assignments ?? []);
      setWaiters(data.waiters ?? []);
    } catch (error) {
      console.error("Failed to load waiter data", error);
    } finally {
      setLoadingWaiters(false);
    }
  };

  const loadCookData = async () => {
    setLoadingCooks(true);
    try {
      const data = await api.listCooks();
      setCooks(data.cooks ?? []);
    } catch (error) {
      console.error("Failed to load cook data", error);
    } finally {
      setLoadingCooks(false);
    }
  };

  const loadManagerTables = async () => {
    setLoadingTables(true);
    try {
      const data = await api.managerListTables();
      const list: ManagerTableSummary[] = (data.tables ?? []).map((table) => ({
        id: table.id,
        label: table.label,
        isActive: table.isActive,
        waiterCount: table.waiterCount ?? 0,
        orderCount: table.orderCount ?? 0,
      }));
      setManagerTables(list);
      setTables(
        list.map((table) => ({
          id: table.id,
          label: table.label,
          active: table.isActive,
          isActive: table.isActive,
          waiterCount: table.waiterCount || 0,
          orderCount: table.orderCount || 0,
          openOrders: table.openOrders || 0,
        }))
      );
    } catch (error) {
      console.error("Failed to load tables", error);
    } finally {
      setLoadingTables(false);
    }
  };

  const loadQrTiles = useCallback(async (sid: string) => {
    setLoadingQrTiles(true);
    try {
      const data = await api.managerListQrTiles(sid);
      setQrTiles(data.tiles ?? []);
    } catch (error) {
      console.error("Failed to load QR tiles", error);
    } finally {
      setLoadingQrTiles(false);
    }
  }, []);

  const handleUpdateQrTile = useCallback(
    async (
      tileId: string,
      data: { tableId?: string | null; isActive?: boolean }
    ) => {
      if (!storeId) return;
      setUpdatingTileId(tileId);
      try {
        const res = await api.managerUpdateQrTile(tileId, data);
        const updated = res.tile;
        setQrTiles((prev) => {
          const idx = prev.findIndex((t) => t.id === updated.id);
          if (idx === -1) return [updated, ...prev];
          const next = [...prev];
          next[idx] = { ...next[idx], ...updated };
          return next;
        });
      } catch (error) {
        console.error("Failed to update QR tile", error);
      } finally {
        setUpdatingTileId(null);
      }
    },
    [storeId]
  );

  useEffect(() => {
    if (isAuthenticated() && isManagerRole) {
      loadWaiterData();
      loadCookData();
      loadManagerTables();
    }
  }, [isAuthenticated, isManagerRole]);

  useEffect(() => {
    if (isAuthenticated() && isManagerRole && storeId) {
      loadQrTiles(storeId);
    }
  }, [isAuthenticated, isManagerRole, storeId, loadQrTiles]);

  useEffect(() => {
    try {
      localStorage.setItem("MANAGER_MODE", managerMode);
    } catch {
      // ignore
    }
  }, [managerMode]);

  useEffect(() => {
    try {
      localStorage.setItem("MANAGER_ECON_RANGE", econRange);
      if (econRange === "custom") {
        localStorage.setItem("MANAGER_ECON_CUSTOM_START", customRange.start);
        localStorage.setItem("MANAGER_ECON_CUSTOM_END", customRange.end);
      }
    } catch {
      // ignore
    }
  }, [econRange, customRange]);

  useEffect(() => {
    const loadMenuMetadata = async () => {
      try {
        const [itemsRes, categoriesRes, modifiersRes] = await Promise.all([
          api.listItems(),
          api.listCategories(),
          api.listModifiers?.() ?? Promise.resolve({ modifiers: [] }),
        ]);
        const categoriesMap = new Map<string, string>();
        (categoriesRes?.categories ?? []).forEach((category) => {
          if (!category?.id || typeof category !== "object") return;
          const label =
            pickLabel((category as MenuCategory).title) ??
            pickLabel((category as any).titleEn) ??
            pickLabel((category as any).titleEl);
          if (label) {
            categoriesMap.set(category.id, label);
          }
        });
        const lookup = new Map<string, string>();
        (itemsRes?.items ?? []).forEach((item: ManagerItemSummary) => {
          if (!item?.id) return;
          const label =
            pickLabel(item.category as unknown) ??
            (item.categoryId ? categoriesMap.get(item.categoryId) : null) ??
            pickLabel((item as { categoryTitle?: string }).categoryTitle) ??
            pickLabel((item as { categoryName?: string }).categoryName);
          if (label) {
            lookup.set(item.id, label);
          }
        });
        setMenuCategoryLookup(lookup);
        const modLookup = new Map<string, string>();
        (modifiersRes?.modifiers ?? []).forEach((modifier: Modifier) => {
          if (modifier?.id && pickLabel(modifier.title)) {
            modLookup.set(modifier.id, pickLabel(modifier.title)!);
          }
        });
        setModifierLookup(modLookup);
        setMenuMetaReady(true);
      } catch (error) {
        console.error("Failed to load menu metadata", error);
        setMenuMetaReady(true);
      }
    };
    if (isAuthenticated() && isManagerRole) {
      loadMenuMetadata();
    }
  }, [isAuthenticated, isManagerRole]);

  const waiterAssignmentsMap = useMemo(() => {
    const map = new Map<string, Table[]>();
    assignments.forEach((assignment) => {
      if (!assignment.waiterId || !assignment.table) return;
      const current = map.get(assignment.waiterId);
      if (current) {
        current.push(assignment.table);
      } else {
        map.set(assignment.waiterId, [assignment.table]);
      }
    });
    return map;
  }, [assignments]);

  const openEditWaiter = (waiter: WaiterSummary) => {
    const assigned = waiterAssignmentsMap.get(waiter.id) ?? [];
    const assignedIds = assigned
      .map((table) => table.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    setActiveWaiter({
      ...waiter,
      originalDisplayName: waiter.displayName,
    });
    setTableSelection(new Set(assignedIds));
    setInitialTableSelection(new Set(assignedIds));
    setEditModalOpen(true);
  };

  const openEditCook = (cook: CookSummary) => {
    setActiveCook({
      ...cook,
      originalDisplayName: cook.displayName,
      originalPrinterTopic: cook.printerTopic ?? null,
    });
    setEditCookModalOpen(true);
  };

  const openEditHybrid = (member: StaffRosterMember) => {
    const assignedIds = (member.waiterDetail?.assignedTables ?? [])
      .map((table) => table.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    setActiveHybrid({
      ...member,
      originalDisplayName: member.displayName,
      printerTopic: member.cook?.printerTopic ?? null,
      originalPrinterTopic: member.cook?.printerTopic ?? null,
    });
    setTableSelection(new Set(assignedIds));
    setInitialTableSelection(new Set(assignedIds));
    setHybridModalOpen(true);
  };

  const tablesById = useMemo(() => {
    const map = new Map<string, TableSummary>();
    tables.forEach((table) => {
      if (table.id) {
        map.set(table.id, table);
      }
    });
    return map;
  }, [tables]);

  const sortedWaiters = useMemo(() => {
    return [...waiters].sort((a, b) => {
      const left = (a.displayName || a.email || "").toLowerCase();
      const right = (b.displayName || b.email || "").toLowerCase();
      return left.localeCompare(right);
    });
  }, [waiters]);

  const sortedTables = useMemo(() => {
    return [...managerTables].sort((a, b) =>
      (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase())
    );
  }, [managerTables]);

  const assignedQrTileByTableId = useMemo(() => {
    const map = new Map<string, QRTile>();
    qrTiles.forEach((tile) => {
      if (!tile.tableId || map.has(tile.tableId)) return;
      map.set(tile.tableId, tile);
    });
    return map;
  }, [qrTiles]);

  const tableQrTileOptions = useMemo(() => {
    return qrTiles
      .filter((tile) => !tile.tableId || tile.tableId === tableForm.id)
      .sort((a, b) =>
        `${a.label ?? ""}${a.publicCode}`.localeCompare(
          `${b.label ?? ""}${b.publicCode}`
        )
      );
  }, [qrTiles, tableForm.id]);

  const formatQrTileLabel = useCallback(
    (tile: Pick<QRTile, "label" | "publicCode">) => {
      const label = (tile.label || tile.publicCode).trim();
      const unassignedMatch = /^unassigned\s+(.+)$/i.exec(label);
      if (unassignedMatch) {
        return t("manager.unassigned_qr_tile", {
          defaultValue: "Unassigned {{label}}",
          label: unassignedMatch[1],
        });
      }
      return label;
    },
    [t]
  );

  const currencyCode =
    typeof window !== "undefined"
      ? window.localStorage.getItem("CURRENCY") || "EUR"
      : "EUR";
  const currencyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
      });
    } catch {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "EUR",
      });
    }
  }, [currencyCode]);
  const formatCurrency = (value: number) =>
    currencyFormatter.format(value || 0);
  const PIE_COLORS = [
    "#6366f1",
    "#22d3ee",
    "#f59e0b",
    "#ef4444",
    "#10b981",
    "#a855f7",
    "#ec4899",
    "#14b8a6",
  ];

  const servedOrders = useMemo(
    () => ordersAll.filter((order) => isServedStatus(order.status)),
    [ordersAll]
  );
  const cancelledOrders = useMemo(
    () => ordersAll.filter((order) => order.status === "CANCELLED"),
    [ordersAll]
  );

  // Economics date-range helpers and derived ranges
  const rangeInfo = useMemo(() => {
    const now = new Date();
    if (econRange === "custom") {
      const parsedStart = new Date(`${customRange.start}T00:00:00`);
      const parsedEnd = new Date(`${customRange.end}T00:00:00`);
      const validStart = Number.isNaN(parsedStart.getTime())
        ? startOfDay(now)
        : parsedStart;
      const validEnd = Number.isNaN(parsedEnd.getTime())
        ? startOfDay(now)
        : parsedEnd;
      const days = Math.max(
        1,
        Math.round((validEnd.getTime() - validStart.getTime()) / 86400000) + 1
      );
      const prevEnd = addDays(validStart, -1);
      const prevStart = addDays(prevEnd, -(days - 1));
      return { start: validStart, end: validEnd, prevStart, prevEnd, days };
    }
    if (econRange === "last24h") {
      const end = now;
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const prevEnd = start;
      const prevStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      return { start, end, prevStart, prevEnd, days: 1 };
    }
    const end = startOfDay(now);
    let days = 7;
    if (econRange === "today") days = 1;
    if (econRange === "month") days = 30;
    const start = addDays(end, -(days - 1));
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -(days - 1));
    return { start, end, prevStart, prevEnd, days };
  }, [econRange, customRange]);

  const totalRevenue = useMemo(
    () => servedOrders.reduce((sum, order) => sum + getOrderRevenue(order), 0),
    [servedOrders]
  );
  const servedCount = servedOrders.length;
  const avgTicketSize = servedCount ? totalRevenue / servedCount : 0;
  const refundTotal =
    cancelledOrders.reduce((sum, order) => sum + getOrderTotalCents(order), 0) /
    100;

  // Date parsing helpers used across analytics
  // Economics tab (range-scoped)
  const ordersInRange = useMemo(
    () =>
      ordersAll.filter((order) =>
        withinRange(getRevenueDate(order), rangeInfo.start, rangeInfo.end)
      ),
    [ordersAll, rangeInfo.start, rangeInfo.end]
  );
  const ordersPrevRange = useMemo(
    () =>
      ordersAll.filter((order) =>
        withinRange(
          getRevenueDate(order),
          rangeInfo.prevStart,
          rangeInfo.prevEnd
        )
      ),
    [ordersAll, rangeInfo.prevStart, rangeInfo.prevEnd]
  );
  const servedInRange = useMemo(
    () =>
      servedOrders.filter((order) =>
        withinRange(getRevenueDate(order), rangeInfo.start, rangeInfo.end)
      ),
    [servedOrders, rangeInfo.start, rangeInfo.end]
  );
  const cancelledInRange = useMemo(
    () =>
      cancelledOrders.filter((order) =>
        withinRange(getPlacedDate(order), rangeInfo.start, rangeInfo.end)
      ),
    [cancelledOrders, rangeInfo]
  );
  const servedPrevRange = useMemo(
    () =>
      servedOrders.filter((order) =>
        withinRange(
          getRevenueDate(order),
          rangeInfo.prevStart,
          rangeInfo.prevEnd
        )
      ),
    [servedOrders, rangeInfo]
  );
  const totalRevenueInRange = useMemo(
    () => servedInRange.reduce((sum, order) => sum + getOrderRevenue(order), 0),
    [servedInRange]
  );
  const totalRevenuePrevRange = useMemo(
    () =>
      servedPrevRange.reduce((sum, order) => sum + getOrderRevenue(order), 0),
    [servedPrevRange]
  );
  const servedCountInRange = servedInRange.length;
  const avgTicketInRange = servedCountInRange
    ? totalRevenueInRange / servedCountInRange
    : 0;
  const refundTotalInRange = useMemo(
    () =>
      cancelledInRange.reduce(
        (sum, order) => sum + getOrderTotalCents(order),
        0
      ) / 100,
    [cancelledInRange]
  );

  useEffect(() => {
    const placedDates = servedOrders
      .map((order) => getPlacedDate(order))
      .filter(
        (d): d is Date => d instanceof Date && !Number.isNaN(d.getTime())
      );
    const noPlacedDate = servedOrders.length - placedDates.length;
    const minPlaced = placedDates.length
      ? new Date(Math.min(...placedDates.map((d) => d.getTime()))).toISOString()
      : null;
    const maxPlaced = placedDates.length
      ? new Date(Math.max(...placedDates.map((d) => d.getTime()))).toISOString()
      : null;

    const placedInRange = servedInRange
      .map((order) => getRevenueDate(order))
      .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
      .map((d) => d.toISOString());
    const placedPrevRange = servedPrevRange
      .map((order) => getRevenueDate(order))
      .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
      .map((d) => d.toISOString());

    console.log("[Analytics] Order timeline summary", {
      econRange,
      ordersAll: ordersAll.length,
      servedOrders: servedOrders.length,
      cancelledOrders: cancelledOrders.length,
      missingPlacedDate: noPlacedDate,
      earliestPlaced: minPlaced,
      latestPlaced: maxPlaced,
      currentRange: {
        start: rangeInfo.start.toISOString(),
        end: rangeInfo.end.toISOString(),
        servedInRange: servedInRange.length,
        samplePlaced: placedInRange.slice(0, 3),
      },
      previousRange: {
        start: rangeInfo.prevStart.toISOString(),
        end: rangeInfo.prevEnd.toISOString(),
        servedInPrevRange: servedPrevRange.length,
        samplePlaced: placedPrevRange.slice(0, 3),
      },
    });
  }, [
    econRange,
    ordersAll.length,
    servedOrders,
    cancelledOrders,
    rangeInfo.start,
    rangeInfo.end,
    rangeInfo.prevStart,
    rangeInfo.prevEnd,
    servedInRange,
    servedPrevRange,
  ]);

  const revenueTimeline = useMemo(() => {
    // When viewing Today/Last24h use hourly buckets, otherwise use daypart or daily segments for the selected range
    if (econRange === "today" || econRange === "last24h") {
      const buildHourMap = (orders: Order[]) => {
        const hourly = new Map<string, number>();
        orders.forEach((order) => {
          const date = getRevenueDate(order) || new Date();
          const key = `${date.getHours().toString().padStart(2, "0")}:00`;
          hourly.set(key, (hourly.get(key) ?? 0) + getOrderRevenue(order));
        });
        return hourly;
      };
      const hourly = buildHourMap(servedInRange);
      const hourlyPrev = buildHourMap(servedPrevRange);
      const rows: Array<{
        date: string;
        revenue: number;
        prevRevenue: number;
      }> = [];
      for (let i = 0; i < 24; i++) {
        const bucketStart =
          econRange === "today"
            ? new Date(rangeInfo.start.getTime() + i * 60 * 60 * 1000)
            : new Date(rangeInfo.start.getTime() + i * 60 * 60 * 1000);
        const hourKey = `${bucketStart
          .getHours()
          .toString()
          .padStart(2, "0")}:00`;
        const label =
          econRange === "today"
            ? hourKey
            : bucketStart.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
        rows.push({
          date: label,
          revenue: hourly.get(hourKey) ?? 0,
          prevRevenue: hourlyPrev.get(hourKey) ?? 0,
        });
      }
      return rows;
    }

    if (econRange === "week") {
      const formatDay = (d: Date) =>
        d.toLocaleDateString(undefined, { weekday: "short" });
      const curMap = new Map<string, number>();
      servedInRange.forEach((order) => {
        const d = getRevenueDate(order) || new Date();
        const key = toISODate(d);
        curMap.set(key, (curMap.get(key) ?? 0) + getOrderRevenue(order));
      });
      const prevMap = new Map<string, number>();
      servedPrevRange.forEach((order) => {
        const d = getRevenueDate(order) || new Date();
        const key = toISODate(d);
        prevMap.set(key, (prevMap.get(key) ?? 0) + getOrderRevenue(order));
      });
      const rows: Array<{
        date: string;
        revenue: number;
        prevRevenue: number;
      }> = [];
      for (let i = 0; i < 7; i++) {
        const curDate = addDays(rangeInfo.start, i);
        const prevDate = addDays(rangeInfo.prevStart, i);
        const curKey = toISODate(curDate);
        const prevKey = toISODate(prevDate);
        rows.push({
          date: formatDay(curDate),
          revenue: curMap.get(curKey) ?? 0,
          prevRevenue: prevMap.get(prevKey) ?? 0,
        });
      }
      return rows;
    }

    const curMap = new Map<string, number>();
    servedInRange.forEach((order) => {
      const d = getRevenueDate(order) || new Date();
      const key = toISODate(d);
      curMap.set(key, (curMap.get(key) ?? 0) + getOrderRevenue(order));
    });
    const prevMap = new Map<string, number>();
    servedPrevRange.forEach((order) => {
      const d = getRevenueDate(order) || new Date();
      const key = toISODate(d);
      prevMap.set(key, (prevMap.get(key) ?? 0) + getOrderRevenue(order));
    });
    const rows: Array<{ date: string; revenue: number; prevRevenue: number }> =
      [];
    for (let i = 0; i < rangeInfo.days; i++) {
      const curDate = addDays(rangeInfo.start, i);
      const prevDate = addDays(rangeInfo.prevStart, i);
      const curKey = toISODate(curDate);
      const prevKey = toISODate(prevDate);
      rows.push({
        date: curKey,
        revenue: curMap.get(curKey) ?? 0,
        prevRevenue: prevMap.get(prevKey) ?? 0,
      });
    }
    return rows;
  }, [servedInRange, servedPrevRange, rangeInfo, econRange]);

  const resolveCategoryLabel = useCallback(
    (source?: unknown) => {
      // Prefer category from known itemId lookup (manager metadata)
      const itemIdFromSource =
        (typeof source === "object" && source && "itemId" in source
          ? (source as { itemId?: string }).itemId
          : undefined) ??
        (typeof source === "object" && source && "item" in source
          ? (source as { item?: { id?: string } }).item?.id ?? undefined
          : undefined);
      if (itemIdFromSource && menuCategoryLookup.has(itemIdFromSource)) {
        return menuCategoryLookup.get(itemIdFromSource)!;
      }

      if (typeof source === "string" && pickLabel(source)) {
        return source.trim();
      }
      const item = extractMenuItem(source);
      const category = item?.category;
      const direct =
        (typeof category === "string" && pickLabel(category)) ??
        (typeof category === "object"
          ? pickLabel((category as { title?: string }).title) ??
            pickLabel((category as { titleEn?: string }).titleEn) ??
            pickLabel((category as { titleEl?: string }).titleEl) ??
            pickLabel((category as { name?: string }).name) ??
            pickLabel((category as { label?: string }).label)
          : null) ??
        pickLabel((item as { categoryTitle?: string }).categoryTitle) ??
        pickLabel((item as { categoryName?: string }).categoryName) ??
        pickLabel((item as { categoryLabel?: string }).categoryLabel);
      if (direct) return direct;
      const itemId =
        item?.id ??
        (item as { itemId?: string }).itemId ??
        (typeof source === "object" && source && "item" in source
          ? (source as { item?: { id?: string } }).item?.id ?? null
          : null);
      if (itemId && menuCategoryLookup.has(itemId)) {
        return menuCategoryLookup.get(itemId)!;
      }
      return uncategorizedLabel;
    },
    [menuCategoryLookup, uncategorizedLabel]
  );

  useEffect(() => {
    // Debug category revenue mapping (only after metadata ready)
    if (!menuMetaReady) return;
    const buckets = new Map<string, { revenue: number; lines: number }>();
    servedInRange.forEach((order) => {
      (order.items ?? []).forEach((item) => {
        const category = resolveCategoryLabel(item.item ?? item);
        const price = unitPrice(item);
        const qty = getLineQuantity(item);
        const revenue = price * qty;
        const entry = buckets.get(category) ?? { revenue: 0, lines: 0 };
        entry.revenue += revenue;
        entry.lines += 1;
        buckets.set(category, entry);
      });
    });
    const summary = Array.from(buckets.entries())
      .map(([category, v]) => ({
        category,
        revenue: Number(v.revenue.toFixed(2)),
        lines: v.lines,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    console.log("[Category revenue debug]", {
      econRange,
      servedInRange: servedInRange.length,
      categories: summary,
      sampleItem: servedInRange[0]?.items?.[0],
    });
  }, [econRange, servedInRange, resolveCategoryLabel, menuMetaReady]);
  const categoryRevenue = useMemo(() => {
    if (!menuMetaReady) return null;
    const buckets = new Map<string, number>();
    servedInRange.forEach((order) => {
      const lines = order.items ?? [];
      const lineRevenues = lines.map(
        (item) => unitPrice(item) * getLineQuantity(item)
      );
      const orderLineRevenue = lineRevenues.reduce((a, b) => a + b, 0);
      const fallbackTotal = orderLineRevenue > 0 ? 0 : getOrderRevenue(order);

      if (orderLineRevenue > 0) {
        lines.forEach((item, idx) => {
          const category = resolveCategoryLabel(item.item ?? item);
          const revenue = lineRevenues[idx];
          buckets.set(category, (buckets.get(category) ?? 0) + revenue);
        });
      } else if (fallbackTotal > 0) {
        if (lines.length === 0) {
          buckets.set(
            uncategorizedLabel,
            (buckets.get(uncategorizedLabel) ?? 0) + fallbackTotal
          );
        } else {
          const share = fallbackTotal / lines.length;
          lines.forEach((item) => {
            const category = resolveCategoryLabel(item.item ?? item);
            buckets.set(category, (buckets.get(category) ?? 0) + share);
          });
        }
      }
    });
    const total = Array.from(buckets.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(buckets.entries()).map(([category, revenue]) => ({
      category,
      revenue,
      share: (revenue / total) * 100,
    }));
  }, [servedInRange, resolveCategoryLabel, menuMetaReady, uncategorizedLabel]);

  const avgTicketByDaypart = useMemo(() => {
    const parts = ["Breakfast", "Lunch", "Afternoon", "Evening"] as const;
    const map = new Map<string, { revenue: number; count: number }>();
    parts.forEach((p) => map.set(p, { revenue: 0, count: 0 }));
    servedInRange.forEach((order) => {
      const part = daypartOf(getPlacedDate(order)!);
      if (!map.has(part)) return;
      const bucket = map.get(part)!;
      bucket.revenue += getOrderTotalCents(order) / 100;
      bucket.count += 1;
    });
    return Array.from(map.entries()).map(([daypart, v]) => ({
      daypart,
      avg: v.count ? v.revenue / v.count : 0,
    }));
  }, [servedInRange]);

  const hasCostData = useMemo(
    () =>
      servedOrders.some((order) =>
        (order.items ?? []).some(
          (line) =>
            typeof line.item?.costCents === "number" ||
            typeof line.item?.cost === "number"
        )
      ),
    [servedOrders]
  );
  const categoryMargin = useMemo(() => {
    if (!hasCostData) return [] as Array<{ category: string; margin: number }>;
    const buckets = new Map<string, number>();
    servedInRange.forEach((order) => {
      (order.items ?? []).forEach((line) => {
        const category = resolveCategoryLabel(line.item ?? line);
        const price = unitPrice(line);
        const qty = getLineQuantity(line);
        const cost =
          typeof line.item?.costCents === "number"
            ? line.item.costCents / 100
            : typeof line.item?.cost === "number"
            ? line.item.cost
            : undefined;
        if (typeof cost === "number") {
          const margin = (price - cost) * qty;
          buckets.set(category, (buckets.get(category) ?? 0) + margin);
        }
      });
    });
    return Array.from(buckets.entries())
      .map(([category, margin]) => ({ category, margin }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
  }, [servedInRange, resolveCategoryLabel, hasCostData]);

  const topItems = useMemo(() => {
    const pickName = (line: any) =>
      pickLabel(line?.item?.title) ||
      pickLabel(line?.item?.name) ||
      pickLabel((line?.item as { label?: string })?.label) ||
      pickLabel(line?.title) ||
      pickLabel((line as { titleSnapshot?: string })?.titleSnapshot) ||
      pickLabel(line?.name) ||
      itemFallbackLabel;

    const map = new Map<string, { name: string; revenue: number }>();
    servedInRange.forEach((order) => {
      // skip items outside the selected revenue window if placed/served is missing
      const revenueDate = getRevenueDate(order);
      if (!withinRange(revenueDate, rangeInfo.start, rangeInfo.end)) return;
      (order.items ?? []).forEach((line) => {
        const name = pickName(line);
        const key = line.item?.id || name;
        const revenue = unitPrice(line) * getLineQuantity(line);
        const current = map.get(key) ?? { name, revenue: 0 };
        current.revenue += revenue;
        map.set(key, current);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [servedInRange, rangeInfo.start, rangeInfo.end, itemFallbackLabel]);

  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }),
    []
  );
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  const orderLineItems = useMemo(() => {
    return ordersAll.flatMap((order) =>
      (order.items ?? []).map((line) => ({
        orderId: order.id,
        itemId: line.item?.id ?? "",
        name: line.item?.name ?? line.item?.title ?? itemFallbackLabel,
        category: resolveCategoryLabel(line.item ?? line),
        quantity: getLineQuantity(line),
        selectedModifiers: line.selectedModifiers ?? {},
        placedAt: getPlacedDate(order),
      }))
    );
  }, [ordersAll, resolveCategoryLabel, itemFallbackLabel]);

  const categoryUnits = useMemo(() => {
    const buckets = new Map<string, number>();
    orderLineItems.forEach((line) => {
      buckets.set(
        line.category,
        (buckets.get(line.category) ?? 0) + line.quantity
      );
    });
    const total = Array.from(buckets.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(buckets.entries()).map(([category, units]) => ({
      category,
      units,
      share: (units / total) * 100,
    }));
  }, [orderLineItems]);

  const itemUnits = useMemo(() => {
    const map = new Map<string, { name: string; units: number }>();
    orderLineItems.forEach((line) => {
      const key = line.itemId || line.name;
      const current = map.get(key) || { name: line.name, units: 0 };
      current.units += line.quantity;
      map.set(key, current);
    });
    return Array.from(map.values());
  }, [orderLineItems]);

  // Menu trends (last 7 days vs previous 7)
  const menuTrendInfo = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const addDays = (d: Date, days: number) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    const start = addDays(end, -6);
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -6);
    const within = (d: Date, a: Date, b: Date) => d >= a && d <= addDays(b, 1);

    const recent = new Map<string, number>();
    const prev = new Map<string, number>();
    orderLineItems.forEach((line) => {
      const key = line.name;
      const d = line.placedAt as Date;
      if (!d) return;
      if (within(d, start, end)) {
        recent.set(key, (recent.get(key) ?? 0) + line.quantity);
      } else if (within(d, prevStart, prevEnd)) {
        prev.set(key, (prev.get(key) ?? 0) + line.quantity);
      }
    });
    const deltaPct = new Map<string, number>();
    const names = new Set<string>([...recent.keys(), ...prev.keys()]);
    names.forEach((n) => {
      const a = recent.get(n) ?? 0;
      const b = prev.get(n) ?? 0;
      const pct = b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0;
      deltaPct.set(n, pct);
    });
    return { recent, prev, deltaPct };
  }, [orderLineItems]);

  const topItemsUnits = useMemo(
    () =>
      itemUnits
        .filter((item) => item.units > 0)
        .sort((a, b) => b.units - a.units)
        .slice(0, 5),
    [itemUnits]
  );

  const bottomItemsUnits = useMemo(
    () =>
      itemUnits
        .filter((item) => item.units > 0)
        .sort((a, b) => a.units - b.units)
        .slice(0, 5),
    [itemUnits]
  );

  const modifierStats = useMemo(() => {
    const totalItems = orderLineItems.length;
    if (totalItems === 0) {
      return { percent: 0, totalItems: 0, withModifiers: 0 };
    }
    const withModifiers = orderLineItems.filter(
      (line) =>
        line.selectedModifiers && Object.keys(line.selectedModifiers).length > 0
    ).length;
    return {
      percent: Math.round((withModifiers / totalItems) * 100),
      totalItems,
      withModifiers,
    };
  }, [orderLineItems]);

  const daypartMix = useMemo(() => {
    const buckets = new Map<string, number>();
    ordersAll.forEach((order) => {
      const part = daypartOf(getPlacedDate(order));
      buckets.set(part, (buckets.get(part) ?? 0) + 1);
    });
    const orderedParts = ["Breakfast", "Lunch", "Afternoon", "Evening", "Late"];
    return orderedParts.map((part) => ({
      daypart: part,
      count: buckets.get(part) ?? 0,
    }));
  }, [ordersAll]);

  // Menu tab analytics
  const itemCategoryMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    orderLineItems.forEach((line) => {
      const key = line.name;
      const cat = line.category || uncategorizedLabel;
      const counts = map.get(key) || new Map<string, number>();
      counts.set(cat, (counts.get(cat) ?? 0) + line.quantity);
      map.set(key, counts);
    });
    const result = new Map<string, string>();
    map.forEach((counts, item) => {
      let best = uncategorizedLabel;
      let bestCount = -1;
      counts.forEach((c, cat) => {
        if (c > bestCount) {
          best = cat;
          bestCount = c;
        }
      });
      result.set(item, best);
    });
    return result;
  }, [orderLineItems, uncategorizedLabel]);

  const cannibalizationPairs = useMemo(() => {
    const up: Record<string, Array<{ item: string; pct: number }>> = {};
    const down: Record<string, Array<{ item: string; pct: number }>> = {};
    const thresholdUp = 25;
    const thresholdDown = -25;
    menuTrendInfo.deltaPct.forEach((pct, name) => {
      const cat = itemCategoryMap.get(name) || uncategorizedLabel;
      if (pct >= thresholdUp) {
        (up[cat] = up[cat] || []).push({ item: name, pct });
      } else if (pct <= thresholdDown) {
        (down[cat] = down[cat] || []).push({ item: name, pct });
      }
    });
    const pairs: Array<{
      category: string;
      a: { item: string; pct: number };
      b: { item: string; pct: number };
    }> = [];
    Object.keys(up).forEach((cat) => {
      const ups = (up[cat] || []).sort((a, b) => b.pct - a.pct).slice(0, 5);
      const downs = (down[cat] || []).sort((a, b) => a.pct - b.pct).slice(0, 5);
      ups.forEach((a) => {
        const b = downs.shift();
        if (b) pairs.push({ category: cat, a, b });
      });
    });
    return pairs.slice(0, 6);
  }, [menuTrendInfo, itemCategoryMap, uncategorizedLabel]);

  const daypartFitRows = useMemo(() => {
    // Fit score = share in top daypart within last 14 days
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 13
    );
    const map = new Map<string, Map<string, number>>();
    orderLineItems.forEach((line) => {
      const d = line.placedAt as Date;
      if (!d || d < start) return;
      const part = daypartOf(d);
      const item = line.name;
      const counts = map.get(item) || new Map<string, number>();
      counts.set(part, (counts.get(part) ?? 0) + line.quantity);
      map.set(item, counts);
    });
    const rows: Array<{ item: string; fit: number; top: string }> = [];
    map.forEach((counts, item) => {
      let total = 0;
      counts.forEach((c) => (total += c));
      let top = "—";
      let topCount = 0;
      counts.forEach((c, p) => {
        if (c > topCount) {
          topCount = c;
          top = p;
        }
      });
      const fit = total ? (topCount / total) * 100 : 0;
      rows.push({ item, fit, top });
    });
    return rows.sort((a, b) => a.fit - b.fit).slice(0, 6);
  }, [orderLineItems]);

  const newVsRegularMix = useMemo(() => {
    // Items first seen within 14 days == New
    const firstSeen = new Map<string, Date>();
    orderLineItems.forEach((line) => {
      const item = line.name;
      const d = line.placedAt as Date;
      if (!d) return;
      const prev = firstSeen.get(item);
      if (!prev || d < prev) firstSeen.set(item, d);
    });
    const now = new Date();
    const recentStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6
    );
    let newUnits = 0;
    let regUnits = 0;
    orderLineItems.forEach((line) => {
      const d = line.placedAt as Date;
      if (!d || d < recentStart) return;
      const first = firstSeen.get(line.name) || d;
      const isNew =
        (now.getTime() - first.getTime()) / (24 * 60 * 60 * 1000) <= 14;
      if (isNew) newUnits += line.quantity;
      else regUnits += line.quantity;
    });
    const total = newUnits + regUnits || 1;
    return {
      newUnits,
      regUnits,
      newPct: Math.round((newUnits / total) * 100),
      regPct: Math.round((regUnits / total) * 100),
    };
  }, [orderLineItems]);

  const profitHint = useMemo(() => {
    if (!hasCostData)
      return null as null | { item: string; margin: number; deltaPct: number };
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const addDays = (d: Date, days: number) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    const start = addDays(end, -6);
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -6);
    const sumBy = (periodStart: Date, periodEnd: Date) => {
      const map = new Map<string, { units: number; margin: number }>();
      servedOrders.forEach((order) => {
        const d = getPlacedDate(order);
        if (d < periodStart || d > addDays(periodEnd, 1)) return;
        (order.items ?? []).forEach((line) => {
          const name = line.item?.name ?? line.item?.title ?? itemFallbackLabel;
          const qty = getLineQuantity(line);
          const price = unitPrice(line);
          const cost =
            typeof line.item?.costCents === "number"
              ? line.item.costCents / 100
              : typeof line.item?.cost === "number"
              ? line.item.cost
              : undefined;
          const existing = map.get(name) ?? { units: 0, margin: 0 };
          existing.units += qty;
          if (typeof cost === "number") existing.margin += (price - cost) * qty;
          map.set(name, existing);
        });
      });
      return map;
    };
    const cur = sumBy(start, end);
    const prev = sumBy(prevStart, prevEnd);
    let best: { item: string; margin: number; deltaPct: number } | null = null;
    cur.forEach((v, name) => {
      const b = prev.get(name);
      const delta =
        b && b.units > 0
          ? ((v.units - b.units) / b.units) * 100
          : v.units > 0
          ? 100
          : 0;
      if (delta > 10 && v.margin > 0) {
        if (!best || v.margin > best.margin)
          best = { item: name, margin: v.margin, deltaPct: delta };
      }
    });
    return best;
  }, [servedOrders, hasCostData, itemFallbackLabel]);

  // Personnel: Pro analytics (defined after waiterDetails)

  // Call-waiter response times (realtime disabled)
  const callResponseDurations: number[] = [];
  const callMedian = null;
  const callP95 = null;

  const ordersByTable = useMemo(() => {
    const map = new Map<string, Order[]>();
    ordersAll.forEach((order) => {
      const existing = map.get(order.tableId);
      if (existing) {
        existing.push(order);
      } else {
        map.set(order.tableId, [order]);
      }
    });
    return map;
  }, [ordersAll]);

  const waiterDetails = useMemo(() => {
    return sortedWaiters.map((waiter) => {
      const assignedRaw = waiterAssignmentsMap.get(waiter.id) ?? [];
      const assignedTables: WaiterAssignedTable[] = assignedRaw
        .map((assignmentTable) => {
          const stored = assignmentTable.id
            ? tablesById.get(assignmentTable.id)
            : undefined;
          const label =
            stored?.label ??
            pickLabel((assignmentTable as { label?: string }).label) ??
            pickLabel((assignmentTable as { code?: string }).code) ??
            pickLabel((assignmentTable as { title?: string }).title) ??
            "—";
          const id = assignmentTable.id ?? stored?.id ?? "";
          return {
            id,
            label: label ?? "—",
            active:
              stored?.active ??
              assignmentTable.active ??
              assignmentTable.isActive ??
              true,
          };
        })
        .filter((table): table is WaiterAssignedTable => Boolean(table.id))
        .sort((a, b) => a.label.localeCompare(b.label));
      const tableIds = assignedTables.map((table) => table.id);
      const orders = tableIds.flatMap(
        (tableId) => ordersByTable.get(tableId) ?? []
      );
      const served = orders.filter((order) => isServedStatus(order.status));
      const ready = orders.filter((order) => order.status === "READY");
      const serveDurations = served
        .map((order) =>
          minutesBetween(getPlacedDate(order), getServedDate(order))
        )
        .filter((value): value is number => value != null);
      const avgServe =
        serveDurations.length > 0
          ? serveDurations.reduce((sum, value) => sum + value, 0) /
            serveDurations.length
          : null;
      const p90Serve =
        serveDurations.length > 0 ? percentile(serveDurations, 90) : null;
      const readyServedPercent =
        ready.length + served.length > 0
          ? Math.round((served.length / (ready.length + served.length)) * 100)
          : null;
      return {
        waiter,
        assignedTables,
        shiftOn: assignedTables.some((table) => table.active),
        ordersHandled: orders.length,
        avgServe,
        p90Serve,
        readyServedPercent,
      };
    });
  }, [sortedWaiters, waiterAssignmentsMap, tablesById, ordersByTable]);

  const staffRoster = useMemo<StaffRosterMember[]>(() => {
    const members = new Map<string, StaffRosterMember>();
    waiterDetails.forEach((detail) => {
      const role = String(detail.waiter.role || "").toLowerCase();
      members.set(detail.waiter.id, {
        id: detail.waiter.id,
        email: detail.waiter.email,
        displayName: detail.waiter.displayName || detail.waiter.email,
        isHybrid: role === "hybrid",
        waiterDetail: detail,
      });
    });
    cooks.forEach((cook) => {
      const existing = members.get(cook.id);
      const role = String(cook.role || "").toLowerCase();
      if (existing) {
        existing.cook = cook;
        existing.isHybrid = existing.isHybrid || role === "hybrid";
        return;
      }
      members.set(cook.id, {
        id: cook.id,
        email: cook.email,
        displayName: cook.displayName || cook.email,
        isHybrid: role === "hybrid",
        cook,
      });
    });
    return Array.from(members.values()).sort((a, b) =>
      (a.displayName || a.email).toLowerCase().localeCompare(
        (b.displayName || b.email).toLowerCase()
      )
    );
  }, [waiterDetails, cooks]);

  const waiterPersonnel = useMemo(
    () => staffRoster.filter((member) => member.waiterDetail && !member.isHybrid),
    [staffRoster]
  );
  const cookPersonnel = useMemo(
    () => staffRoster.filter((member) => member.cook && !member.isHybrid),
    [staffRoster]
  );
  const hybridPersonnel = useMemo(
    () => staffRoster.filter((member) => member.isHybrid),
    [staffRoster]
  );

  // Personnel: Pro analytics (depends on waiterDetails)
  const topAndAttentionWaiters = useMemo(() => {
    const withP90 = waiterDetails
      .map((d) => ({
        id: d.waiter.id,
        name: d.waiter.displayName || d.waiter.email || "Waiter",
        p90: d.p90Serve as number | null,
      }))
      .filter((d) => d.p90 != null) as Array<{
      id: string;
      name: string;
      p90: number;
    }>;
    if (withP90.length === 0) return null;
    const best = withP90.reduce((a, b) => (a.p90 <= b.p90 ? a : b));
    const worst = withP90.reduce((a, b) => (a.p90 >= b.p90 ? a : b));
    return { best, worst };
  }, [waiterDetails]);

  const coverageGaps = useMemo(() => {
    const activeWaiterIds = new Set(
      waiterDetails.filter((d) => d.shiftOn).map((d) => d.waiter.id)
    );
    const coveredTableIds = new Set<string>();
    activeWaiterIds.forEach((wid) => {
      (waiterAssignmentsMap.get(wid) ?? []).forEach((table) => {
        if (table?.id && (table.active ?? table.isActive ?? true))
          coveredTableIds.add(table.id);
      });
    });
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6
    );
    const byHour = Array.from({ length: 24 }, () => ({
      orders: 0,
      coveredOrders: 0,
    }));
    ordersAll.forEach((o) => {
      const d = getPlacedDate(o);
      if (d < start) return;
      const h = d.getHours();
      byHour[h].orders += 1;
      if (coveredTableIds.has(o.tableId)) byHour[h].coveredOrders += 1;
    });
    const gaps = byHour
      .map((value, hour) => ({ hour, ...value }))
      .filter(({ orders, coveredOrders }) => orders > 0 && coveredOrders === 0)
      .map(({ hour }) => hour);
    return gaps;
  }, [ordersAll, waiterDetails, waiterAssignmentsMap]);

  const tablesOverview = useMemo(() => {
    return sortedTables.map((table) => {
      const orders = ordersByTable.get(table.id) ?? [];
      const openOrders = orders.filter(
        (order) => !isClosedStatus(order.status)
      ).length;
      return { ...table, openOrders };
    });
  }, [sortedTables, ordersByTable]);

  const totalOrders = useMemo(() => ordersInRange.length, [ordersInRange]);

  const serveDurationsMinutes = useMemo(() => {
    const durations: number[] = [];
    servedInRange.forEach((order) => {
      const minutes = minutesBetween(
        getPlacedDate(order),
        getServedDate(order)
      );
      if (minutes != null) {
        durations.push(minutes);
      }
    });
    return durations;
  }, [servedInRange]);
  const avgServeTimeMinutes = useMemo(() => {
    if (!serveDurationsMinutes.length) return null;
    const sum = serveDurationsMinutes.reduce((acc, value) => acc + value, 0);
    return sum / serveDurationsMinutes.length;
  }, [serveDurationsMinutes]);
  const medianServeMinutes = useMemo(
    () => median(serveDurationsMinutes),
    [serveDurationsMinutes]
  );

  const prepDurationsMinutes = useMemo(() => {
    const durations: number[] = [];
    ordersInRange.forEach((order) => {
      if (order.status === "PLACED") return;
      if (order.status === "CANCELLED") return;
      const revenueDate = getRevenueDate(order);
      if (!withinRange(revenueDate, rangeInfo.start, rangeInfo.end)) return;
      const minutes = isServedStatus(order.status)
        ? minutesBetween(getPlacedDate(order), getServedDate(order))
        : minutesBetween(getPlacedDate(order), getUpdatedDate(order));
      if (minutes != null) {
        durations.push(minutes);
      }
    });
    return durations;
  }, [ordersInRange, rangeInfo.start, rangeInfo.end]);
  const medianPrepMinutes = useMemo(
    () => median(prepDurationsMinutes),
    [prepDurationsMinutes]
  );

  const busiestHourLabel = useMemo(() => {
    const relevant = ordersInRange;
    if (!relevant.length) return null;
    const buckets = Array.from({ length: 24 }, () => 0);
    relevant.forEach((order) => {
      const hour = getPlacedDate(order).getHours();
      buckets[hour] = (buckets[hour] ?? 0) + 1;
    });
    const max = Math.max(...buckets);
    if (max === 0) return null;
    const hourIndex = buckets.findIndex((value) => value === max);
    const startLabel = `${hourIndex.toString().padStart(2, "0")}:00`;
    const endLabel = `${((hourIndex + 1) % 24).toString().padStart(2, "0")}:00`;
    return `${startLabel} – ${endLabel}`;
  }, [ordersAll, rangeInfo.start, rangeInfo.end]);

  const ordersTimeline = useMemo(() => {
    const map = new Map<string, number>();
    ordersInRange.forEach((order) => {
      const placed = getPlacedDate(order);
      const dayKey = placed.toISOString().slice(0, 10);
      map.set(dayKey, (map.get(dayKey) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10)
      .map(([dayKey, count]) => ({
        key: dayKey,
        label: dayFormatter.format(new Date(`${dayKey}T00:00:00Z`)),
        count,
      }));
  }, [ordersAll, dayFormatter]);

  const ordersTimelineTrend = useMemo(() => {
    const sumOrders = (orders: Order[]) => orders.length;
    const curr = sumOrders(ordersInRange);
    const prior = sumOrders(ordersPrevRange);
    const deltaPct =
      prior > 0 ? ((curr - prior) / prior) * 100 : curr > 0 ? 100 : 0;
    return { curr, prior, deltaPct };
  }, [ordersInRange, ordersPrevRange]);

  const ordersByStatus = useMemo(() => {
    const base: Record<OrderStatus, number> = {
      PLACED: 0,
      PREPARING: 0,
      READY: 0,
      SERVED: 0,
      PAID: 0,
      CANCELLED: 0,
    };
    const now = Date.now();
    const statusHasThreshold = (status: OrderStatus) =>
      STATUS_THRESHOLD_MINUTES[status] != null;
    const atRiskMap: Partial<Record<OrderStatus, boolean>> = {};
    ordersInRange.forEach((order) => {
      base[order.status] = (base[order.status] ?? 0) + 1;
      const threshold = STATUS_THRESHOLD_MINUTES[order.status];
      if (threshold != null) {
        const reference =
          order.status === "PLACED"
            ? getPlacedDate(order)
            : getUpdatedDate(order);
        if (reference) {
          const minutes = (now - reference.getTime()) / 60000;
          if (Number.isFinite(minutes) && minutes > threshold)
            atRiskMap[order.status] = true;
        }
      }
    });
    return (Object.keys(base) as OrderStatus[]).map((status) => ({
      status,
      statusLabel: formatStatusLabel(status),
      statusAxisLabel: formatStatusAxisLabel(status),
      count: base[status],
      atRisk: Boolean(atRiskMap[status] && statusHasThreshold(status)),
    }));
  }, [formatStatusAxisLabel, formatStatusLabel, ordersInRange]);

  // Pro analytics for Orders
  const prepHistogram = useMemo(() => {
    const bins = [
      { label: "0-5", max: 5, count: 0 },
      { label: "5-10", max: 10, count: 0 },
      { label: "10-15", max: 15, count: 0 },
      { label: "15-20", max: 20, count: 0 },
      { label: "20-30", max: 30, count: 0 },
      { label: "30+", max: Infinity, count: 0 },
    ];
    prepDurationsMinutes.forEach((minutes) => {
      const bin = bins.find((b) => minutes <= b.max);
      if (bin) bin.count += 1;
    });
    return bins;
  }, [prepDurationsMinutes]);

  const SLA_TARGET_MINUTES = 20;
  const slaBreaches = useMemo(() => {
    return servedInRange
      .map((o) => ({
        order: o,
        minutes: minutesBetween(getPlacedDate(o), getServedDate(o)),
      }))
      .filter((x) => (x.minutes ?? 0) > SLA_TARGET_MINUTES)
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))
      .slice(0, 8);
  }, [servedInRange]);

  const bottleneckMatrix = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const statuses: OrderStatus[] = ["PLACED", "PREPARING", "READY"];
    const makeRow = (): Record<number, number> =>
      Object.fromEntries(hours.map((h) => [h, 0])) as Record<number, number>;
    const matrix: Record<OrderStatus, Record<number, number>> = {
      PLACED: makeRow(),
      PREPARING: makeRow(),
      READY: makeRow(),
      PAID: makeRow(),
      SERVED: makeRow(),
      CANCELLED: makeRow(),
    };
    ordersInRange.forEach((order) => {
      const hour = getPlacedDate(order).getHours();
      if (statuses.includes(order.status)) {
        matrix[order.status][hour] = (matrix[order.status][hour] ?? 0) + 1;
      }
    });
    let max = 0;
    statuses.forEach((s) => {
      hours.forEach((h) => {
        max = Math.max(max, matrix[s][h] ?? 0);
      });
    });
    return { hours, statuses, matrix, max: Math.max(max, 1) };
  }, [ordersInRange]);

  const REORDER_WINDOW_MINUTES = 45;
  const reorderRate = useMemo(() => {
    const byTable = new Map<string, Date[]>();
    ordersInRange.forEach((o) => {
      const key = o.tableId || o.tableLabel || "unknown";
      const arr = byTable.get(key) || [];
      arr.push(getPlacedDate(o));
      byTable.set(key, arr);
    });
    let tablesWithOrders = 0;
    let tablesWithReorder = 0;
    byTable.forEach((dates) => {
      if (dates.length === 0) return;
      tablesWithOrders += 1;
      dates.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < dates.length; i++) {
        const diffMin = (dates[i].getTime() - dates[i - 1].getTime()) / 60000;
        if (diffMin <= REORDER_WINDOW_MINUTES) {
          tablesWithReorder += 1;
          break;
        }
      }
    });
    const percent = tablesWithOrders
      ? Math.round((tablesWithReorder / tablesWithOrders) * 100)
      : 0;
    return { percent, tablesWithOrders, tablesWithReorder };
  }, [ordersInRange]);

  const throughputHistogram = useMemo(() => {
    const bins = [
      { label: "0-5", max: 5, count: 0 },
      { label: "5-10", max: 10, count: 0 },
      { label: "10-15", max: 15, count: 0 },
      { label: "15-20", max: 20, count: 0 },
      { label: "20-30", max: 30, count: 0 },
      { label: "30+", max: Infinity, count: 0 },
    ];
    serveDurationsMinutes.forEach((minutes) => {
      const bin = bins.find((candidate) => minutes <= candidate.max);
      if (bin) {
        bin.count += 1;
      }
    });
    return bins;
  }, [serveDurationsMinutes]);

  const stuckOrders = useMemo(() => {
    const now = Date.now();
    const entries: Array<{ order: Order; minutes: number; threshold: number }> =
      [];
    ordersInRange.forEach((order) => {
      const threshold = STATUS_THRESHOLD_MINUTES[order.status];
      if (threshold == null) return;
      const reference =
        order.status === "PLACED"
          ? getPlacedDate(order)
          : getUpdatedDate(order);
      if (!reference) return;
      const minutes = (now - reference.getTime()) / 60000;
      if (!Number.isFinite(minutes) || minutes <= threshold) return;
      entries.push({ order, minutes, threshold });
    });
    return entries.sort((a, b) => b.minutes - a.minutes).slice(0, 6);
  }, [ordersAll]);

  const recentOrders = useMemo(
    () =>
      ordersInRange
        .slice()
        .sort((a, b) => getPlacedDate(b).getTime() - getPlacedDate(a).getTime())
        .slice(0, 20),
    [ordersInRange]
  );

  const openCreateTable = () => {
    setTableForm({
      id: undefined,
      label: "",
      isActive: true,
      qrTileId: "unassigned",
    });
    setTableModalOpen(true);
  };

  const openEditTable = (
    table: TableSummary | (ManagerTableSummary & { openOrders: number })
  ) => {
    const isActive = "active" in table ? table.active : table.isActive;
    const assignedTileId = assignedQrTileByTableId.get(table.id)?.id ?? "unassigned";
    setTableForm({
      id: table.id,
      label: table.label,
      isActive,
      qrTileId: assignedTileId,
    });
    setTableModalOpen(true);
  };

  const handleSaveTable = async () => {
    const label = tableForm.label.trim();
    if (!label) return;
    setSavingTable(true);
    try {
      let targetTableId = tableForm.id;
      if (tableForm.id) {
        const response = await api.managerUpdateTable(tableForm.id, {
          label,
          isActive: tableForm.isActive,
        });
        targetTableId = response.table.id;
      } else {
        const response = await api.managerCreateTable({
          label,
          isActive: tableForm.isActive,
        });
        targetTableId = response.table.id;
      }

      if (targetTableId) {
        const selectedQrTileId =
          tableForm.qrTileId !== "unassigned" ? tableForm.qrTileId : null;
        const currentTableTiles = qrTiles.filter(
          (tile) => tile.tableId === targetTableId
        );

        for (const tile of currentTableTiles) {
          if (tile.id !== selectedQrTileId) {
            await api.managerUpdateQrTile(tile.id, { tableId: null });
          }
        }

        if (selectedQrTileId) {
          await api.managerUpdateQrTile(selectedQrTileId, {
            tableId: targetTableId,
          });
        }
      }

      await loadManagerTables();
      if (storeId) {
        await loadQrTiles(storeId);
      }
      await loadWaiterData();
      setTableModalOpen(false);
      setTableForm({
        id: undefined,
        label: "",
        isActive: true,
        qrTileId: "unassigned",
      });
    } catch (error) {
      console.error("Failed to save table", error);
      toast({
        variant: "destructive",
        title: t("manager.table_save_failed", {
          defaultValue: "Table save failed",
        }),
        description:
          error instanceof ApiError
            ? error.message
            : t("manager.table_save_failed_description", {
                defaultValue: "Please try again.",
              }),
      });
    } finally {
      setSavingTable(false);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (
      !window.confirm(
        t("manager.confirm_delete_table", {
          defaultValue:
            "Delete this table? It will be marked inactive and unassigned from waiters.",
        })
      )
    )
      return;
    setTableDeletingId(tableId);
    try {
      await api.managerDeleteTable(tableId);
      await loadManagerTables();
      await Promise.all([loadWaiterData(), loadCookData()]);
    } catch (error) {
      console.error("Failed to delete table", error);
    } finally {
      setTableDeletingId(null);
    }
  };

  const closeEditModal = (open: boolean) => {
    setEditModalOpen(open);
    if (!open) {
      setActiveWaiter(null);
      setTableSelection(new Set());
      setInitialTableSelection(new Set());
    }
  };

  const closeEditCookModal = (open: boolean) => {
    setEditCookModalOpen(open);
    if (!open) {
      setActiveCook(null);
    }
  };

  const closeHybridModal = (open: boolean) => {
    setHybridModalOpen(open);
    if (!open) {
      setActiveHybrid(null);
      setTableSelection(new Set());
      setInitialTableSelection(new Set());
    }
  };

  const handleToggleTable = (tableId: string, checked: boolean) => {
    setTableSelection((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(tableId);
      } else {
        next.delete(tableId);
      }
      return next;
    });
  };

  const handleToggleNewWaiterTable = (tableId: string, checked: boolean) => {
    setNewWaiterTableSelection((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(tableId);
      } else {
        next.delete(tableId);
      }
      return next;
    });
  };

  const handleSaveWaiter = async () => {
    if (!activeWaiter) return;
    setSavingWaiter(true);
    try {
      const desired = new Set(tableSelection);
      const current = new Set(initialTableSelection);

      const toAdd = Array.from(desired).filter((id) => !current.has(id));
      const toRemove = Array.from(current).filter((id) => !desired.has(id));

      const ops: Array<Promise<unknown>> = [];
      const trimmedName = (activeWaiter.displayName || "").trim();
      const originalName = activeWaiter.originalDisplayName || "";
      const updatePayload: Record<string, unknown> = {};
      if (trimmedName && trimmedName !== originalName) {
        updatePayload.displayName = trimmedName;
      }
      if (Object.keys(updatePayload).length > 0) {
        ops.push(api.updateWaiter(activeWaiter.id, updatePayload));
      }
      toAdd.forEach((tableId) =>
        ops.push(api.assignWaiterTable(activeWaiter.id, tableId))
      );
      toRemove.forEach((tableId) =>
        ops.push(api.removeWaiterTable(activeWaiter.id, tableId))
      );

      if (ops.length) {
        await Promise.all(ops);
      }
      await loadWaiterData();
      closeEditModal(false);
    } catch (error) {
      console.error("Failed to save waiter changes", error);
    } finally {
      setSavingWaiter(false);
    }
  };

  const handleDeleteWaiter = async (waiterId: string) => {
    const waiter = waiters.find((item) => item.id === waiterId);
    const isHybrid = String(waiter?.role || "").toLowerCase() === "hybrid";
    if (
      !window.confirm(
        isHybrid
          ? t("manager.confirm_remove_waiter_role", {
              defaultValue:
                "Remove waiter access from this hybrid person? The cook account will remain.",
            })
          : t("manager.confirm_delete_waiter", {
              defaultValue: "Delete this waiter account?",
            })
      )
    )
      return;
    setDeletingWaiterId(waiterId);
    try {
      await api.deleteWaiter(waiterId);
      await Promise.all([loadWaiterData(), isHybrid ? loadCookData() : Promise.resolve()]);
    } catch (error) {
      console.error("Failed to delete waiter", error);
    } finally {
      setDeletingWaiterId(null);
    }
  };

  const handleCreateWaiter = async () => {
    if (!newWaiter.email || !newWaiter.password) return;
    setAddingWaiter(true);
    try {
      const displayName = newWaiter.displayName.trim() || newWaiter.email;
      const created = await api.createWaiter(
        newWaiter.email,
        newWaiter.password,
        displayName,
        Boolean(newWaiter.hybrid),
        newWaiter.hybrid ? newWaiter.printerTopic : undefined
      );
      await Promise.all(
        Array.from(newWaiterTableSelection).map((tableId) =>
          api.assignWaiterTable(created.waiter.id, tableId)
        )
      );
      setNewWaiter({
        email: "",
        displayName: "",
        password: "",
        printerTopic: null,
        hybrid: false,
      });
      setNewWaiterTableSelection(new Set());
      setAddModalOpen(false);
      await Promise.all([loadWaiterData(), newWaiter.hybrid ? loadCookData() : Promise.resolve()]);
    } catch (error) {
      console.error("Failed to create waiter", error);
    } finally {
      setAddingWaiter(false);
    }
  };

  const handleSaveCook = async () => {
    if (!activeCook) return;
    setSavingCook(true);
    try {
      const trimmedName = (activeCook.displayName || "").trim();
      const originalName = activeCook.originalDisplayName || "";
      const selectedPrinterTopic = activeCook.printerTopic ?? null;
      const originalPrinterTopic = activeCook.originalPrinterTopic ?? null;
      const updatePayload: Record<string, unknown> = {};
      if (trimmedName && trimmedName !== originalName) {
        updatePayload.displayName = trimmedName;
      }
      if (selectedPrinterTopic !== originalPrinterTopic) {
        updatePayload.printerTopic = selectedPrinterTopic;
      }
      if (Object.keys(updatePayload).length > 0) {
        await api.updateCook(activeCook.id, updatePayload);
      }
      await Promise.all([loadCookData(), loadWaiterData()]);
      setEditCookModalOpen(false);
      setActiveCook(null);
    } catch (error) {
      console.error("Failed to save cook changes", error);
    } finally {
      setSavingCook(false);
    }
  };

  const handleSaveHybrid = async () => {
    if (!activeHybrid) return;
    setSavingHybrid(true);
    try {
      const desired = new Set(tableSelection);
      const current = new Set(initialTableSelection);
      const toAdd = Array.from(desired).filter((id) => !current.has(id));
      const toRemove = Array.from(current).filter((id) => !desired.has(id));

      const ops: Array<Promise<unknown>> = [];
      const trimmedName = (activeHybrid.displayName || "").trim();
      const originalName = activeHybrid.originalDisplayName || "";
      if (trimmedName && trimmedName !== originalName) {
        ops.push(api.updateWaiter(activeHybrid.id, { displayName: trimmedName }));
      }

      const selectedPrinterTopic = activeHybrid.printerTopic ?? null;
      const originalPrinterTopic = activeHybrid.originalPrinterTopic ?? null;
      if (selectedPrinterTopic !== originalPrinterTopic) {
        ops.push(api.updateCook(activeHybrid.id, { printerTopic: selectedPrinterTopic }));
      }

      toAdd.forEach((tableId) =>
        ops.push(api.assignWaiterTable(activeHybrid.id, tableId))
      );
      toRemove.forEach((tableId) =>
        ops.push(api.removeWaiterTable(activeHybrid.id, tableId))
      );

      if (ops.length) {
        await Promise.all(ops);
      }
      await Promise.all([loadWaiterData(), loadCookData()]);
      closeHybridModal(false);
    } catch (error) {
      console.error("Failed to save hybrid changes", error);
    } finally {
      setSavingHybrid(false);
    }
  };

  const handleDeleteCook = async (cookId: string) => {
    const cook = cooks.find((item) => item.id === cookId);
    const isHybrid = String(cook?.role || "").toLowerCase() === "hybrid";
    if (
      !window.confirm(
        isHybrid
          ? t("manager.confirm_remove_cook_role", {
              defaultValue:
                "Remove cook access from this hybrid person? The waiter account will remain.",
            })
          : t("manager.confirm_delete_cook", {
              defaultValue: "Delete this cook account?",
            })
      )
    )
      return;
    setDeletingCookId(cookId);
    try {
      await api.deleteCook(cookId);
      await Promise.all([loadCookData(), isHybrid ? loadWaiterData() : Promise.resolve()]);
    } catch (error) {
      console.error("Failed to delete cook", error);
    } finally {
      setDeletingCookId(null);
    }
  };

  const handleCreateCook = async () => {
    if (!newCook.email || !newCook.password) return;
    setAddingCook(true);
    try {
      const displayName = newCook.displayName.trim() || newCook.email;
      await api.createCook(
        newCook.email,
        newCook.password,
        displayName,
        newCook.printerTopic
      );
      setNewCook({
        email: "",
        displayName: "",
        password: "",
        printerTopic: null,
      });
      setAddCookModalOpen(false);
      await loadCookData();
    } catch (error) {
      console.error("Failed to create cook", error);
    } finally {
      setAddingCook(false);
    }
  };

  const themedWrapper = clsx(themeClass, { dark: dashboardDark });
  const ordersBusy = ordersLoading && ordersAll.length === 0;

  useEffect(() => {}, []);

  const DateRangeHeader = () => (
    <div className="relative flex items-center justify-center">
      <div className="flex flex-col sm:flex-row sm:items-center justify-center sm:justify-center gap-3 w-full">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <div className="inline-flex rounded-lg border border-border/60 bg-card overflow-hidden shadow-sm">
            {[
              {
                key: "today",
                label: t("date_range.today", { defaultValue: "Today" }),
              },
              {
                key: "last24h",
                label: t("date_range.last24h", { defaultValue: "Last 24h" }),
              },
              {
                key: "week",
                label: t("date_range.week", { defaultValue: "Week" }),
              },
              {
                key: "month",
                label: t("date_range.month", { defaultValue: "Month" }),
              },
              {
                key: "custom",
                label: t("date_range.custom", { defaultValue: "Custom" }),
              },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setEconRange(opt.key as EconRange)}
                className={clsx(
                  "px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors",
                  econRange === opt.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground hover:bg-accent"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {econRange === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={customRange.start}
              onChange={(e) =>
                setCustomRange((prev) => ({
                  ...prev,
                  start: e.target.value || prev.start,
                }))
              }
              className="rounded-lg border border-border/60 bg-card px-3 py-1.5 text-foreground text-sm"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="date"
              value={customRange.end}
              onChange={(e) =>
                setCustomRange((prev) => ({
                  ...prev,
                  end: e.target.value || prev.end,
                }))
              }
              className="rounded-lg border border-border/60 bg-card px-3 py-1.5 text-foreground text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );

  const NavigatorButton = () =>
    sidebarCollapsed ? (
      <button
        type="button"
        onClick={() => {
          if (window.matchMedia("(min-width: 640px)").matches) {
            setSidebarCollapsed(false);
          } else {
            setMobileNavOpen(true);
          }
        }}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-card/95 border border-border/50 shadow-lg backdrop-blur-sm text-sm font-medium text-foreground hover:bg-accent transition-colors"
        aria-label={t("manager.expand_navigation", {
          defaultValue: "Expand navigation",
        })}
      >
        <BarChart2 className="h-4 w-4" />
        <span>›</span>
      </button>
    ) : null;

  return (
    <PageTransition className={clsx(themedWrapper, "min-h-screen min-h-dvh")}>
      <div className="min-h-screen min-h-dvh dashboard-bg overflow-x-hidden text-foreground flex flex-col">
        <DashboardHeader
          supertitle={t("manager.dashboard")}
          title={resolveStoreDisplayName(storeName, user?.storeSlug, t("manager.dashboard"))}
          subtitle={undefined}
          rightContent={
            user ? (
              <div className="text-sm flex flex-col items-end gap-1">
                <a
                  href={user.email ? `mailto:${user.email}` : undefined}
                  className="font-medium underline underline-offset-2 hover:text-foreground"
                >
                  {user.displayName}
                </a>
                {user.email ? (
                  <span className="text-muted-foreground text-xs">
                    {user.email}
                  </span>
                ) : null}
              </div>
            ) : undefined
          }
          icon="📊"
          tone="accent"
          burgerActions={
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => window.location.reload()}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {t("manager.refresh", { defaultValue: "Refresh" })}
              </Button>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {t("manager.mode_title", { defaultValue: "MODE" })}:{" "}
                  <span className="font-semibold text-foreground">
                    {managerMode === "pro"
                      ? t("manager.pro", { defaultValue: "Pro" })
                      : t("manager.basic", { defaultValue: "Basic" })}
                  </span>
                </span>
                <Switch
                  checked={managerMode === "pro"}
                  onCheckedChange={(checked) =>
                    setManagerMode(checked ? "pro" : "basic")
                  }
                  aria-label={t("manager.toggle_manager_mode", {
                    defaultValue: "Toggle manager mode",
                  })}
                />
              </div>
            </div>
          }
        />

        <div className="flex-1 flex min-h-0 relative">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as ManagerTab);
              setSidebarCollapsed(true);
            }}
            className="flex flex-1 min-h-0 relative"
          >
            <aside
              className={clsx(
                "hidden sm:flex flex-col absolute z-40 left-4 top-4 rounded-2xl bg-card/95 border border-border/50 shadow-2xl backdrop-blur-sm transition-all duration-200 ease-out w-56",
                sidebarCollapsed
                  ? "-translate-x-[calc(100%+24px)] opacity-0 pointer-events-none"
                  : "translate-x-0 opacity-100"
              )}
            >
              <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {t("manager.nav_title", { defaultValue: "Dashboard" })}
                  </p>
                  <p className="text-sm font-medium text-foreground truncate">
                    {t("manager.analytics_overview", {
                      defaultValue: "Analytics",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t("manager.hide_navigation", {
                    defaultValue: "Collapse",
                  })}
                >
                  <span className="text-base leading-none block">‹</span>
                </button>
              </div>
              <div className="px-2 py-2">
                <TabsList className="flex flex-col w-full gap-1 bg-transparent">
                  {[
                    {
                      key: "economics",
                      label: t("manager.economics", {
                        defaultValue: "Economics",
                      }),
                      icon: <BarChart2 className="h-4 w-4 shrink-0" />,
                    },
                    {
                      key: "orders",
                      label: t("waiter.orders", { defaultValue: "Orders" }),
                      icon: <ListChecks className="h-4 w-4 shrink-0" />,
                    },
                    {
                      key: "personnel",
                      label: t("manager.personnel", {
                        defaultValue: "Personnel",
                      }),
                      icon: <Users className="h-4 w-4 shrink-0" />,
                    },
                    {
                      key: "menu",
                      label: t("menu.title"),
                      icon: <UtensilsCrossed className="h-4 w-4 shrink-0" />,
                    },
                  ].map(({ key, label, icon }) => (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all duration-150"
                    >
                      {icon}
                      <span className="truncate">{label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </aside>

            {/* Mobile Navigation */}
            <div className="sm:hidden">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetContent
                  side="left"
                  className="w-[280px] bg-background text-foreground"
                >
                  <SheetHeader>
                    <SheetTitle className="text-base font-semibold">
                      {t("manager.analytics_overview", {
                        defaultValue: "Analytics",
                      })}
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                      {t("manager.navigation_menu_description", {
                        defaultValue: "Manager dashboard navigation",
                      })}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 space-y-1">
                    {[
                      {
                        key: "economics",
                        label: t("manager.economics", {
                          defaultValue: "Economics",
                        }),
                        icon: <BarChart2 className="h-4 w-4" />,
                      },
                      {
                        key: "orders",
                        label: t("waiter.orders", { defaultValue: "Orders" }),
                        icon: <ListChecks className="h-4 w-4" />,
                      },
                      {
                        key: "personnel",
                        label: t("manager.personnel", {
                          defaultValue: "Personnel",
                        }),
                        icon: <Users className="h-4 w-4" />,
                      },
                      {
                        key: "menu",
                        label: t("menu.title"),
                        icon: <UtensilsCrossed className="h-4 w-4" />,
                      },
                    ].map(({ key, label, icon }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setActiveTab(key as ManagerTab);
                          setSidebarCollapsed(true);
                          setMobileNavOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                          activeTab === key
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        {icon}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="flex-1 w-full overflow-y-auto">
              <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
                <NavigatorButton />
                <TabsContent value="economics" className="space-y-6 min-w-0 overflow-x-hidden">
                  {ordersBusy ? (
                    <DashboardGridSkeleton count={4} />
                  ) : (
                    <>
                      <DateRangeHeader />
                      <Card className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4">
                          {t("manager.finance_kpis", {
                            defaultValue: "Finance KPIs",
                          })}
                        </h3>
                        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,_1fr))]">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.total_revenue", {
                                defaultValue: "Total Revenue",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {formatCurrency(totalRevenueInRange)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.avg_ticket_eur", {
                                defaultValue: "Avg Ticket (€)",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {servedCountInRange
                                ? formatCurrency(avgTicketInRange)
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.served_orders", {
                                defaultValue: "Served Orders",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {servedCountInRange}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.cancels_eur", {
                                defaultValue: "Cancels €",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {formatCurrency(refundTotalInRange)}
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4">
                          {econRange === "today" || econRange === "last24h"
                            ? t("manager.revenue_by_hour", {
                                defaultValue: "Revenue by hour",
                              })
                            : econRange === "week"
                            ? t("manager.revenue_by_daypart", {
                                defaultValue: "Revenue by daypart",
                              })
                            : t("manager.revenue_by_day", {
                                defaultValue: "Revenue by day",
                              })}
                        </h3>
                        <div className="h-72 w-full min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={revenueTimeline}
                              margin={{
                                top: 16,
                                right: isMobile ? 8 : 24,
                                bottom: isMobile ? 12 : 8,
                                left: isMobile ? 0 : 24,
                              }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: isMobile ? 10 : 12 }}
                                interval="preserveStartEnd"
                                minTickGap={isMobile ? 20 : 8}
                              />
                              <YAxis width={isMobile ? 30 : 40} />
                              <Tooltip />
                              {!isMobile ? <Legend /> : null}
                              <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                name={t("manager.revenue_eur", {
                                  defaultValue: "Revenue (€)",
                                })}
                              />
                              <Line
                                type="monotone"
                                dataKey="prevRevenue"
                                stroke="hsl(var(--muted-foreground))"
                                strokeDasharray="4 4"
                                name={t("manager.prior_period_eur", {
                                  defaultValue: "Prior period (€)",
                                })}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>

                      <Card className="p-4 sm:p-6 revenue-category-card">
                        <h3 className="text-lg font-semibold mb-4">
                          {t("manager.revenue_by_category", {
                            defaultValue: "Revenue by category",
                          })}
                        </h3>
                        <div className="h-72">
                          {ordersBusy || !categoryRevenue ? (
                            <div className="h-full w-full rounded-xl border border-dashed border-border bg-muted/20 p-4 animate-pulse flex flex-col justify-between">
                              <div className="flex gap-3">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-16" />
                              </div>
                              <div className="flex items-end gap-3 flex-1 pb-2">
                                {Array.from({ length: 7 }).map((_, idx) => (
                                  <div
                                    key={idx}
                                    className="flex-1 flex flex-col justify-end gap-2"
                                  >
                                    <Skeleton className="h-20 w-full rounded-md" />
                                    <Skeleton className="h-3 w-10 mx-auto" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : categoryRevenue.length === 0 ? (
                            <div className="h-full w-full rounded-xl border border-dashed border-border bg-muted/10 p-6 flex items-center justify-center text-sm text-muted-foreground">
                              {t("manager.no_category_revenue", {
                                defaultValue: "No category revenue yet.",
                              })}
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={categoryRevenue}
                                margin={{
                                  top: 8,
                                  right: isMobile ? 8 : 16,
                                  bottom: isMobile ? 24 : 8,
                                  left: isMobile ? 0 : 8,
                                }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="category"
                                  tick={{ fontSize: isMobile ? 10 : 12 }}
                                  tickFormatter={formatCategoryAxisLabel}
                                  interval={0}
                                  angle={isMobile ? -20 : 0}
                                  textAnchor={isMobile ? "end" : "middle"}
                                  height={isMobile ? 48 : 30}
                                />
                                <YAxis width={isMobile ? 32 : 40} />
                                <Tooltip
                                  labelFormatter={(value) => String(value)}
                                  formatter={(value: ValueType) => {
                                    const numericValue =
                                      typeof value === "number"
                                        ? value
                                        : Number(value ?? 0);
                                    return [
                                      formatCurrency(numericValue),
                                      t("manager.revenue", {
                                        defaultValue: "Revenue",
                                      }),
                                    ];
                                  }}
                                />
                                  <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </Card>

                      <Card className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-3">
                          {t("manager.top_items_revenue", {
                            defaultValue: "Top 5 items by revenue",
                          })}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground border-b">
                                <th className="py-2">
                                  {t("manager.item", { defaultValue: "Item" })}
                                </th>
                                <th className="py-2">
                                  {t("manager.revenue", {
                                    defaultValue: "Revenue",
                                  })}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {topItems.map((item) => (
                                <tr key={item.name} className="border-b">
                                  <td className="py-2">{item.name}</td>
                                  <td className="py-2 font-medium">
                                    {formatCurrency(item.revenue)}
                                  </td>
                                </tr>
                              ))}
                              {topItems.length === 0 && (
                                <tr>
                                  <td
                                    className="py-2 text-muted-foreground"
                                    colSpan={2}
                                  >
                                    {t("manager.no_sales_yet", {
                                      defaultValue: "No sales yet.",
                                    })}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </Card>

                      {managerMode === "pro" && (
                        <>
                          <section className="space-y-6 pt-6 border-t border-border/60">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-foreground">
                                {t("manager.pro_insights", {
                                  defaultValue: "Advanced insights",
                                })}
                              </h3>
                              <ProBadge />
                            </div>

                            <Card className="p-4 sm:p-6">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    {t("manager.insight", {
                                      defaultValue: "Insight",
                                    })}
                                  </p>
                                  <h3 className="text-lg font-semibold">
                                    {t("manager.wow_revenue", {
                                      defaultValue: "Week-over-Week Δ Revenue",
                                    })}
                                  </h3>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                                  <ProBadge />
                                  <div className="text-center sm:text-right">
                                    {(() => {
                                      const prev = totalRevenuePrevRange;
                                      const curr = totalRevenueInRange;
                                      const delta =
                                        prev > 0
                                          ? ((curr - prev) / prev) * 100
                                          : curr > 0
                                          ? 100
                                          : 0;
                                      const up = delta > 0.5;
                                      const down = delta < -0.5;
                                      const color = up
                                        ? "text-primary"
                                        : down
                                        ? "text-destructive"
                                        : "text-muted-foreground";
                                      return (
                                        <div className="flex flex-col items-center sm:items-end gap-1">
                                          <div
                                            className={`text-2xl sm:text-3xl font-semibold ${color} flex items-baseline gap-1`}
                                          >
                                            <span>
                                              {up ? "↑" : down ? "↓" : "↔"}
                                            </span>
                                            <span className="whitespace-nowrap">
                                              {Math.abs(delta).toFixed(1)}%
                                            </span>
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {t("manager.vs_prior", {
                                              defaultValue: "vs prior period",
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </Card>

                            <Card className="p-4 sm:p-6">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    {t("manager.value", {
                                      defaultValue: "Value",
                                    })}
                                  </p>
                                  <h3 className="text-lg font-semibold">
                                    {t("manager.avg_ticket_by_daypart", {
                                      defaultValue: "Average Ticket by Daypart",
                                    })}
                                  </h3>
                                </div>
                                <ProBadge />
                              </div>
                              <div className="h-64 w-full min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart
                                    data={avgTicketByDaypart}
                                    margin={{
                                      top: 8,
                                      right: isMobile ? 8 : 16,
                                      bottom: isMobile ? 24 : 8,
                                      left: isMobile ? 0 : 8,
                                    }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                      dataKey="daypart"
                                      tick={{ fontSize: isMobile ? 10 : 12 }}
                                      tickFormatter={formatDaypartAxisLabel}
                                      interval={0}
                                      angle={isMobile ? -20 : 0}
                                      textAnchor={isMobile ? "end" : "middle"}
                                      height={isMobile ? 48 : 30}
                                    />
                                    <YAxis
                                      width={isMobile ? 36 : 52}
                                      tickFormatter={(v) =>
                                        formatCurrency(Number(v))
                                      }
                                    />
                                    <Tooltip
                                      labelFormatter={(label) =>
                                        formatDaypartLabel(String(label))
                                      }
                                      formatter={(value: ValueType) => {
                                        const numericValue =
                                          typeof value === "number"
                                            ? value
                                            : Number(value ?? 0);
                                        return [
                                          formatCurrency(numericValue),
                                          t("manager.avg_ticket", {
                                            defaultValue: "Avg ticket",
                                          }),
                                        ];
                                      }}
                                    />
                                    <Bar
                                      dataKey="avg"
                                      fill="hsl(var(--primary))"
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </Card>

                            {/* Profitability leaderboard removed from Advanced Insights per new layout */}
                          </section>
                        </>
                      )}

                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="inline-flex items-center gap-2"
                        >
                          <FileText className="h-4 w-4" />
                          {t("manager.export_pdf", {
                            defaultValue: "Export PDF",
                          })}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="inline-flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          {t("manager.export_csv", {
                            defaultValue: "Export CSV",
                          })}
                        </Button>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="orders" className="space-y-6 min-w-0 overflow-x-hidden">
                  {ordersBusy ? (
                    <DashboardGridSkeleton count={3} />
                  ) : (
                    <>
                      <DateRangeHeader />
                      <Card className="p-4 sm:p-6">
                        <p className="text-sm text-muted-foreground mb-4">
                          {t("manager.operations_kpis", {
                            defaultValue: "Operations KPIs",
                          })}
                        </p>
                        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,_1fr))]">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.total_orders", {
                                defaultValue: "Total Orders",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {totalOrders}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.avg_serve_min", {
                                defaultValue: "Avg Serve Time (min)",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {formatMinutesValue(avgServeTimeMinutes)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.median_serve_min", {
                                defaultValue: "Median Serve (min)",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {formatMinutesValue(medianServeMinutes)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("manager.busiest_hour", {
                                defaultValue: "Busiest Hour",
                              })}
                            </p>
                            <p className="text-2xl font-semibold">
                              {busiestHourLabel ?? "—"}
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {t("manager.volume", { defaultValue: "Volume" })}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {t("manager.orders_timeline", {
                                defaultValue: "Orders timeline",
                              })}
                            </h3>
                          </div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            {(() => {
                              const d = ordersTimelineTrend.deltaPct;
                              if (d > 0.5)
                                return (
                                  <span className="text-primary">
                                    ↑ {Math.abs(d).toFixed(1)}%
                                  </span>
                                );
                              if (d < -0.5)
                                return (
                                  <span className="text-destructive">
                                    ↓ {Math.abs(d).toFixed(1)}%
                                  </span>
                                );
                              return <span className="">↔ 0.0%</span>;
                            })()}
                          </div>
                        </div>
                        {ordersTimeline.length ? (
                          <div className="h-64 sm:h-72 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={ordersTimeline}
                                margin={{
                                  top: 8,
                                  right: isMobile ? 8 : 16,
                                  bottom: isMobile ? 12 : 8,
                                  left: 0,
                                }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="label"
                                  tick={{ fontSize: isMobile ? 10 : 11 }}
                                  interval="preserveStartEnd"
                                  minTickGap={isMobile ? 18 : 8}
                                />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={35} />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="count"
                                  stroke="hsl(var(--primary))"
                                  strokeWidth={2}
                                  name={t("manager.total_orders", { defaultValue: "Orders" })}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            {t("manager.no_orders_timeline", {
                              defaultValue: "No orders recorded yet.",
                            })}
                          </p>
                        )}
                      </Card>

                      <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("manager.status_mix", {
                                  defaultValue: "Status Mix",
                                })}
                              </p>
                              <h3 className="text-lg font-semibold">
                                {t("manager.orders_by_status", {
                                  defaultValue: "Orders by status",
                                })}
                              </h3>
                            </div>
                          </div>
                          {totalOrders ? (
                            <div className="h-56 sm:h-64 w-full min-w-0">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={ordersByStatus}
                                  margin={{
                                    top: 8,
                                    right: isMobile ? 8 : 12,
                                    bottom: isMobile ? 20 : 8,
                                    left: 0,
                                  }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis
                                    dataKey="statusAxisLabel"
                                    tick={{ fontSize: isMobile ? 9 : 10 }}
                                    interval={0}
                                    minTickGap={0}
                                  />
                                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                                  <Tooltip labelFormatter={(_, payload) => String(payload?.[0]?.payload?.statusLabel ?? "")} />
                                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {ordersByStatus.map((entry, idx) => (
                                      <Cell
                                        key={`c-${idx}`}
                                        fill={
                                          entry.atRisk
                                            ? "hsl(var(--destructive))"
                                            : "hsl(var(--primary))"
                                        }
                                      />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              {t("manager.no_statuses_yet", {
                                defaultValue:
                                  "Statuses will appear once orders arrive.",
                              })}
                            </p>
                          )}
                        </Card>

                        <Card className="p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("manager.throughput", {
                                  defaultValue: "Throughput",
                                })}
                              </p>
                              <h3 className="text-lg font-semibold">
                                {t("manager.placed_served_minutes", {
                                  defaultValue: "Placed → Served minutes",
                                })}
                              </h3>
                            </div>
                          </div>
                          {serveDurationsMinutes.length ? (
                            <div className="h-56 sm:h-64 w-full min-w-0">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={throughputHistogram}
                                  margin={{
                                    top: 8,
                                    right: isMobile ? 8 : 12,
                                    bottom: isMobile ? 12 : 8,
                                    left: 0,
                                  }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 10 }} />
                                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                                  <Tooltip />
                                  <Bar
                                    dataKey="count"
                                    fill="hsl(var(--primary))"
                                    radius={[4, 4, 0, 0]}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              {t("manager.need_one_served_for_throughput", {
                                defaultValue:
                                  "Need at least one served order to measure throughput.",
                              })}
                            </p>
                          )}
                        </Card>
                      </div>

                      {managerMode === "pro" && (
                        <>
                          <div className="grid gap-6 lg:grid-cols-2">
                            <Card className="p-4 sm:p-6">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    {t("manager.variability", {
                                      defaultValue: "Variability",
                                    })}
                                  </p>
                                  <h3 className="text-lg font-semibold">
                                    {t("manager.prep_time_distribution", {
                                      defaultValue: "Prep Time Distribution",
                                    })}
                                  </h3>
                                </div>
                                <ProBadge />
                              </div>
                              {prepDurationsMinutes.length ? (
                                <div className="h-56 sm:h-64 w-full min-w-0">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                      data={prepHistogram}
                                      margin={{
                                        top: 8,
                                        right: isMobile ? 8 : 12,
                                        bottom: isMobile ? 12 : 8,
                                        left: 0,
                                      }}
                                    >
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 10 }} />
                                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                                      <Tooltip />
                                      <Bar
                                        dataKey="count"
                                        fill="hsl(var(--primary))"
                                        radius={[4, 4, 0, 0]}
                                      />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                  {t("manager.no_data_yet", {
                                    defaultValue: "No data yet.",
                                  })}
                                </p>
                              )}
                            </Card>

                            <Card className="p-4 sm:p-6">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    {t("manager.reliability", {
                                      defaultValue: "Reliability",
                                    })}
                                  </p>
                                  <h3 className="text-lg font-semibold">
                                    {t("manager.sla_breaches", {
                                      defaultValue: "SLA Breaches",
                                    })}
                                  </h3>
                                </div>
                                <ProBadge />
                              </div>
                              <div className="flex items-center justify-between mb-3">
                                <div className="text-2xl font-semibold">
                                  {slaBreaches.length}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {t("manager.target_minutes", {
                                    defaultValue: "Target: {{minutes}} min",
                                    minutes: SLA_TARGET_MINUTES,
                                  })}
                                </div>
                              </div>
                              {slaBreaches.length ? (
                                <div className="space-y-2">
                                  {slaBreaches.map((b) => (
                                    <div
                                      key={b.order.id}
                                      className="flex items-center justify-between border rounded-md px-3 py-2"
                                    >
                                      <div className="text-sm">
                                        {orderLabel(b.order)}
                                      </div>
                                      <Badge variant="destructive">
                                        {Math.round(b.minutes ?? 0)}m
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  {t("manager.no_breaches", {
                                    defaultValue: "No breaches in history.",
                                  })}
                                </p>
                              )}
                            </Card>
                          </div>

                          <Card className="p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  {t("manager.queue_pressure", {
                                    defaultValue: "Queue Pressure",
                                  })}
                                </p>
                                <h3 className="text-lg font-semibold">
                                  {t("manager.bottleneck_heatmap", {
                                    defaultValue: "Bottleneck Heatmap",
                                  })}
                                </h3>
                              </div>
                              <ProBadge />
                            </div>
                            <div className="overflow-x-auto">
                              <div className="text-xs text-muted-foreground mb-2">
                                {t("manager.bottleneck_heatmap_description", {
                                  defaultValue:
                                    "Counts by hour of placement and current status",
                                })}
                              </div>
                              <div className="inline-block">
                                <div
                                  className="grid"
                                  style={{
                                    gridTemplateColumns: `72px repeat(${bottleneckMatrix.hours.length}, 28px)`,
                                  }}
                                >
                                  <div></div>
                                  {bottleneckMatrix.hours.map((h) => (
                                    <div
                                      key={`h-${h}`}
                                      className="text-[10px] text-center text-muted-foreground"
                                    >
                                      {h}
                                    </div>
                                  ))}
                                  {bottleneckMatrix.statuses.map((status) => (
                                    <Fragment key={`row-${status}`}>
                                      <div className="text-[10px] pr-2 flex items-center justify-end text-muted-foreground">
                                        {formatStatusLabel(status)}
                                      </div>
                                      {bottleneckMatrix.hours.map((h) => {
                                        const v =
                                          bottleneckMatrix.matrix[status][h] ??
                                          0;
                                        const intensity =
                                          v / bottleneckMatrix.max;
                                        const bg = `rgba(99,102,241,${Math.max(
                                          0.08,
                                          intensity
                                        )})`;
                                        return (
                                          <div
                                            key={`${status}-${h}`}
                                            title={`${v}`}
                                            style={{
                                              background: bg,
                                              width: 28,
                                              height: 20,
                                            }}
                                          />
                                        );
                                      })}
                                    </Fragment>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </Card>

                          <Card className="p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  {t("manager.engagement", {
                                    defaultValue: "Engagement",
                                  })}
                                </p>
                                <h3 className="text-lg font-semibold">
                                  {t("manager.reorder_rate_45m", {
                                    defaultValue: "Reorder Rate (≤45m)",
                                  })}
                                </h3>
                              </div>
                              <ProBadge />
                            </div>
                            <div className="flex items-baseline gap-3">
                              <div className="text-3xl font-semibold">
                                {reorderRate.percent}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t("manager.reorder_rate_description", {
                                  defaultValue:
                                    "{{reordered}}/{{total}} tables placed a second order within 45 minutes.",
                                  reordered: reorderRate.tablesWithReorder,
                                  total: reorderRate.tablesWithOrders,
                                })}
                              </div>
                            </div>
                          </Card>
                        </>
                      )}

                      <Card className="p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {t("manager.exceptions", {
                                defaultValue: "Exceptions",
                              })}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {t("manager.stuck_orders", {
                                defaultValue: "Stuck orders",
                              })}
                            </h3>
                          </div>
                        </div>
                        {stuckOrders.length ? (
                          <div className="space-y-3">
                            {stuckOrders.map(
                              ({ order, minutes, threshold }) => (
                                <div
                                  key={order.id}
                                  className="border border-border/60 rounded-xl p-4 flex items-center justify-between"
                                >
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {order.tableLabel ?? order.tableId}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatStatusLabel(order.status)} ·{" "}
                                      {minutes.toFixed(1)} {minutesShortLabel}{" "}
                                      {t("manager.limit_minutes", {
                                        defaultValue: "(limit {{minutes}}m)",
                                        minutes: threshold,
                                      })}
                                    </p>
                                  </div>
                                  <Badge variant="destructive">
                                    +{Math.round(minutes - threshold)}m
                                  </Badge>
                                </div>
                              )
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t("manager.no_stuck_orders", {
                              defaultValue:
                                "No orders are stuck in status right now.",
                            })}
                          </p>
                        )}
                      </Card>

                      <Card className="p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {t("manager.activity", {
                                defaultValue: "Activity",
                              })}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {t("manager.recent_orders", {
                                defaultValue: "Recent orders",
                              })}
                            </h3>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground border-b">
                                <th className="py-2">
                                  {t("manager.order", { defaultValue: "Order" })}
                                </th>
                                <th className="py-2">
                                  {t("manager.table", { defaultValue: "Table" })}
                                </th>
                                <th className="py-2">
                                  {t("manager.status", { defaultValue: "Status" })}
                                </th>
                                <th className="py-2">
                                  {t("manager.placed", { defaultValue: "Placed" })}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentOrders.map((order) => (
                                <tr
                                  key={order.id}
                                  className="border-b last:border-b-0"
                                >
                                  <td className="py-2">{orderLabel(order)}</td>
                                  <td className="py-2">
                                    <Badge variant="secondary">
                                      {order.tableLabel ?? order.tableId}
                                    </Badge>
                                  </td>
                                  <td className="py-2">
                                    <Badge variant="outline">
                                      {order.status}
                                    </Badge>
                                  </td>
                                  <td className="py-2 text-muted-foreground">
                                    {dateTimeFormatter.format(
                                      getPlacedDate(order)
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {recentOrders.length === 0 && (
                                <tr>
                                  <td
                                    className="py-2 text-muted-foreground"
                                    colSpan={4}
                                  >
                                    {t("manager.no_orders_yet", {
                                      defaultValue: "No orders yet.",
                                    })}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="personnel" className="space-y-6 min-w-0 overflow-x-hidden">
                  {/* Unified Staff Management Card */}
                  <Card className="p-0 overflow-hidden">
                    <Tabs defaultValue="waiters" className="w-full">
                      {/* Horizontal category navigation */}
                      <div className="border-b border-border/60 bg-muted/30">
                        <div className="px-4 sm:px-6 pt-4 pb-0">
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold">
                              {t("manager.staff_management", {
                                defaultValue: "Staff Management",
                              })}
                            </h3>
                            <div className="text-xs text-muted-foreground">
                              {t("manager.staff_summary", {
                                defaultValue: "{{members}} members",
                                members: staffRoster.length,
                              })}
                            </div>
                          </div>
                          <TabsList className="h-auto w-full justify-start gap-0 overflow-x-auto p-0 bg-transparent rounded-none">
                            <TabsTrigger 
                              value="waiters" 
                              className="relative shrink-0 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                              <Users className="h-4 w-4 mr-1.5" />
                              {t("manager.waiters", {
                                defaultValue: "Waiters",
                              })}
                              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{waiterPersonnel.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger 
                              value="cooks" 
                              className="relative shrink-0 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                              <ChefHat className="h-4 w-4 mr-1.5" />
                              {t("manager.cooks", { defaultValue: "Cooks" })}
                              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{cookPersonnel.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger 
                              value="hybrids" 
                              className="relative shrink-0 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                              <UtensilsCrossed className="h-4 w-4 mr-1.5" />
                              {t("manager.hybrids", { defaultValue: "Hybrids" })}
                              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{hybridPersonnel.length}</Badge>
                            </TabsTrigger>
                          </TabsList>
                        </div>
                      </div>

                      {/* Content area */}
                      <div className="p-4 sm:p-6">
                        <TabsContent value="waiters" className="mt-0 space-y-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                              {t("manager.waiters_description", {
                                defaultValue:
                                  "Manage waiter personnel, table assignments, and service options.",
                              })}
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Button
                                onClick={() => {
                                  setNewWaiter((prev) => ({ ...prev, hybrid: false, printerTopic: null }));
                                  setNewWaiterTableSelection(new Set());
                                  setAddModalOpen(true);
                                }}
                                size="sm"
                                className="inline-flex w-full items-center justify-center gap-2 sm:w-auto"
                              >
                                <Plus className="h-4 w-4" />{" "}
                                {t("actions.add_waiter")}
                              </Button>
                            </div>
                          </div>
                          {loadingWaiters ? (
                            <DashboardGridSkeleton count={4} className="grid md:grid-cols-2 lg:grid-cols-3" />
                          ) : waiterPersonnel.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-border/60 rounded-lg bg-muted/20">
                              <Users className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                              <p className="text-sm text-muted-foreground">
                                {t("manager.no_waiters", {
                                  defaultValue: "No waiters yet. Add your first waiter to get started.",
                                })}
                              </p>
                            </div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {waiterPersonnel.map((member) => (
                                <div
                                  key={member.id}
                                  className="group border border-border/60 rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <span className="text-sm font-semibold text-primary">
                                        {(member.displayName || member.email || "?")[0].toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium text-foreground truncate">
                                          {member.displayName || member.email}
                                        </p>
                                        {member.waiterDetail && (
                                          <span className={cn(
                                            "h-2 w-2 rounded-full shrink-0",
                                            member.waiterDetail.shiftOn ? "bg-green-500" : "bg-muted-foreground/30"
                                          )} title={member.waiterDetail.shiftOn
                                            ? t("manager.on_shift", {
                                                defaultValue: "On shift",
                                              })
                                            : t("manager.off_shift", {
                                                defaultValue: "Off shift",
                                              })} />
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {member.email}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                        {member.isHybrid ? (
                                          <Badge variant="success" className="text-[10px] h-5">
                                            {t("manager.hybrid_personnel", {
                                              defaultValue: "Hybrid waiter + cook",
                                            })}
                                          </Badge>
                                        ) : member.waiterDetail ? (
                                          <Badge variant="outline" className="text-[10px] h-5">
                                            {t("manager.waiter", { defaultValue: "Waiter" })}
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[10px] h-5">
                                            {t("manager.cook", { defaultValue: "Cook" })}
                                          </Badge>
                                        )}
                                        {member.waiterDetail && (
                                          <Badge variant="outline" className="text-[10px] h-5">
                                            {member.waiterDetail.assignedTables.length}{" "}
                                            {t("manager.tables", { defaultValue: "tables" })}
                                          </Badge>
                                        )}
                                        {member.cook?.printerTopic && (
                                          <Badge variant="secondary" className="text-[10px] h-5">
                                            {member.cook.printerTopic}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/40">
                                    {member.waiterDetail && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex-1 h-8 text-xs"
                                        onClick={() => openEditWaiter(member.waiterDetail!.waiter)}
                                      >
                                        <Users className="h-3 w-3 mr-1" />{" "}
                                        {t("manager.waiter", { defaultValue: "Waiter" })}
                                      </Button>
                                    )}
                                    {member.cook && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex-1 h-8 text-xs"
                                        onClick={() => openEditCook(member.cook!)}
                                      >
                                        <ChefHat className="h-3 w-3 mr-1" />{" "}
                                        {t("manager.cook", { defaultValue: "Cook" })}
                                      </Button>
                                    )}
                                    {member.isHybrid ? (
                                      <>
                                        {member.waiterDetail && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 flex-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDeleteWaiter(member.id)}
                                            disabled={deletingWaiterId === member.id}
                                          >
                                            {deletingWaiterId === member.id ? (
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                              <Trash2 className="h-3 w-3 mr-1" />
                                            )}
                                            {t("manager.remove_waiter_role", {
                                              defaultValue: "Remove waiter",
                                            })}
                                          </Button>
                                        )}
                                        {member.cook && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 flex-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDeleteCook(member.id)}
                                            disabled={deletingCookId === member.id}
                                          >
                                            {deletingCookId === member.id ? (
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                              <Trash2 className="h-3 w-3 mr-1" />
                                            )}
                                            {t("manager.remove_cook_role", {
                                              defaultValue: "Remove cook",
                                            })}
                                          </Button>
                                        )}
                                      </>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() =>
                                          member.waiterDetail
                                            ? handleDeleteWaiter(member.id)
                                            : handleDeleteCook(member.id)
                                        }
                                        disabled={deletingWaiterId === member.id || deletingCookId === member.id}
                                      >
                                        {deletingWaiterId === member.id || deletingCookId === member.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="cooks" className="mt-0 space-y-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                              {t("manager.cooks_description", {
                                defaultValue:
                                  "Manage cook personnel and kitchen routing options.",
                              })}
                            </p>
                            <Button
                              onClick={() => setAddCookModalOpen(true)}
                              size="sm"
                              className="inline-flex w-full items-center justify-center gap-2 sm:w-auto"
                            >
                              <Plus className="h-4 w-4" />{" "}
                              {t("manager.add_cook", {
                                defaultValue: "Add cook",
                              })}
                            </Button>
                          </div>
                          {loadingCooks ? (
                            <DashboardGridSkeleton count={4} className="grid md:grid-cols-2 lg:grid-cols-3" />
                          ) : cookPersonnel.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-border/60 rounded-lg bg-muted/20">
                              <ChefHat className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                              <p className="text-sm text-muted-foreground">
                                {t("manager.no_cooks", {
                                  defaultValue: "No cooks yet. Add your first cook to get started.",
                                })}
                              </p>
                            </div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {cookPersonnel.map((member) => (
                                <div
                                  key={member.id}
                                  className="group border border-border/60 rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                                      <ChefHat className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-foreground truncate">
                                        {member.displayName || member.email}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {member.email}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                        <Badge variant="outline" className="text-[10px] h-5">
                                          {t("manager.cook", { defaultValue: "Cook" })}
                                        </Badge>
                                        {member.cook?.printerTopic && (
                                          <Badge variant="secondary" className="text-[10px] h-5">
                                            {member.cook.printerTopic}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/40">
                                    {member.cook && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex-1 h-8 text-xs"
                                        onClick={() => openEditCook(member.cook!)}
                                      >
                                        <Pencil className="h-3 w-3 mr-1" />{" "}
                                        {t("manager.edit_details", {
                                          defaultValue: "Edit details",
                                        })}
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => handleDeleteCook(member.id)}
                                      disabled={deletingCookId === member.id}
                                    >
                                      {deletingCookId === member.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="hybrids" className="mt-0 space-y-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                              {t("manager.hybrids_description", {
                                defaultValue:
                                  "Manage mixed personnel with both waiter and cook capabilities.",
                              })}
                            </p>
                            <Button
                              onClick={() => {
                                setNewWaiter((prev) => ({ ...prev, hybrid: true }));
                                setNewWaiterTableSelection(new Set());
                                setAddModalOpen(true);
                              }}
                              size="sm"
                              className="inline-flex w-full items-center justify-center gap-2 sm:w-auto"
                            >
                              <Plus className="h-4 w-4" />{" "}
                              {t("manager.create_hybrid_personnel", {
                                defaultValue: "Create hybrid",
                              })}
                            </Button>
                          </div>
                          {loadingWaiters || loadingCooks ? (
                            <DashboardGridSkeleton count={4} className="grid md:grid-cols-2 lg:grid-cols-3" />
                          ) : hybridPersonnel.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-border/60 rounded-lg bg-muted/20">
                              <UtensilsCrossed className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                              <p className="text-sm text-muted-foreground">
                                {t("manager.no_hybrids", {
                                  defaultValue: "No hybrid personnel yet.",
                                })}
                              </p>
                            </div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {hybridPersonnel.map((member) => (
                                <div
                                  key={member.id}
                                  className="group border border-primary/30 rounded-lg p-4 bg-primary/5 hover:bg-primary/10 transition-colors"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <span className="text-sm font-semibold text-primary">
                                        {(member.displayName || member.email || "?")[0].toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium text-foreground truncate">
                                          {member.displayName || member.email}
                                        </p>
                                        {member.waiterDetail && (
                                          <span className={cn(
                                            "h-2 w-2 rounded-full shrink-0",
                                            member.waiterDetail.shiftOn ? "bg-green-500" : "bg-muted-foreground/30"
                                          )} title={member.waiterDetail.shiftOn
                                            ? t("manager.on_shift", {
                                                defaultValue: "On shift",
                                              })
                                            : t("manager.off_shift", {
                                                defaultValue: "Off shift",
                                              })} />
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {member.email}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                        <Badge variant="success" className="text-[10px] h-5">
                                          {t("manager.hybrid_personnel", {
                                            defaultValue: "Hybrid waiter + cook",
                                          })}
                                        </Badge>
                                        {member.waiterDetail && (
                                          <Badge variant="outline" className="text-[10px] h-5">
                                            {member.waiterDetail.assignedTables.length}{" "}
                                            {t("manager.tables", { defaultValue: "tables" })}
                                          </Badge>
                                        )}
                                        {member.cook?.printerTopic && (
                                          <Badge variant="secondary" className="text-[10px] h-5">
                                            {member.cook.printerTopic}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/40">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="flex-1 h-8 text-xs"
                                      onClick={() => openEditHybrid(member)}
                                    >
                                      <UtensilsCrossed className="h-3 w-3 mr-1" />{" "}
                                      {t("manager.hybrid_options", {
                                        defaultValue: "Options",
                                      })}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>

                      </div>
                    </Tabs>
                  </Card>


                  {managerMode === "pro" && (
                    <>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("manager.highlights", {
                                  defaultValue: "Highlights",
                                })}
                              </p>
                              <h3 className="text-lg font-semibold">
                                {t("manager.top_needs_attention", {
                                  defaultValue: "Top / Needs Attention",
                                })}
                              </h3>
                            </div>
                            <ProBadge />
                          </div>
                          {topAndAttentionWaiters ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="border rounded-md p-3">
                                <p className="text-xs text-muted-foreground">
                                  {t("manager.top_by_p90", {
                                    defaultValue: "Top by P90 serve",
                                  })}
                                </p>
                                <p className="text-base font-semibold">
                                  {topAndAttentionWaiters.best.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  P90:{" "}
                                  {formatMinutesValue(
                                    topAndAttentionWaiters.best.p90
                                  )}
                                </p>
                              </div>
                              <div className="border rounded-md p-3">
                                <p className="text-xs text-muted-foreground">
                                  {t("manager.needs_attention", {
                                    defaultValue: "Needs attention",
                                  })}
                                </p>
                                <p className="text-base font-semibold">
                                  {topAndAttentionWaiters.worst.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  P90:{" "}
                                  {formatMinutesValue(
                                    topAndAttentionWaiters.worst.p90
                                  )}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {t("manager.not_enough_served", {
                                defaultValue:
                                  "Not enough served orders to compare yet.",
                              })}
                            </p>
                          )}
                        </Card>

                        <Card className="p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("manager.coverage", {
                                  defaultValue: "Coverage",
                                })}
                              </p>
                              <h3 className="text-lg font-semibold">
                                {t("manager.coverage_gaps", {
                                  defaultValue: "Coverage Gaps (last 7d)",
                                })}
                              </h3>
                            </div>
                            <ProBadge />
                          </div>
                          {coverageGaps.length ? (
                            <div className="flex flex-wrap gap-2">
                              {coverageGaps.map((h) => (
                                <Badge key={h} variant="outline">{`${String(
                                  h
                                ).padStart(2, "0")}:00`}</Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {t("manager.no_gaps", {
                                defaultValue:
                                  "No gaps detected where orders occurred.",
                              })}
                            </p>
                          )}
                        </Card>
                      </div>

                      <Card className="p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {t("manager.responsiveness", {
                                defaultValue: "Responsiveness",
                              })}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {t("manager.first_response_call_waiter", {
                                defaultValue: "First-Response to Call-Waiter",
                              })}
                            </h3>
                          </div>
                          <ProBadge />
                        </div>
                        {callResponseDurations.length ? (
                          <div className="flex flex-wrap items-end gap-6">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {t("manager.median", {
                                  defaultValue: "Median",
                                })}
                              </p>
                              <p className="text-2xl font-semibold">
                                {formatMinutesValue(callMedian)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {t("manager.p95", {
                                  defaultValue: "95th percentile",
                                })}
                              </p>
                              <p className="text-2xl font-semibold">
                                {formatMinutesValue(callP95)}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("manager.based_on_live", {
                                defaultValue: "based on live events",
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t("manager.no_call_waiter_data", {
                              defaultValue:
                                "No call-waiter responses recorded yet.",
                            })}
                          </p>
                        )}
                      </Card>
                    </>
                  )}

                  <Card className="p-4 sm:p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t("manager.floor", { defaultValue: "Floor" })}
                        </p>
                        <h3 className="text-lg font-semibold">
                          {t("manager.tables_qr_tiles", {
                            defaultValue: "Tables and QR tiles",
                          })}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t("manager.tables_qr_tiles_description", {
                            defaultValue:
                              "Create tables and link each one to a QR tile already assigned from Architect.",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await loadManagerTables();
                            if (storeId) await loadQrTiles(storeId);
                          }}
                          disabled={loadingTables || loadingQrTiles}
                          className="inline-flex items-center gap-2"
                        >
                          {loadingTables || loadingQrTiles ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-4 w-4" />
                          )}
                          {t("manager.refresh", { defaultValue: "Refresh" })}
                        </Button>
                        <Button
                          onClick={openCreateTable}
                          className="inline-flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4" /> {t("actions.create_table")}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-border/60 bg-card p-4">
                        <p className="text-xs text-muted-foreground">
                          {t("manager.tables", { defaultValue: "Tables" })}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">{tablesOverview.length}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card p-4">
                        <p className="text-xs text-muted-foreground">
                          {t("manager.linked_qr_tiles", {
                            defaultValue: "Linked QR tiles",
                          })}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {Array.from(assignedQrTileByTableId.keys()).length}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card p-4">
                        <p className="text-xs text-muted-foreground">
                          {t("manager.available_qr_tiles", {
                            defaultValue: "Available QR tiles",
                          })}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {qrTiles.filter((tile) => !tile.tableId).length}
                        </p>
                      </div>
                    </div>
                    {loadingTables || loadingQrTiles ? (
                      <DashboardGridSkeleton
                        count={4}
                        className="grid sm:grid-cols-2"
                      />
                    ) : tablesOverview.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("manager.no_tables", {
                          defaultValue:
                            "No tables yet. Add your first table to get started.",
                        })}
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {tablesOverview.map((table) => {
                          const assignedTile = assignedQrTileByTableId.get(table.id) ?? null;
                          return (
                            <div
                              key={table.id}
                              className={`rounded-xl border border-border/60 bg-card p-4 space-y-3 ${
                                table.isActive ? "" : "opacity-70"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                  <p className="font-semibold text-foreground">
                                    {t("manager.table", { defaultValue: "Table" })} {table.label}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {t("manager.open_orders_count", {
                                      defaultValue: "{{count}} open orders",
                                      count: table.openOrders,
                                    })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {t("manager.qr_tile", {
                                      defaultValue: "QR tile",
                                    })}
                                    :{" "}
                                    <span className="text-foreground">
                                      {assignedTile
                                        ? `${formatQrTileLabel(assignedTile)} (${assignedTile.publicCode})`
                                        : t("manager.not_assigned", {
                                            defaultValue: "Not assigned",
                                          })}
                                    </span>
                                  </p>
                                </div>
                                <Badge
                                  variant={table.isActive ? "secondary" : "outline"}
                                >
                                  {table.isActive
                                    ? t("manager.active", { defaultValue: "Active" })
                                    : t("manager.inactive", { defaultValue: "Inactive" })}
                                </Badge>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full sm:w-auto"
                                  onClick={() => openEditTable(table)}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  {t("actions.edit")}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="w-full sm:w-auto"
                                  onClick={() => handleDeleteTable(table.id)}
                                  disabled={tableDeletingId === table.id}
                                >
                                  {tableDeletingId === table.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 mr-2" />
                                  )}
                                  {t("actions.delete")}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!storeId ? (
                      <p className="text-sm text-muted-foreground">
                        {t("manager.load_store_info_for_qr", {
                          defaultValue:
                            "Load store info first to manage QR tiles.",
                        })}
                      </p>
                    ) : qrTiles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("manager.no_qr_tiles", {
                          defaultValue:
                            "No QR tiles found. Ask your architect to generate and assign tiles to this store first.",
                        })}
                      </p>
                    ) : null}
                  </Card>
                </TabsContent>

                <TabsContent value="menu" className="space-y-6 min-w-0 overflow-x-hidden">
                  {managerMode === "pro" && (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Card className="p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {t("manager.categories", {
                                defaultValue: "Categories",
                              })}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {t("manager.category_performance", {
                                defaultValue: "Category performance",
                              })}
                            </h3>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="inline-flex rounded-md border bg-background overflow-hidden">
                              {(
                                [
                                  {
                                    key: "units",
                                    label: t("manager.units", {
                                      defaultValue: "Units",
                                    }),
                                  },
                                  { key: "share", label: "%" },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.key}
                                  onClick={() => setMenuCategoryMode(opt.key)}
                                  className={
                                    "px-2 py-1 text-xs border-l first:border-l-0 transition-colors " +
                                    (menuCategoryMode === opt.key
                                      ? "bg-primary text-primary-foreground"
                                      : "hover:bg-muted")
                                  }
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            <ProBadge />
                          </div>
                        </div>
                        {categoryUnits.some((entry) => entry.units > 0) ? (
                          <div className="h-64 sm:h-72 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Tooltip
                                    formatter={(
                                      value: ValueType,
                                      _name: NameType,
                                      ctx?: TooltipPayload<ValueType, NameType>
                                    ) => {
                                      const numericValue =
                                        typeof value === "number"
                                          ? value
                                          : Number(value ?? 0);
                                      const label =
                                        typeof ctx?.payload?.name === "string"
                                          ? ctx.payload.name
                                          : "";
                                      return menuCategoryMode === "share"
                                        ? [`${numericValue.toFixed(1)}%`, label]
                                        : [numericValue.toString(), label];
                                    }}
                                  />
                                  {!isMobile ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
                                  <Pie
                                    data={categoryUnits.map((c) => ({
                                      name: c.category,
                                      value:
                                        menuCategoryMode === "share"
                                          ? c.share
                                          : c.units,
                                    }))}
                                    dataKey="value"
                                    nameKey="name"
                                    outerRadius={80}
                                    label={!isMobile}
                                  >
                                    {categoryUnits.map((_, idx) => (
                                      <Cell
                                        key={`slice-${idx}`}
                                        fill={PIE_COLORS[idx % PIE_COLORS.length]}
                                      />
                                    ))}
                                  </Pie>
                                </PieChart>
                              </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            {t("manager.no_menu_sales", {
                              defaultValue: "No menu items sold yet.",
                            })}
                          </p>
                        )}
                      </Card>

                      <Card className="p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {t("manager.service_rhythm", {
                                defaultValue: "Service rhythm",
                              })}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {t("manager.daypart_mix", {
                                defaultValue: "Daypart mix",
                              })}
                            </h3>
                          </div>
                          <ProBadge />
                        </div>
                        {daypartMix.some((entry) => entry.count > 0) ? (
                          <div className="h-64 sm:h-72 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Tooltip
                                    formatter={(
                                      value: ValueType,
                                      _name: NameType,
                                      ctx?: TooltipPayload<ValueType, NameType>
                                    ) => {
                                      const numericValue =
                                        typeof value === "number"
                                          ? value
                                          : Number(value ?? 0);
                                      const label =
                                        typeof ctx?.payload?.name === "string"
                                          ? ctx.payload.name
                                          : "";
                                      return [numericValue.toString(), label];
                                    }}
                                  />
                                  {!isMobile ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
                                  <Pie
                                    data={daypartMix.map((d) => ({
                                      name: formatDaypartLabel(d.daypart),
                                      value: d.count,
                                    }))}
                                    dataKey="value"
                                    nameKey="name"
                                    outerRadius={80}
                                    label={!isMobile}
                                  >
                                    {daypartMix.map((_, idx) => (
                                      <Cell
                                        key={`slice-dp-${idx}`}
                                        fill={PIE_COLORS[idx % PIE_COLORS.length]}
                                      />
                                    ))}
                                  </Pie>
                                </PieChart>
                              </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            {t("manager.no_daypart_data", {
                              defaultValue:
                                "Daypart data will appear once orders are placed.",
                            })}
                          </p>
                        )}
                      </Card>
                    </div>
                  )}

                  {managerMode === "pro" && (
                    <>
                      <Card className="p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {t("manager.interactions", {
                                defaultValue: "Interactions",
                              })}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {t("manager.cannibalization_watch", {
                                defaultValue: "Cannibalization Watch",
                              })}
                            </h3>
                          </div>
                          <ProBadge />
                        </div>
                        {cannibalizationPairs.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-muted-foreground border-b">
                                  <th className="py-2">
                                    {t("manager.category", {
                                      defaultValue: "Category",
                                    })}
                                  </th>
                                  <th className="py-2">
                                    {t("manager.rising", {
                                      defaultValue: "Rising",
                                    })}
                                  </th>
                                  <th className="py-2">
                                    {t("manager.falling", {
                                      defaultValue: "Falling",
                                    })}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {cannibalizationPairs.map((p, i) => (
                                  <tr
                                    key={`${p.category}-${i}`}
                                    className="border-b last:border-b-0"
                                  >
                                    <td className="py-2">{p.category}</td>
                                    <td className="py-2 text-primary">
                                      ↑ {p.a.item} ({p.a.pct.toFixed(0)}%)
                                    </td>
                                    <td className="py-2 text-destructive">
                                      ↓ {p.b.item} (
                                      {Math.abs(p.b.pct).toFixed(0)}%)
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t("manager.no_cannibalization", {
                              defaultValue:
                                "No notable cannibalization detected.",
                            })}
                          </p>
                        )}
                      </Card>

                      <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("manager.fit", { defaultValue: "Fit" })}
                              </p>
                              <h3 className="text-lg font-semibold">
                                {t("manager.daypart_fit", {
                                  defaultValue: "Daypart Fit Score",
                                })}
                              </h3>
                            </div>
                            <ProBadge />
                          </div>
                          {daypartFitRows.length ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs text-muted-foreground border-b">
                                    <th className="py-2">
                                      {t("manager.item", {
                                        defaultValue: "Item",
                                      })}
                                    </th>
                                    <th className="py-2">
                                      {t("manager.top_daypart", {
                                        defaultValue: "Top daypart",
                                      })}
                                    </th>
                                    <th className="py-2">
                                      {t("manager.fit_percent", {
                                        defaultValue: "Fit %",
                                      })}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {daypartFitRows.map((r) => (
                                    <tr
                                      key={r.item}
                                      className="border-b last:border-b-0"
                                    >
                                      <td className="py-2">{r.item}</td>
                                      <td className="py-2">
                                        {formatDaypartLabel(r.top)}
                                      </td>
                                      <td className="py-2">
                                        {r.fit.toFixed(0)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {t("manager.no_fit_data", {
                                defaultValue:
                                  "Not enough data for fit scoring.",
                              })}
                            </p>
                          )}
                        </Card>

                        <Card className="p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("manager.mix", { defaultValue: "Mix" })}
                              </p>
                              <h3 className="text-lg font-semibold">
                                {t("manager.new_vs_regular", {
                                  defaultValue: "New vs Regular",
                                })}
                              </h3>
                            </div>
                            <ProBadge />
                          </div>
                          <div className="flex items-baseline gap-4">
                            <div className="text-3xl font-semibold">
                              {newVsRegularMix.newPct}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("manager.new_items_last7d", {
                                defaultValue: "New items (last 7d)",
                              })}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {t("manager.regular", { defaultValue: "Regular" })}:{" "}
                            {newVsRegularMix.regPct}%
                          </div>
                        </Card>
                      </div>

                      {hasCostData && profitHint && (
                        <Card className="p-4 sm:p-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("manager.profitability", {
                                  defaultValue: "Profitability",
                                })}
                              </p>
                              <h3 className="text-lg font-semibold">
                                {t("manager.profitability_hint", {
                                  defaultValue: "Profitability Hint",
                                })}
                              </h3>
                            </div>
                            <ProBadge />
                          </div>
                          <p className="mt-3 text-sm">
                            {t("manager.promote_item_hint", {
                              defaultValue:
                                "Promote {{item}} — high margin and rising units (+{{pct}}%).",
                              item: profitHint.item,
                              pct: profitHint.deltaPct.toFixed(0),
                            })}
                          </p>
                        </Card>
                      )}
                    </>
                  )}

                  <div id="manager-menu-panel">
                    <ManagerMenuPanel />
                  </div>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>

        <Dialog open={editModalOpen} onOpenChange={closeEditModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {t("manager.edit_waiter", { defaultValue: "Edit waiter" })}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("manager.edit_waiter_description", {
                  defaultValue: "Update waiter details and table assignments.",
                })}
              </DialogDescription>
            </DialogHeader>
            {activeWaiter ? (
              <div className="space-y-6">
                <DialogFormField index={0}>
                  <Label htmlFor="waiter-name">
                    {t("manager.display_name", {
                      defaultValue: "Display name",
                    })}
                  </Label>
                  <Input
                    id="waiter-name"
                    value={activeWaiter.displayName}
                    onChange={(e) =>
                      setActiveWaiter((prev) =>
                        prev ? { ...prev, displayName: e.target.value } : prev
                      )
                    }
                  />
                </DialogFormField>
                <div className="grid gap-2">
                  <Label>
                    {t("manager.assigned_tables", {
                      defaultValue: "Assigned tables",
                    })}
                  </Label>
                  <ScrollArea className="max-h-56 rounded-lg border">
                    <div className="p-3 space-y-2">
                      {tables.map((table) => {
                        const checked = tableSelection.has(table.id);
                        const disabled = !table.active && !checked;
                        return (
                          <label
                            key={table.id}
                            className={`flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm ${
                              disabled ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  handleToggleTable(table.id, Boolean(value))
                                }
                                disabled={disabled}
                              />
                              <span className="font-medium text-foreground">
                                {t("manager.table", { defaultValue: "Table" })}{" "}
                                {table.label}
                              </span>
                            </div>
                            {!table.active ? (
                              <span className="text-xs text-muted-foreground">
                                {t("manager.inactive", {
                                  defaultValue: "Inactive",
                                })}
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => closeEditModal(false)}>
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleSaveWaiter}
                disabled={savingWaiter}
                className="inline-flex items-center gap-2"
              >
                {savingWaiter && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("actions.save_changes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editCookModalOpen} onOpenChange={closeEditCookModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t("manager.edit_cook", { defaultValue: "Edit cook" })}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("manager.edit_cook_description", {
                  defaultValue: "Update cook details and printer assignment.",
                })}
              </DialogDescription>
            </DialogHeader>
            {activeCook ? (
              <div className="space-y-4">
                <DialogFormField index={0}>
                  <Label htmlFor="cook-name">
                    {t("manager.display_name", {
                      defaultValue: "Display name",
                    })}
                  </Label>
                  <Input
                    id="cook-name"
                    value={activeCook.displayName}
                    onChange={(e) =>
                      setActiveCook((prev) =>
                        prev ? { ...prev, displayName: e.target.value } : prev
                      )
                    }
                  />
                </DialogFormField>
                <DialogFormField index={1}>
                  <Label>{t("manager.printer_label", { defaultValue: "Printer" })}</Label>
                  <Select
                    value={resolvePrinterValue(activeCook.printerTopic, printerTopics)}
                    onValueChange={(value) =>
                      setActiveCook((prev) =>
                        prev
                          ? {
                              ...prev,
                              printerTopic:
                                value === NO_PRINTER_VALUE ? null : value,
                            }
                          : prev
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("manager.select_printer", {
                          defaultValue: "Select printer",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PRINTER_VALUE}>
                        {t("manager.no_printer", { defaultValue: "No printer" })}
                      </SelectItem>
                      {buildPrinterOptions(printerTopics).map((topic) => (
                        <SelectItem key={topic} value={topic}>
                          {topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DialogFormField>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => closeEditCookModal(false)}>
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleSaveCook}
                disabled={savingCook}
                className="inline-flex items-center gap-2"
              >
                {savingCook && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("actions.save_changes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={hybridModalOpen} onOpenChange={closeHybridModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {t("manager.hybrid_options", { defaultValue: "Hybrid options" })}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("manager.hybrid_options_description", {
                  defaultValue:
                    "Update hybrid staff display name, printer, and table assignments.",
                })}
              </DialogDescription>
            </DialogHeader>
            {activeHybrid ? (
              <div className="space-y-6">
                <DialogFormField index={0}>
                  <Label htmlFor="hybrid-name">
                    {t("manager.display_name", {
                      defaultValue: "Display name",
                    })}
                  </Label>
                  <Input
                    id="hybrid-name"
                    value={activeHybrid.displayName}
                    onChange={(e) =>
                      setActiveHybrid((prev) =>
                        prev ? { ...prev, displayName: e.target.value } : prev
                      )
                    }
                  />
                </DialogFormField>
                <DialogFormField index={1}>
                  <Label>{t("manager.printer_label", { defaultValue: "Printer" })}</Label>
                  <Select
                    value={resolvePrinterValue(activeHybrid.printerTopic, printerTopics)}
                    onValueChange={(value) =>
                      setActiveHybrid((prev) =>
                        prev
                          ? {
                              ...prev,
                              printerTopic:
                                value === NO_PRINTER_VALUE ? null : value,
                            }
                          : prev
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("manager.select_printer", {
                          defaultValue: "Select printer",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PRINTER_VALUE}>
                        {t("manager.no_printer", { defaultValue: "No printer" })}
                      </SelectItem>
                      {buildPrinterOptions(printerTopics).map((topic) => (
                        <SelectItem key={topic} value={topic}>
                          {topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DialogFormField>
                <div className="grid gap-2">
                  <Label>
                    {t("manager.assigned_tables", {
                      defaultValue: "Assigned tables",
                    })}
                  </Label>
                  <ScrollArea className="max-h-56 rounded-lg border">
                    <div className="p-3 space-y-2">
                      {tables.map((table) => {
                        const checked = tableSelection.has(table.id);
                        const disabled = !table.active && !checked;
                        return (
                          <label
                            key={table.id}
                            className={`flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm ${
                              disabled ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  handleToggleTable(table.id, Boolean(value))
                                }
                                disabled={disabled}
                              />
                              <span className="font-medium text-foreground">
                                {t("manager.table", { defaultValue: "Table" })}{" "}
                                {table.label}
                              </span>
                            </div>
                            {!table.active ? (
                              <span className="text-xs text-muted-foreground">
                                {t("manager.inactive", {
                                  defaultValue: "Inactive",
                                })}
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => closeHybridModal(false)}>
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleSaveHybrid}
                disabled={savingHybrid}
                className="inline-flex items-center gap-2"
              >
                {savingHybrid && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("actions.save_changes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={addModalOpen}
          onOpenChange={(open) => {
            setAddModalOpen(open);
            if (!open) {
              setNewWaiter({
                email: "",
                displayName: "",
                password: "",
                printerTopic: null,
                hybrid: false,
              });
              setNewWaiterTableSelection(new Set());
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {newWaiter.hybrid
                  ? t("manager.create_hybrid_personnel", {
                      defaultValue: "Create hybrid",
                    })
                  : t("actions.add_waiter")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {newWaiter.hybrid
                  ? t("manager.create_hybrid_description", {
                      defaultValue:
                        "Create a hybrid staff member with printer and table assignments.",
                    })
                  : t("manager.create_waiter_description", {
                      defaultValue:
                        "Create a waiter and assign tables.",
                    })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <DialogFormField index={0}>
                <Label htmlFor="new-waiter-email">
                  {t("auth.email", { defaultValue: "Email" })}
                </Label>
                <Input
                  id="new-waiter-email"
                  type="email"
                  value={newWaiter.email}
                  onChange={(e) =>
                    setNewWaiter((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </DialogFormField>
              <DialogFormField index={1}>
                <Label htmlFor="new-waiter-name">
                  {t("manager.display_name", { defaultValue: "Display name" })}
                </Label>
                <Input
                  id="new-waiter-name"
                  value={newWaiter.displayName}
                  onChange={(e) =>
                    setNewWaiter((prev) => ({
                      ...prev,
                      displayName: e.target.value,
                    }))
                  }
                />
              </DialogFormField>
              {newWaiter.hybrid && (
                <DialogFormField index={2}>
                  <Label>{t("manager.printer_label", { defaultValue: "Printer" })}</Label>
                  <Select
                    value={resolvePrinterValue(newWaiter.printerTopic, printerTopics)}
                    onValueChange={(value) =>
                      setNewWaiter((prev) => ({
                        ...prev,
                        printerTopic: value === NO_PRINTER_VALUE ? null : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("manager.select_printer", {
                          defaultValue: "Select printer",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PRINTER_VALUE}>
                        {t("manager.no_printer", { defaultValue: "No printer" })}
                      </SelectItem>
                      {buildPrinterOptions(printerTopics).map((topic) => (
                        <SelectItem key={topic} value={topic}>
                          {topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DialogFormField>
              )}
              <DialogFormField index={newWaiter.hybrid ? 3 : 2}>
                <Label>
                  {t("manager.assigned_tables", {
                    defaultValue: "Assigned tables",
                  })}
                </Label>
                <ScrollArea className="max-h-44 rounded-lg border">
                  <div className="p-3 space-y-2">
                    {tables.map((table) => {
                      const checked = newWaiterTableSelection.has(table.id);
                      const disabled = !table.active && !checked;
                      return (
                        <label
                          key={table.id}
                          className={`flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm ${
                            disabled ? "opacity-60 cursor-not-allowed" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                handleToggleNewWaiterTable(table.id, Boolean(value))
                              }
                              disabled={disabled}
                            />
                            <span className="font-medium text-foreground">
                              {t("manager.table", { defaultValue: "Table" })}{" "}
                              {table.label}
                            </span>
                          </div>
                          {!table.active ? (
                            <span className="text-xs text-muted-foreground">
                              {t("manager.inactive", {
                                defaultValue: "Inactive",
                              })}
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>
              </DialogFormField>
              <DialogFormField index={newWaiter.hybrid ? 4 : 3}>
                <Label htmlFor="new-waiter-password">
                  {t("auth.password", { defaultValue: "Password" })}
                </Label>
                <Input
                  id="new-waiter-password"
                  type="password"
                  value={newWaiter.password}
                  onChange={(e) =>
                    setNewWaiter((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                />
              </DialogFormField>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleCreateWaiter}
                disabled={
                  addingWaiter || !newWaiter.email || !newWaiter.password
                }
                className="inline-flex items-center gap-2"
              >
                {addingWaiter && <Loader2 className="h-4 w-4 animate-spin" />}
                {newWaiter.hybrid
                  ? t("manager.create_hybrid_personnel", {
                      defaultValue: "Create hybrid",
                    })
                  : t("actions.create_waiter")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={addCookModalOpen}
          onOpenChange={(open) => {
            setAddCookModalOpen(open);
            if (!open) {
              setNewCook({
                email: "",
                displayName: "",
                password: "",
                printerTopic: null,
              });
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t("manager.add_cook", { defaultValue: "Add cook" })}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("manager.create_cook_description", {
                  defaultValue: "Create a cook and assign a printer.",
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <DialogFormField index={0}>
                <Label htmlFor="new-cook-email">
                  {t("auth.email", { defaultValue: "Email" })}
                </Label>
                <Input
                  id="new-cook-email"
                  type="email"
                  value={newCook.email}
                  onChange={(e) =>
                    setNewCook((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </DialogFormField>
              <DialogFormField index={1}>
                <Label htmlFor="new-cook-name">
                  {t("manager.display_name", {
                    defaultValue: "Display name",
                  })}
                </Label>
                <Input
                  id="new-cook-name"
                  value={newCook.displayName}
                  onChange={(e) =>
                    setNewCook((prev) => ({
                      ...prev,
                      displayName: e.target.value,
                    }))
                  }
                />
              </DialogFormField>
              <DialogFormField index={2}>
                <Label>{t("manager.printer_label", { defaultValue: "Printer" })}</Label>
                <Select
                  value={resolvePrinterValue(newCook.printerTopic, printerTopics)}
                  onValueChange={(value) =>
                    setNewCook((prev) => ({
                      ...prev,
                      printerTopic: value === NO_PRINTER_VALUE ? null : value,
                    }))
                  }
                  >
                    <SelectTrigger>
                    <SelectValue
                      placeholder={t("manager.select_printer", {
                        defaultValue: "Select printer",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRINTER_VALUE}>
                      {t("manager.no_printer", { defaultValue: "No printer" })}
                    </SelectItem>
                    {buildPrinterOptions(printerTopics).map((topic) => (
                      <SelectItem key={topic} value={topic}>
                        {topic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DialogFormField>
              <DialogFormField index={3}>
                <Label htmlFor="new-cook-password">
                  {t("auth.password", { defaultValue: "Password" })}
                </Label>
                <Input
                  id="new-cook-password"
                  type="password"
                  value={newCook.password}
                  onChange={(e) =>
                    setNewCook((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                />
              </DialogFormField>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddCookModalOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleCreateCook}
                disabled={addingCook || !newCook.email || !newCook.password}
                className="inline-flex items-center gap-2"
              >
                {addingCook && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("manager.create_cook", { defaultValue: "Create cook" })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={tableModalOpen}
          onOpenChange={(open) => {
            setTableModalOpen(open);
            if (!open) {
              setTableForm({
                id: undefined,
                label: "",
                isActive: true,
                qrTileId: "unassigned",
              });
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {tableForm.id
                  ? t("manager.edit_table", { defaultValue: "Edit table" })
                  : t("actions.add_table")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("manager.table_dialog_description", {
                  defaultValue: "Create or edit a table and its QR tile.",
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="table-label">
                  {t("manager.label", { defaultValue: "Label" })}
                </Label>
                <Input
                  id="table-label"
                  value={tableForm.label}
                  onChange={(e) =>
                    setTableForm((prev) => ({ ...prev, label: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("manager.qr_tile", { defaultValue: "QR tile" })}</Label>
                <Select
                  value={tableForm.qrTileId}
                  onValueChange={(value) =>
                    setTableForm((prev) => ({ ...prev, qrTileId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("manager.select_qr_tile", {
                        defaultValue: "Select QR tile",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
                      {t("manager.no_qr_tile", { defaultValue: "No QR tile" })}
                    </SelectItem>
                    {tableQrTileOptions.map((tile) => (
                      <SelectItem key={tile.id} value={tile.id}>
                        {formatQrTileLabel(tile)} ({tile.publicCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("manager.qr_tile_picker_hint", {
                    defaultValue:
                      "Pick from the QR tiles assigned to this store in Architect.",
                  })}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("manager.active", { defaultValue: "Active" })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("manager.inactive_tables_hint", {
                      defaultValue:
                        "Inactive tables stay hidden from the customer menu and waiter assignments.",
                    })}
                  </p>
                </div>
                <Switch
                  checked={tableForm.isActive}
                  onCheckedChange={(value) =>
                    setTableForm((prev) => ({
                      ...prev,
                      isActive: Boolean(value),
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTableModalOpen(false)}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleSaveTable}
                disabled={savingTable || tableForm.label.trim().length === 0}
                className="inline-flex items-center gap-2"
              >
                {savingTable && <Loader2 className="h-4 w-4 animate-spin" />}
                {tableForm.id
                  ? t("actions.save_changes")
                  : t("actions.create_table")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
