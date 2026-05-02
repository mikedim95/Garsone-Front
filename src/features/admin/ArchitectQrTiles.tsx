import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Check,
  Copy,
  Grid3X3,
  Link as LinkIcon,
  Loader2,
  Plus,
  Printer,
  QrCode,
  RefreshCcw,
  Search,
  Settings,
  Trash2,
} from "lucide-react";

import { DashboardHeader } from "@/components/DashboardHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DashboardGridSkeleton } from "@/components/ui/dashboard-skeletons";
import { useToast } from "@/components/ui/use-toast";
import { PageTransition } from "@/components/ui/page-transition";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type {
  ManagerTableSummary,
  OrderingMode,
  QRTile,
  StoreInfo,
  StoreOverview,
} from "@/types";

type StoreOption = Pick<
  StoreInfo,
  "id" | "name" | "slug" | "orderingMode" | "printers"
>;
type ActiveTab = "pool" | "tiles" | "settings" | "overview";
type GenerateScope = "pool" | "store";
type TileLifecycle = "inactive" | "unbound" | "venue" | "live";
type PoolStatusFilter = "all" | TileLifecycle;

const MAX_GENERATE_COUNT = 500;
const UNBOUND_STORE_VALUE = "__unbound__";
const UNASSIGNED_TABLE_VALUE = "__unassigned__";

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildSparkline = (store: StoreOverview, points = 12) => {
  const base =
    store.usersCount * 0.6 + store.tilesCount * 0.25 + store.ordersCount * 0.15;
  const seed = (store.slug ?? store.id).length + base;
  return Array.from({ length: points }, (_, index) => {
    const wave =
      Math.sin((index / Math.max(1, points - 1)) * Math.PI * 2 + seed) * 0.35 +
      0.6;
    const ramp = (index / Math.max(1, points - 1)) * 0.15;
    const intensity = Math.min(1, base / 200 + 0.35);
    return Math.max(0.08, Math.min(0.95, (wave + ramp) * intensity));
  });
};

const sparklinePath = (
  values: number[],
  width = 320,
  height = 80,
  padding = 6
) => {
  if (!values.length) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(1, values.length - 1);

  return values
    .map((value, index) => {
      const x = padding + index * step;
      const y =
        padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

const getTileLifecycle = (tile: QRTile): TileLifecycle => {
  if (!tile.isActive) return "inactive";
  if (!tile.storeId) return "unbound";
  if (!tile.tableId) return "venue";
  return "live";
};

const lifecycleCopy: Record<
  TileLifecycle,
  { label: string; variant: "outline" | "warning" | "info" | "success" }
> = {
  inactive: { label: "Inactive", variant: "outline" },
  unbound: { label: "URL only", variant: "warning" },
  venue: { label: "Venue linked", variant: "info" },
  live: { label: "Live on table", variant: "success" },
};

function TileLifecycleBadge({ tile }: { tile: QRTile }) {
  const lifecycle = getTileLifecycle(tile);
  const meta = lifecycleCopy[lifecycle];
  return (
    <Badge variant={meta.variant} className="whitespace-nowrap">
      {meta.label}
    </Badge>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <Card interactive={false} className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function RecentTilesCard({
  tiles,
  title,
  onCopyCode,
  onCopyExport,
}: {
  tiles: QRTile[];
  title: string;
  onCopyCode: (code: string) => Promise<void>;
  onCopyExport: (mode: "codes" | "csv") => Promise<void>;
}) {
  if (!tiles.length) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant="secondary" size="sm">
              {tiles.length} new
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onCopyExport("codes")}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Codes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onCopyExport("csv")}
            >
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-28">
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => void onCopyCode(tile.publicCode)}
                className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm font-mono transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                {tile.publicCode}
              </button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default function ArchitectQrTiles() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuthStore();

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("pool");
  const [poolTiles, setPoolTiles] = useState<QRTile[]>([]);
  const [storeTiles, setStoreTiles] = useState<QRTile[]>([]);
  const [overview, setOverview] = useState<StoreOverview[]>([]);
  const [tablesByStoreId, setTablesByStoreId] = useState<
    Record<string, ManagerTableSummary[]>
  >({});
  const [recentTiles, setRecentTiles] = useState<QRTile[]>([]);
  const [recentScope, setRecentScope] = useState<GenerateScope | null>(null);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingPoolTiles, setLoadingPoolTiles] = useState(false);
  const [loadingStoreTiles, setLoadingStoreTiles] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generateScope, setGenerateScope] = useState<GenerateScope>("pool");
  const [generateCount, setGenerateCount] = useState<number>(20);
  const [updatingTileId, setUpdatingTileId] = useState<string | null>(null);
  const [deletingTileId, setDeletingTileId] = useState<string | null>(null);
  const [updatingMode, setUpdatingMode] = useState(false);
  const [savingPrinters, setSavingPrinters] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [poolSearch, setPoolSearch] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [poolStatusFilter, setPoolStatusFilter] =
    useState<PoolStatusFilter>("all");
  const [previewQr, setPreviewQr] = useState<{
    code: string;
    url: string;
  } | null>(null);
  const [publicResolverBase, setPublicResolverBase] = useState("");
  const [storeOrderingMode, setStoreOrderingMode] =
    useState<OrderingMode>("qr");
  const [printers, setPrinters] = useState<string[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  const isArchitect = user?.role === "architect";
  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? null,
    [selectedStoreId, stores]
  );
  const selectedStoreTables = useMemo(
    () => tablesByStoreId[selectedStoreId] ?? [],
    [selectedStoreId, tablesByStoreId]
  );

  const canGenerate =
    Number.isFinite(generateCount) &&
    Math.trunc(generateCount) >= 1 &&
    Math.trunc(generateCount) <= MAX_GENERATE_COUNT;

  useEffect(() => {
    if (!isAuthenticated() || !isArchitect) {
      navigate("/login");
    }
  }, [isArchitect, isAuthenticated, navigate]);

  const setCopied = useCallback((value: string) => {
    setCopiedKey(value);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === value ? null : current));
    }, 1200);
  }, []);

  const buildPublicUrl = useCallback(
    (code: string) => {
      const fallback = "https://www.garsone.gr/q";
      const base = (publicResolverBase || fallback).replace(/\/$/, "");
      return `${base}/${code}`;
    },
    [publicResolverBase]
  );

  const copyText = useCallback(
    async (text: string) => {
      try {
        if (
          typeof navigator === "undefined" ||
          !navigator.clipboard ||
          typeof navigator.clipboard.writeText !== "function"
        ) {
          throw new Error("Clipboard unavailable");
        }
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.error("Clipboard copy failed", error);
        toast({
          variant: "destructive",
          title: "Copy failed",
          description: "Clipboard is unavailable in this browser.",
        });
        return false;
      }
    },
    [toast]
  );

  const copyTileCode = useCallback(
    async (code: string) => {
      const ok = await copyText(code);
      if (ok) setCopied(code);
    },
    [copyText, setCopied]
  );

  const copyTileUrl = useCallback(
    async (code: string) => {
      const url = buildPublicUrl(code);
      const ok = await copyText(url);
      if (ok) setCopied(`url:${code}`);
    },
    [buildPublicUrl, copyText, setCopied]
  );

  const copyRecentExport = useCallback(
    async (mode: "codes" | "csv") => {
      if (!recentTiles.length) return;
      const text =
        mode === "csv"
          ? [
              "publicCode,label,storeName,tableLabel",
              ...recentTiles.map((tile) =>
                [
                  tile.publicCode,
                  JSON.stringify(tile.label ?? ""),
                  JSON.stringify(tile.storeName ?? ""),
                  JSON.stringify(tile.tableLabel ?? ""),
                ].join(",")
              ),
            ].join("\n")
          : recentTiles
              .map((tile) =>
                [tile.publicCode, tile.label || "", tile.tableLabel || ""]
                  .filter(Boolean)
                  .join(" — ")
              )
              .join("\n");

      const ok = await copyText(text);
      if (ok) {
        toast({
          title: mode === "csv" ? "CSV copied" : "Codes copied",
        });
      }
    },
    [copyText, recentTiles, toast]
  );

  const mergeTiles = useCallback((existing: QRTile[], incoming: QRTile[]) => {
    const incomingIds = new Set(incoming.map((tile) => tile.id));
    return [...incoming, ...existing.filter((tile) => !incomingIds.has(tile.id))];
  }, []);

  const syncTile = useCallback(
    (tile: QRTile) => {
      setPoolTiles((current) => {
        const exists = current.some((entry) => entry.id === tile.id);
        return exists
          ? current.map((entry) => (entry.id === tile.id ? tile : entry))
          : [tile, ...current];
      });

      setStoreTiles((current) => {
        const exists = current.some((entry) => entry.id === tile.id);
        if (tile.storeId === selectedStoreId) {
          return exists
            ? current.map((entry) => (entry.id === tile.id ? tile : entry))
            : [tile, ...current];
        }
        return exists
          ? current.filter((entry) => entry.id !== tile.id)
          : current;
      });

      setLabelDrafts((current) => ({
        ...current,
        [tile.id]: tile.label ?? "",
      }));
    },
    [selectedStoreId]
  );

  const removeTileLocally = useCallback((tileId: string) => {
    setPoolTiles((current) => current.filter((tile) => tile.id !== tileId));
    setStoreTiles((current) => current.filter((tile) => tile.id !== tileId));
    setRecentTiles((current) => current.filter((tile) => tile.id !== tileId));
    setLabelDrafts((current) => {
      const next = { ...current };
      delete next[tileId];
      return next;
    });
  }, []);

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const res = await api.adminListStores();
      const list = res.stores ?? [];
      setStores(list);
      setSelectedStoreId((current) => {
        if (current && list.some((store) => store.id === current)) return current;
        return list[0]?.id ?? "";
      });
      return list;
    } catch (error) {
      console.error("Failed to load stores", error);
      toast({
        variant: "destructive",
        title: "Unable to load venues",
        description:
          error instanceof ApiError
            ? error.message
            : "Check your connection and try again.",
      });
      return [] as StoreOption[];
    } finally {
      setLoadingStores(false);
    }
  }, [toast]);

  const loadTablesForStores = useCallback(async (storeList: StoreOption[]) => {
    if (!storeList.length) return;
    const results = await Promise.allSettled(
      storeList.map(async (store) => ({
        storeId: store.id,
        tables: (await api.adminListStoreTables(store.id)).tables ?? [],
      }))
    );

    setTablesByStoreId((current) => {
      const next = { ...current };
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          next[result.value.storeId] = result.value.tables;
        }
      });
      return next;
    });
  }, []);

  const refreshPoolTiles = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshing(true);
      setLoadingPoolTiles(true);
      try {
        const res = await api.adminListAllQrTiles();
        const tiles = res.tiles ?? [];
        setPoolTiles(tiles);
        setLabelDrafts((current) => {
          const next = { ...current };
          tiles.forEach((tile) => {
            if (typeof next[tile.id] === "undefined") {
              next[tile.id] = tile.label ?? "";
            }
          });
          return next;
        });
      } catch (error) {
        console.error("Failed to load QR tile pool", error);
        toast({
          variant: "destructive",
          title: "Failed to load URL pool",
          description:
            error instanceof ApiError ? error.message : "Please try again.",
        });
      } finally {
        setLoadingPoolTiles(false);
        if (showSpinner) setRefreshing(false);
      }
    },
    [toast]
  );

  const refreshStoreTiles = useCallback(
    async (storeId: string, showSpinner = false) => {
      if (!storeId) return;
      if (showSpinner) setRefreshing(true);
      setLoadingStoreTiles(true);
      try {
        const [tilesRes, tablesRes] = await Promise.all([
          api.adminListQrTiles(storeId),
          api.adminListStoreTables(storeId),
        ]);
        const tiles = tilesRes.tiles ?? [];
        setStoreTiles(tiles);
        setTablesByStoreId((current) => ({
          ...current,
          [storeId]: tablesRes.tables ?? [],
        }));
        setLabelDrafts((current) => {
          const next = { ...current };
          tiles.forEach((tile) => {
            if (typeof next[tile.id] === "undefined") {
              next[tile.id] = tile.label ?? "";
            }
          });
          return next;
        });
      } catch (error) {
        console.error("Failed to load store QR tiles", error);
        toast({
          variant: "destructive",
          title: "Failed to load venue tiles",
          description:
            error instanceof ApiError ? error.message : "Please try again.",
        });
      } finally {
        setLoadingStoreTiles(false);
        if (showSpinner) setRefreshing(false);
      }
    },
    [toast]
  );

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await api.adminListStoreOverview();
      setOverview(res.stores ?? []);
    } catch (error) {
      console.error("Failed to load overview", error);
      toast({
        variant: "destructive",
        title: "Failed to load overview",
        description:
          error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setLoadingOverview(false);
    }
  }, [toast]);

  useEffect(() => {
    const baseEnv = (import.meta.env.VITE_PUBLIC_CODE_BASE as string | undefined)?.trim();
    if (baseEnv) {
      setPublicResolverBase(baseEnv.replace(/\/$/, ""));
      return;
    }
    if (typeof window !== "undefined") {
      setPublicResolverBase(`${window.location.origin.replace(/\/$/, "")}/q`);
      return;
    }
    setPublicResolverBase("https://www.garsone.gr/q");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const storeList = await loadStores();
      if (cancelled) return;
      await Promise.all([loadTablesForStores(storeList), refreshPoolTiles()]);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadStores, loadTablesForStores, refreshPoolTiles]);

  useEffect(() => {
    if (!selectedStore) return;
    setStoreOrderingMode(selectedStore.orderingMode ?? "qr");
    setPrinters(selectedStore.printers ?? []);
  }, [selectedStore]);

  useEffect(() => {
    if (activeTab === "overview") {
      void loadOverview();
      return;
    }
    if (activeTab === "tiles" && selectedStoreId) {
      void refreshStoreTiles(selectedStoreId);
    }
  }, [activeTab, loadOverview, refreshStoreTiles, selectedStoreId]);

  const handleUpdateTile = useCallback(
    async (tileId: string, payload: Partial<QRTile>) => {
      try {
        setUpdatingTileId(tileId);
        const res = await api.adminUpdateQrTile(tileId, {
          storeId:
            Object.prototype.hasOwnProperty.call(payload, "storeId")
              ? payload.storeId ?? null
              : undefined,
          tableId:
            Object.prototype.hasOwnProperty.call(payload, "tableId")
              ? payload.tableId ?? null
              : undefined,
          isActive: payload.isActive,
          label:
            Object.prototype.hasOwnProperty.call(payload, "label")
              ? payload.label ?? null
              : undefined,
        });
        syncTile(res.tile);
      } catch (error) {
        console.error("Failed to update QR tile", error);
        toast({
          variant: "destructive",
          title: "Update failed",
          description:
            error instanceof ApiError
              ? error.message
              : "Could not update this URL.",
        });
      } finally {
        setUpdatingTileId(null);
      }
    },
    [syncTile, toast]
  );

  const handleDeleteTile = useCallback(
    async (tileId: string) => {
      try {
        setDeletingTileId(tileId);
        await api.adminDeleteQrTile(tileId);
        removeTileLocally(tileId);
        toast({ title: "Tile deleted" });
      } catch (error) {
        console.error("Failed to delete QR tile", error);
        toast({
          variant: "destructive",
          title: "Delete failed",
          description:
            error instanceof ApiError ? error.message : "Please try again.",
        });
      } finally {
        setDeletingTileId(null);
      }
    },
    [removeTileLocally, toast]
  );

  const commitLabel = useCallback(
    async (tile: QRTile) => {
      const next = (labelDrafts[tile.id] ?? tile.label ?? "").trim();
      const current = (tile.label ?? "").trim();
      if (next === current) return;
      await handleUpdateTile(tile.id, { label: next || null });
    },
    [handleUpdateTile, labelDrafts]
  );

  const handleBulkCreate = useCallback(async () => {
    const count = Math.trunc(generateCount);
    if (!Number.isFinite(count) || count < 1 || count > MAX_GENERATE_COUNT) {
      toast({
        variant: "destructive",
        title: "Invalid count",
        description: `Choose a number between 1 and ${MAX_GENERATE_COUNT}.`,
      });
      return;
    }

    try {
      const res =
        generateScope === "pool"
          ? await api.adminGenerateGlobalQrTiles({ count })
          : await api.adminGenerateQrTiles(selectedStoreId, { count });
      const created = res.tiles ?? [];

      setDialogOpen(false);
      setGenerateCount(generateScope === "pool" ? 20 : 10);
      setRecentScope(generateScope);
      setRecentTiles(created);
      setPoolTiles((current) => mergeTiles(current, created));
      if (generateScope === "store") {
        setStoreTiles((current) => mergeTiles(current, created));
      }
      setLabelDrafts((current) => {
        const next = { ...current };
        created.forEach((tile) => {
          next[tile.id] = tile.label ?? "";
        });
        return next;
      });

      toast({
        title:
          generateScope === "pool"
            ? "URL pool extended"
            : "Venue URLs generated",
        description: `${created.length} tile${created.length === 1 ? "" : "s"} ready.`,
      });
    } catch (error) {
      console.error("Failed to generate QR tiles", error);
      toast({
        variant: "destructive",
        title: "Generation failed",
        description:
          error instanceof ApiError ? error.message : "Please try again.",
      });
    }
  }, [
    generateCount,
    generateScope,
    mergeTiles,
    selectedStoreId,
    toast,
  ]);

  const handleModeChange = useCallback(
    (value: string) => {
      if (!selectedStoreId) return;
      const next = value as OrderingMode;
      setUpdatingMode(true);
      api
        .adminUpdateStoreOrderingMode(selectedStoreId, next)
        .then(() => {
          setStoreOrderingMode(next);
          setStores((current) =>
            current.map((store) =>
              store.id === selectedStoreId
                ? { ...store, orderingMode: next }
                : store
            )
          );
          toast({
            title: "Venue mode updated",
            description:
              next === "waiter"
                ? "Guests browse while staff submits orders."
                : next === "hybrid"
                ? "Guests and staff can both drive ordering."
                : "Guests can order directly from the table flow.",
          });
        })
        .catch((error) => {
          console.error("Failed to update ordering mode", error);
          toast({
            variant: "destructive",
            title: "Mode update failed",
            description:
              error instanceof ApiError ? error.message : "Please try again.",
          });
        })
        .finally(() => setUpdatingMode(false));
    },
    [selectedStoreId, toast]
  );

  const handleSavePrinters = useCallback(async () => {
    if (!selectedStoreId) return;
    setSavingPrinters(true);
    try {
      const cleaned = Array.from(
        new Set(printers.map((printer) => printer.trim()).filter(Boolean))
      );
      const res = await api.adminUpdateStorePrinters(selectedStoreId, cleaned);
      const nextPrinters = res.store.printers ?? [];
      setPrinters(nextPrinters);
      setStores((current) =>
        current.map((store) =>
          store.id === selectedStoreId
            ? { ...store, printers: nextPrinters }
            : store
        )
      );
      toast({
        title: "Printers saved",
        description: "Venue printer topics are up to date.",
      });
    } catch (error) {
      console.error("Failed to save printers", error);
      toast({
        variant: "destructive",
        title: "Save failed",
        description:
          error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setSavingPrinters(false);
    }
  }, [printers, selectedStoreId, toast]);

  const handleRefresh = useCallback(() => {
    if (activeTab === "overview") {
      void loadOverview();
      return;
    }
    if (activeTab === "tiles" && selectedStoreId) {
      void refreshStoreTiles(selectedStoreId, true);
      return;
    }
    void refreshPoolTiles(true);
  }, [activeTab, loadOverview, refreshPoolTiles, refreshStoreTiles, selectedStoreId]);

  const poolStats = useMemo(() => {
    return poolTiles.reduce(
      (acc, tile) => {
        acc.total += 1;
        acc[getTileLifecycle(tile)] += 1;
        return acc;
      },
      {
        total: 0,
        inactive: 0,
        unbound: 0,
        venue: 0,
        live: 0,
      }
    );
  }, [poolTiles]);

  const selectedStoreStats = useMemo(() => {
    return storeTiles.reduce(
      (acc, tile) => {
        acc.total += 1;
        if (!tile.isActive) acc.inactive += 1;
        if (tile.isActive && !tile.tableId) acc.unassigned += 1;
        if (tile.isActive && tile.tableId) acc.live += 1;
        return acc;
      },
      {
        total: 0,
        inactive: 0,
        unassigned: 0,
        live: 0,
      }
    );
  }, [storeTiles]);

  const filteredPoolTiles = useMemo(() => {
    const term = poolSearch.trim().toLowerCase();
    return poolTiles.filter((tile) => {
      if (poolStatusFilter !== "all" && getTileLifecycle(tile) !== poolStatusFilter) {
        return false;
      }
      if (!term) return true;
      return [
        tile.publicCode,
        tile.label,
        tile.storeName,
        tile.storeSlug,
        tile.tableLabel,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [poolSearch, poolStatusFilter, poolTiles]);

  const filteredStoreTiles = useMemo(() => {
    const term = storeSearch.trim().toLowerCase();
    if (!term) return storeTiles;
    return storeTiles.filter((tile) =>
      [tile.publicCode, tile.label, tile.tableLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [storeSearch, storeTiles]);

  const overviewTotals = useMemo(() => {
    return overview.reduce(
      (acc, store) => {
        acc.stores += 1;
        acc.users += store.usersCount;
        acc.tiles += store.tilesCount;
        acc.orders += store.ordersCount;
        return acc;
      },
      { stores: 0, users: 0, tiles: 0, orders: 0 }
    );
  }, [overview]);

  const headerSubtitle =
    activeTab === "overview"
      ? "Cross-venue usage, staffing and QR footprint."
      : activeTab === "pool"
      ? "Generate URLs centrally, then bind them to venues and tables."
      : selectedStore
      ? `Managing ${selectedStore.name}`
      : "Select a venue to continue.";

  const openGenerateDialog = (scope: GenerateScope) => {
    if (scope === "store" && !selectedStoreId) {
      toast({
        variant: "destructive",
        title: "No venue selected",
        description: "Pick a venue before generating venue-specific URLs.",
      });
      return;
    }
    setGenerateScope(scope);
    setGenerateCount(scope === "pool" ? 20 : 10);
    setDialogOpen(true);
  };

  return (
    <PageTransition className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        supertitle="Architect"
        title="QR Architect"
        subtitle={headerSubtitle}
        icon="QR"
        tone="secondary"
        rightContent={
          <Select
            value={selectedStoreId || undefined}
            onValueChange={setSelectedStoreId}
            disabled={loadingStores || stores.length === 0}
          >
            <SelectTrigger className="h-9 w-52 bg-card/80">
              <SelectValue placeholder="Select venue" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        burgerActions={
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleRefresh}
              disabled={refreshing || loadingOverview}
            >
              {refreshing || loadingOverview ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                openGenerateDialog(activeTab === "tiles" ? "store" : "pool")
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {activeTab === "tiles" ? "Generate for venue" : "Grow URL pool"}
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ActiveTab)}
          className="space-y-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="w-full justify-start lg:w-auto">
              <TabsTrigger value="pool" className="gap-2">
                <QrCode className="h-4 w-4" />
                URL Pool
              </TabsTrigger>
              <TabsTrigger
                value="tiles"
                className="gap-2"
                disabled={!selectedStoreId}
              >
                <Grid3X3 className="h-4 w-4" />
                Venue Tiles
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="gap-2"
                disabled={!selectedStoreId}
              >
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="overview" className="gap-2">
                <Building2 className="h-4 w-4" />
                Overview
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing || loadingOverview}
              >
                {refreshing || loadingOverview ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  openGenerateDialog(activeTab === "tiles" ? "store" : "pool")
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {activeTab === "tiles" ? "Generate for venue" : "Generate URLs"}
              </Button>
            </div>
          </div>

          <TabsContent value="pool" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Total URLs"
                value={poolStats.total}
                description="Everything in the central pool."
              />
              <MetricCard
                title="Unbound"
                value={poolStats.unbound}
                description="No venue attached yet."
              />
              <MetricCard
                title="Venue Linked"
                value={poolStats.venue}
                description="Ready for table binding."
              />
              <MetricCard
                title="Live on Table"
                value={poolStats.live}
                description="Fully bound and active."
              />
            </div>

            <Card interactive={false} className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Binding flow</CardTitle>
                <CardDescription>
                  URLs now live in a central pool. Generate once, bind to a venue
                  later, and only attach a table when the physical placement is
                  known.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Badge variant="warning">1. URL only</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create a public code with no venue or table assignment.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Badge variant="info">2. Venue linked</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Attach the code to a venue when inventory is allocated.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Badge variant="success">3. Live on table</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Bind the final table when the QR is physically placed.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search code, alias, venue or table..."
                    value={poolSearch}
                    onChange={(event) => setPoolSearch(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={poolStatusFilter}
                  onValueChange={(value) =>
                    setPoolStatusFilter(value as PoolStatusFilter)
                  }
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="unbound">URL only</SelectItem>
                    <SelectItem value="venue">Venue linked</SelectItem>
                    <SelectItem value="live">Live on table</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {filteredPoolTiles.length} tile
                  {filteredPoolTiles.length === 1 ? "" : "s"}
                </p>
                <Button onClick={() => openGenerateDialog("pool")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Generate URLs
                </Button>
              </div>
            </div>

            {recentScope === "pool" ? (
              <RecentTilesCard
                tiles={recentTiles}
                title="Fresh pool URLs"
                onCopyCode={copyTileCode}
                onCopyExport={copyRecentExport}
              />
            ) : null}

            <Card>
              <CardContent className="p-0">
                {loadingPoolTiles && poolTiles.length === 0 ? (
                  <div className="p-6">
                    <DashboardGridSkeleton count={4} />
                  </div>
                ) : filteredPoolTiles.length === 0 ? (
                  <div className="py-16 text-center">
                    <QrCode className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
                    <p className="text-muted-foreground">No URLs found.</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      Generate global URLs to start the pool.
                    </p>
                    <Button className="mt-4" onClick={() => openGenerateDialog("pool")}>
                      <Plus className="mr-2 h-4 w-4" />
                      Generate URLs
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>Code / Alias</TableHead>
                        <TableHead>Venue</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">QR</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Updated
                        </TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPoolTiles.map((tile) => {
                        const venueTables = tile.storeId
                          ? tablesByStoreId[tile.storeId] ?? []
                          : [];
                        const isBusy =
                          updatingTileId === tile.id || deletingTileId === tile.id;

                        return (
                          <TableRow key={tile.id} className="align-top">
                            <TableCell className="min-w-[18rem]">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <code className="rounded bg-muted px-2 py-0.5 text-sm font-semibold">
                                    {tile.publicCode}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => void copyTileCode(tile.publicCode)}
                                  >
                                    {copiedKey === tile.publicCode ? (
                                      <Check className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => void copyTileUrl(tile.publicCode)}
                                  >
                                    {copiedKey === `url:${tile.publicCode}` ? (
                                      <Check className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                      <LinkIcon className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                                <Input
                                  value={labelDrafts[tile.id] ?? tile.label ?? ""}
                                  onChange={(event) =>
                                    setLabelDrafts((current) => ({
                                      ...current,
                                      [tile.id]: event.target.value,
                                    }))
                                  }
                                  onBlur={() => void commitLabel(tile)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  placeholder="Alias or placement note"
                                  className="h-8"
                                  disabled={isBusy}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="min-w-[13rem]">
                              <Select
                                value={tile.storeId ?? UNBOUND_STORE_VALUE}
                                onValueChange={(value) =>
                                  void handleUpdateTile(tile.id, {
                                    storeId:
                                      value === UNBOUND_STORE_VALUE ? null : value,
                                  })
                                }
                                disabled={isBusy}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Unbound" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={UNBOUND_STORE_VALUE}>
                                    Unbound
                                  </SelectItem>
                                  {stores.map((store) => (
                                    <SelectItem key={store.id} value={store.id}>
                                      {store.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {tile.storeSlug ? `${tile.storeSlug}.garsone` : "No venue yet"}
                              </p>
                            </TableCell>
                            <TableCell className="min-w-[13rem]">
                              <Select
                                value={tile.tableId ?? UNASSIGNED_TABLE_VALUE}
                                onValueChange={(value) =>
                                  void handleUpdateTile(tile.id, {
                                    tableId:
                                      value === UNASSIGNED_TABLE_VALUE
                                        ? null
                                        : value,
                                  })
                                }
                                disabled={!tile.storeId || isBusy}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue
                                    placeholder={
                                      tile.storeId
                                        ? "Select table"
                                        : "Pick venue first"
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={UNASSIGNED_TABLE_VALUE}>
                                    Unassigned
                                  </SelectItem>
                                  {venueTables.map((table) => (
                                    <SelectItem key={table.id} value={table.id}>
                                      {table.label}
                                      {table.isActive ? "" : " (inactive)"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {tile.tableLabel ?? "Not placed on a table yet"}
                              </p>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-2">
                                <TileLifecycleBadge tile={tile} />
                                <p className="text-xs text-muted-foreground">
                                  {getTileLifecycle(tile) === "unbound"
                                    ? "Waiting for venue inventory."
                                    : getTileLifecycle(tile) === "venue"
                                    ? "Ready to bind to a table."
                                    : getTileLifecycle(tile) === "live"
                                    ? "Customer-facing and ready."
                                    : "Kept out of circulation."}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewQr({
                                    code: tile.publicCode,
                                    url: buildPublicUrl(tile.publicCode),
                                  })
                                }
                                className="rounded border border-border/60 bg-white p-1 transition-colors hover:border-primary/50"
                              >
                                <QRCodeSVG
                                  value={buildPublicUrl(tile.publicCode)}
                                  size={44}
                                  bgColor="#ffffff"
                                  fgColor="#111827"
                                  marginSize={1}
                                />
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={tile.isActive}
                                onCheckedChange={(checked) =>
                                  void handleUpdateTile(tile.id, {
                                    isActive: checked,
                                  })
                                }
                                disabled={isBusy}
                              />
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                              {formatDate(tile.updatedAt || tile.createdAt)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => void handleDeleteTile(tile.id)}
                                disabled={isBusy}
                              >
                                {deletingTileId === tile.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="tiles" className="space-y-5">
            {!selectedStore ? (
              <Card interactive={false}>
                <CardContent className="py-16 text-center text-muted-foreground">
                  Select a venue to manage its table bindings.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    title="Venue Tiles"
                    value={selectedStoreStats.total}
                    description="All URLs already attached to this venue."
                  />
                  <MetricCard
                    title="Need Table"
                    value={selectedStoreStats.unassigned}
                    description="Venue-bound but not table-bound yet."
                  />
                  <MetricCard
                    title="Live"
                    value={selectedStoreStats.live}
                    description="Active and mapped to a table."
                  />
                  <MetricCard
                    title="Inactive"
                    value={selectedStoreStats.inactive}
                    description="Held back from guest traffic."
                  />
                </div>

                <Card interactive={false} className="border-border/60 bg-card/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {selectedStore.name}
                    </CardTitle>
                    <CardDescription>
                      Venue-specific URLs skip the venue step and land directly in
                      this venue's tile inventory.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search code, alias or table..."
                        value={storeSearch}
                        onChange={(event) => setStoreSearch(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {filteredStoreTiles.length} tile
                        {filteredStoreTiles.length === 1 ? "" : "s"}
                      </p>
                      <Button onClick={() => openGenerateDialog("store")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Generate for venue
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {recentScope === "store" ? (
                  <RecentTilesCard
                    tiles={recentTiles}
                    title={`Fresh URLs for ${selectedStore.name}`}
                    onCopyCode={copyTileCode}
                    onCopyExport={copyRecentExport}
                  />
                ) : null}

                <Card>
                  <CardContent className="p-0">
                    {loadingStoreTiles && storeTiles.length === 0 ? (
                      <div className="p-6">
                        <DashboardGridSkeleton count={4} />
                      </div>
                    ) : filteredStoreTiles.length === 0 ? (
                      <div className="py-16 text-center">
                        <Grid3X3 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
                        <p className="text-muted-foreground">
                          No venue-bound tiles found.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground/70">
                          Generate URLs here or move them in from the global pool.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead>Code / Alias</TableHead>
                            <TableHead>Table</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="hidden md:table-cell">
                              QR
                            </TableHead>
                            <TableHead className="text-center">Active</TableHead>
                            <TableHead className="hidden lg:table-cell">
                              Updated
                            </TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredStoreTiles.map((tile) => {
                            const isBusy =
                              updatingTileId === tile.id ||
                              deletingTileId === tile.id;

                            return (
                              <TableRow key={tile.id} className="align-top">
                                <TableCell className="min-w-[18rem]">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <code className="rounded bg-muted px-2 py-0.5 text-sm font-semibold">
                                        {tile.publicCode}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() =>
                                          void copyTileCode(tile.publicCode)
                                        }
                                      >
                                        {copiedKey === tile.publicCode ? (
                                          <Check className="h-3.5 w-3.5 text-primary" />
                                        ) : (
                                          <Copy className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() =>
                                          void copyTileUrl(tile.publicCode)
                                        }
                                      >
                                        {copiedKey === `url:${tile.publicCode}` ? (
                                          <Check className="h-3.5 w-3.5 text-primary" />
                                        ) : (
                                          <LinkIcon className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </div>
                                    <Input
                                      value={labelDrafts[tile.id] ?? tile.label ?? ""}
                                      onChange={(event) =>
                                        setLabelDrafts((current) => ({
                                          ...current,
                                          [tile.id]: event.target.value,
                                        }))
                                      }
                                      onBlur={() => void commitLabel(tile)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.currentTarget.blur();
                                        }
                                      }}
                                      placeholder="Alias or placement note"
                                      className="h-8"
                                      disabled={isBusy}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className="min-w-[13rem]">
                                  <Select
                                    value={tile.tableId ?? UNASSIGNED_TABLE_VALUE}
                                    onValueChange={(value) =>
                                      void handleUpdateTile(tile.id, {
                                        tableId:
                                          value === UNASSIGNED_TABLE_VALUE
                                            ? null
                                            : value,
                                      })
                                    }
                                    disabled={isBusy}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Select table" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={UNASSIGNED_TABLE_VALUE}>
                                        Unassigned
                                      </SelectItem>
                                      {selectedStoreTables.map((table) => (
                                        <SelectItem key={table.id} value={table.id}>
                                          {table.label}
                                          {table.isActive ? "" : " (inactive)"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {tile.tableLabel ?? "Not bound to a table yet"}
                                  </p>
                                </TableCell>
                                <TableCell>
                                  <TileLifecycleBadge tile={tile} />
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewQr({
                                        code: tile.publicCode,
                                        url: buildPublicUrl(tile.publicCode),
                                      })
                                    }
                                    className="rounded border border-border/60 bg-white p-1 transition-colors hover:border-primary/50"
                                  >
                                    <QRCodeSVG
                                      value={buildPublicUrl(tile.publicCode)}
                                      size={44}
                                      bgColor="#ffffff"
                                      fgColor="#111827"
                                      marginSize={1}
                                    />
                                  </button>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Switch
                                    checked={tile.isActive}
                                    onCheckedChange={(checked) =>
                                      void handleUpdateTile(tile.id, {
                                        isActive: checked,
                                      })
                                    }
                                    disabled={isBusy}
                                  />
                                </TableCell>
                                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                                  {formatDate(tile.updatedAt || tile.createdAt)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => void handleDeleteTile(tile.id)}
                                    disabled={isBusy}
                                  >
                                    {deletingTileId === tile.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
          <TabsContent value="settings" className="space-y-5">
            {!selectedStore ? (
              <Card interactive={false}>
                <CardContent className="py-16 text-center text-muted-foreground">
                  Select a venue to manage settings.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Settings className="h-4 w-4 text-primary" />
                          Ordering Mode
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Control how guests interact with {selectedStore.name}.
                        </CardDescription>
                      </div>
                      <Select
                        value={storeOrderingMode}
                        onValueChange={handleModeChange}
                        disabled={updatingMode}
                      >
                        <SelectTrigger className="w-full lg:w-56">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qr">Self-order</SelectItem>
                          <SelectItem value="waiter">Browse-only</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    <div
                      className={cn(
                        "rounded-lg border p-4 transition-colors",
                        storeOrderingMode === "qr"
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/60 bg-muted/20"
                      )}
                    >
                      <p className="font-medium">Self-order</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Guests scan and order directly from their phone.
                      </p>
                    </div>
                    <div
                      className={cn(
                        "rounded-lg border p-4 transition-colors",
                        storeOrderingMode === "waiter"
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/60 bg-muted/20"
                      )}
                    >
                      <p className="font-medium">Browse-only</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Guests browse, but waiters own order submission.
                      </p>
                    </div>
                    <div
                      className={cn(
                        "rounded-lg border p-4 transition-colors",
                        storeOrderingMode === "hybrid"
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/60 bg-muted/20"
                      )}
                    >
                      <p className="font-medium">Hybrid</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Run guest self-order and staff ordering in parallel.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Printer className="h-4 w-4 text-primary" />
                          Printers
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Configure printer topics for this venue.
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPrinters((current) => [...current, ""])}
                        >
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add
                        </Button>
                        <Button size="sm" onClick={handleSavePrinters}>
                          {savingPrinters ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {printers.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-muted-foreground">
                        No printers configured yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {printers.map((printer, index) => (
                          <div key={`${index}-${printer}`} className="flex gap-2">
                            <Input
                              value={printer}
                              onChange={(event) =>
                                setPrinters((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? event.target.value
                                      : value
                                  )
                                )
                              }
                              placeholder={`printer_${index + 1}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setPrinters((current) =>
                                  current.filter((_, itemIndex) => itemIndex !== index)
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
          <TabsContent value="overview" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Venues"
                value={overviewTotals.stores}
                description="Total live venues visible to the architect role."
              />
              <MetricCard
                title="Users"
                value={overviewTotals.users}
                description="Profiles counted across all venues."
              />
              <MetricCard
                title="QR Tiles"
                value={overviewTotals.tiles}
                description="Venue-linked tiles tracked by the backend."
              />
              <MetricCard
                title="Orders"
                value={overviewTotals.orders}
                description="Lifetime order volume snapshot."
              />
            </div>

            {loadingOverview && overview.length === 0 ? (
              <DashboardGridSkeleton count={6} />
            ) : overview.length === 0 ? (
              <Card interactive={false}>
                <CardContent className="py-16 text-center text-muted-foreground">
                  No venues found for the overview.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {overview.map((store) => {
                  const sparkline = buildSparkline(store);
                  return (
                    <Card key={store.id} className="overflow-hidden">
                      <CardHeader className="pb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <CardTitle className="text-xl">{store.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {store.slug ? `${store.slug}.garsone` : "No slug"}
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedStoreId(store.id);
                              setActiveTab("tiles");
                            }}
                          >
                            Manage venue
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Users
                            </p>
                            <p className="mt-2 text-2xl font-semibold">
                              {store.usersCount}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Tiles
                            </p>
                            <p className="mt-2 text-2xl font-semibold">
                              {store.tilesCount}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Orders
                            </p>
                            <p className="mt-2 text-2xl font-semibold">
                              {store.ordersCount}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-medium">Venue momentum</p>
                            <Badge variant="secondary" size="sm">
                              synthetic trend
                            </Badge>
                          </div>
                          <svg
                            viewBox="0 0 320 80"
                            className="h-20 w-full overflow-visible"
                            role="img"
                            aria-label={`Trend for ${store.name}`}
                          >
                            <path
                              d={sparklinePath(sparkline)}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              className="text-primary"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setGenerateCount(generateScope === "pool" ? 20 : 10);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {generateScope === "pool"
                ? "Generate global URLs"
                : `Generate URLs for ${selectedStore?.name ?? "venue"}`}
            </DialogTitle>
            <DialogDescription>
              {generateScope === "pool"
                ? "These URLs stay unbound until you attach them to a venue."
                : "These URLs are born inside the selected venue and only need table binding."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="generate-count">How many URLs</Label>
              <Input
                id="generate-count"
                type="number"
                min={1}
                max={MAX_GENERATE_COUNT}
                value={Number.isFinite(generateCount) ? generateCount : ""}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setGenerateCount(Number.isFinite(next) ? next : 0);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Max {MAX_GENERATE_COUNT} per batch.
              </p>
            </div>
            {!canGenerate ? (
              <p className="text-xs text-destructive">
                Enter a number between 1 and {MAX_GENERATE_COUNT}.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleBulkCreate()} disabled={!canGenerate}>
              <Plus className="mr-2 h-4 w-4" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(previewQr)}
        onOpenChange={(open) => {
          if (!open) setPreviewQr(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono">{previewQr?.code}</DialogTitle>
            <DialogDescription className="break-all text-xs">
              {previewQr?.url}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            {previewQr ? (
              <div className="rounded-xl border border-border bg-white p-4">
                <QRCodeSVG
                  value={previewQr.url}
                  size={240}
                  bgColor="#ffffff"
                  fgColor="#111827"
                  marginSize={2}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                previewQr ? void copyTileUrl(previewQr.code) : undefined
              }
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy URL
            </Button>
            <Button className="flex-1" onClick={() => setPreviewQr(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
