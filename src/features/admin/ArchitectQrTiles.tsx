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
  ServerCog,
  Settings,
  Trash2,
  Wifi,
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
import { Separator } from "@/components/ui/separator";
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
  ArchitectStoreUser,
  OrderingMode,
  PendingNodeAgent,
  QRTile,
  RemoteNode,
  RemoteNodeConfig,
  RemoteNodePrinter,
  RemoteNodeWifi,
  StoreInfo,
  StoreOnboardPayload,
  StoreOverview,
} from "@/types";

type StoreOption = Pick<
  StoreInfo,
  "id" | "name" | "slug" | "orderingMode" | "printers"
>;
type ActiveTab = "pool" | "settings" | "overview";
type GenerateScope = "pool" | "store";
type GenerateMethod = "random" | "manual";
type TileLifecycle = "inactive" | "unbound" | "venue" | "live";
type PoolStatusFilter = "all" | TileLifecycle;
type StoreOnboardForm = StoreOnboardPayload;
type StoreUserRoleInput = "MANAGER" | "WAITER" | "COOK" | "HYBRID";
type StoreUserForm = {
  email: string;
  password: string;
  displayName: string;
  role: StoreUserRoleInput;
};

const MAX_GENERATE_COUNT = 500;
const QR_CODE_REGEX = /^GT-[0-9A-HJKMNPQRSTVWXYZ]{4}-[0-9A-HJKMNPQRSTVWXYZ]{4}$/;
const UNBOUND_STORE_VALUE = "__unbound__";
const ADD_STORE_VALUE = "__add_store__";

const defaultStoreOnboardForm = (): StoreOnboardForm => ({
  slug: "",
  name: "",
  defaultPassword: "",
  currencyCode: "EUR",
  locale: "el",
  printerTopic: "printer_1",
  tableCount: 10,
  managerEmail: "",
  waiterEmail: "",
  cookEmail: "",
});

const defaultStoreUserForm = (): StoreUserForm => ({
  email: "",
  password: "",
  displayName: "",
  role: "WAITER",
});

const defaultRemoteNodeConfig = (): RemoteNodeConfig => ({
  displayName: "Main venue Pi",
  nodeSlug: "main",
  tailscaleHostname: "",
  localHostname: "",
  wifiSsid: "",
  wifiPassword: "",
  wifiNetworks: [
    {
      id: "wifi-1",
      ssid: "",
      password: "",
      priority: 1,
      hidden: false,
    },
  ],
  mqttHost: "",
  mqttPort: 8883,
  mqttTls: true,
  mqttInsecure: false,
  mqttUser: "",
  mqttPass: "",
  dockerImage: "mikedim95/mqtt-printer:latest",
  encoding: "cp1253",
  codepage: "7",
  feedLines: 3,
  pollSeconds: 30,
  timezone: "Europe/Athens",
  supportPhone: "",
  supportWhatsapp: "",
  supportUrl: "",
  notes: "",
  printers: [
    {
      id: "printer-1",
      type: "58",
      ordinal: 1,
      mac: "",
      topicSuffix: "printer_1",
      interface: "/dev/rfcomm0",
      label: "Printer 1",
    },
  ],
});

const normalizeRemoteNodeWifi = (
  wifi: Partial<RemoteNodeWifi>,
  index: number
): RemoteNodeWifi => ({
  id: wifi.id || `wifi-${index + 1}`,
  ssid: wifi.ssid || "",
  password: wifi.password || "",
  passwordSet: Boolean(wifi.passwordSet),
  priority: Number(wifi.priority || index + 1),
  hidden: Boolean(wifi.hidden),
});

const normalizeRemoteNodePrinter = (
  printer: Partial<RemoteNodePrinter>,
  index: number
): RemoteNodePrinter => ({
  id: printer.id || `printer-${index + 1}`,
  type: printer.type === "80" ? "80" : "58",
  ordinal: Number(printer.ordinal || index + 1),
  mac: printer.mac || "",
  topicSuffix: printer.topicSuffix || `printer_${index + 1}`,
  interface: printer.interface || `/dev/rfcomm${index}`,
  label: printer.label || printer.topicSuffix || `Printer ${index + 1}`,
});

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

const slugifyStore = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

const getTileLifecycle = (tile: QRTile): TileLifecycle => {
  if (!tile.isActive) return "inactive";
  if (!tile.storeId) return "unbound";
  if (!tile.tableId) return "venue";
  return "live";
};

const buildNodeConfigPayload = (nodeConfig: RemoteNodeConfig): RemoteNodeConfig => ({
  ...nodeConfig,
  localHostname: nodeConfig.localHostname?.trim().toLowerCase(),
  tailscaleHostname: nodeConfig.tailscaleHostname?.trim().toLowerCase(),
  wifiNetworks: (nodeConfig.wifiNetworks ?? [])
    .map((wifi, index) => ({
      ...wifi,
      id: wifi.id || `wifi-${index + 1}`,
      ssid: wifi.ssid.trim(),
      priority: Number(wifi.priority || index + 1),
      hidden: Boolean(wifi.hidden),
    }))
    .filter((wifi) => wifi.ssid.length > 0),
  printers: nodeConfig.printers.map((printer, index) => ({
    ...printer,
    id: printer.id || `printer-${index + 1}`,
    ordinal: Number(printer.ordinal || index + 1),
    interface: printer.interface || `/dev/rfcomm${index}`,
  })),
});

const pickPrimaryRemoteNode = (nodes: RemoteNode[] = []) => {
  if (!nodes.length) return null;
  const withConfig = nodes.filter((node) => node.config && Object.keys(node.config).length > 0);
  const candidates = withConfig.length ? withConfig : nodes;
  return (
    candidates.find((node) => node.slug === "main") ??
    candidates
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.lastSeenAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.lastSeenAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      })[0] ??
    null
  );
};

const lifecycleCopy: Record<
  TileLifecycle,
  { label: string; variant: "outline" | "warning" | "info" | "success" }
> = {
  inactive: { label: "Inactive", variant: "outline" },
  unbound: { label: "QR only", variant: "warning" },
  venue: { label: "Venue linked", variant: "info" },
  live: { label: "Table assigned", variant: "success" },
};

type BadgeVariant = "outline" | "warning" | "info" | "success" | "destructive";

const remoteNodeStatusCopy: Record<
  RemoteNode["status"],
  { label: string; variant: BadgeVariant; description: string }
> = {
  PENDING: {
    label: "Waiting for heartbeat",
    variant: "warning",
    description: "The printer topic can work while the node agent is still pending.",
  },
  ONLINE: {
    label: "Online",
    variant: "success",
    description: "The node agent is reporting normally.",
  },
  APPLYING: {
    label: "Applying config",
    variant: "info",
    description: "The node agent is applying the latest configuration.",
  },
  DEGRADED: {
    label: "Degraded",
    variant: "warning",
    description: "The node agent is reachable but reported a problem.",
  },
  ERROR: {
    label: "Error",
    variant: "destructive",
    description: "The node agent reported an error.",
  },
  OFFLINE: {
    label: "Offline",
    variant: "outline",
    description: "The node agent has not reported recently.",
  },
};

function getRemoteNodeSummary(node: RemoteNode | null, printerCount: number) {
  if (!node) {
    return {
      label: printerCount > 0 ? "Print routing ready" : "Not connected",
      badgeLabel: printerCount > 0 ? "No agent" : "Node agent",
      variant: printerCount > 0 ? "info" : "outline",
      description:
        printerCount > 0
          ? `${printerCount} printer topic${printerCount === 1 ? "" : "s"} configured; no node agent heartbeat yet.`
          : "No remote node has been configured for this venue.",
    } satisfies { label: string; badgeLabel: string; variant: BadgeVariant; description: string };
  }

  const status = remoteNodeStatusCopy[node.status] ?? remoteNodeStatusCopy.PENDING;
  if (node.status === "PENDING" && printerCount > 0) {
    return {
      ...status,
      label: "Print routing ready",
      badgeLabel: "Agent pending",
      description: `${printerCount} printer topic${printerCount === 1 ? "" : "s"} configured; waiting for the node agent heartbeat.`,
    };
  }
  return { ...status, badgeLabel: "Node agent" };
}

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
  const [recentTiles, setRecentTiles] = useState<QRTile[]>([]);
  const [recentScope, setRecentScope] = useState<GenerateScope | null>(null);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingPoolTiles, setLoadingPoolTiles] = useState(false);
  const [loadingStoreTiles, setLoadingStoreTiles] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [storeOnboardForm, setStoreOnboardForm] =
    useState<StoreOnboardForm>(() => defaultStoreOnboardForm());
  const [storeUsers, setStoreUsers] = useState<ArchitectStoreUser[]>([]);
  const [loadingStoreUsers, setLoadingStoreUsers] = useState(false);
  const [savingStoreUser, setSavingStoreUser] = useState(false);
  const [editingStoreUserId, setEditingStoreUserId] = useState<string | null>(null);
  const [storeUserDialogOpen, setStoreUserDialogOpen] = useState(false);
  const [storeUserForm, setStoreUserForm] = useState<StoreUserForm>(() =>
    defaultStoreUserForm()
  );
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyConfirmation, setHistoryConfirmation] = useState("");
  const [purgingHistory, setPurgingHistory] = useState(false);
  const [generateScope, setGenerateScope] = useState<GenerateScope>("pool");
  const [generateMethod, setGenerateMethod] = useState<GenerateMethod>("random");
  const [generateCount, setGenerateCount] = useState<number>(20);
  const [manualPublicCode, setManualPublicCode] = useState("");
  const [updatingTileId, setUpdatingTileId] = useState<string | null>(null);
  const [deletingTileId, setDeletingTileId] = useState<string | null>(null);
  const [updatingMode, setUpdatingMode] = useState(false);
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
  const [remoteNode, setRemoteNode] = useState<RemoteNode | null>(null);
  const [pendingNodes, setPendingNodes] = useState<PendingNodeAgent[]>([]);
  const [claimingNodeId, setClaimingNodeId] = useState<string | null>(null);
  const [nodeConfig, setNodeConfig] = useState<RemoteNodeConfig>(() =>
    defaultRemoteNodeConfig()
  );
  const [loadingNode, setLoadingNode] = useState(false);
  const [savingNode, setSavingNode] = useState(false);
  const [testingPrinterKey, setTestingPrinterKey] = useState<string | null>(null);
  const isArchitect = user?.role === "architect";
  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? null,
    [selectedStoreId, stores]
  );
  const remoteNodeSummary = useMemo(
    () => getRemoteNodeSummary(remoteNode, printers.length),
    [printers.length, remoteNode]
  );
  const remoteNodeAgentStatus = remoteNode
    ? remoteNodeStatusCopy[remoteNode.status] ?? remoteNodeStatusCopy.PENDING
    : null;
  const historyConfirmationPhrase = selectedStore
    ? `DELETE HISTORY ${selectedStore.slug}`
    : "";
  const normalizedManualCode = manualPublicCode.trim().toUpperCase();
  const canGenerate = generateMethod === "manual"
    ? QR_CODE_REGEX.test(normalizedManualCode)
    : Number.isFinite(generateCount) &&
      Math.trunc(generateCount) >= 1 &&
      Math.trunc(generateCount) <= MAX_GENERATE_COUNT;
  const canCreateStore =
    storeOnboardForm.name.trim().length > 0 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeOnboardForm.slug.trim()) &&
    storeOnboardForm.defaultPassword.length >= 8 &&
    Number(storeOnboardForm.tableCount || 0) >= 1;

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
              "publicCode,storeName,tableLabel",
              ...recentTiles.map((tile) =>
                [
                  tile.publicCode,
                  JSON.stringify(tile.storeName ?? ""),
                  JSON.stringify(tile.tableLabel ?? ""),
                ].join(",")
              ),
            ].join("\n")
          : recentTiles
              .map((tile) =>
                [tile.publicCode, tile.tableLabel || ""]
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

    },
    [selectedStoreId]
  );

  const removeTileLocally = useCallback((tileId: string) => {
    setPoolTiles((current) => current.filter((tile) => tile.id !== tileId));
    setStoreTiles((current) => current.filter((tile) => tile.id !== tileId));
    setRecentTiles((current) => current.filter((tile) => tile.id !== tileId));
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

  const updateStoreOnboardField = useCallback(
    <K extends keyof StoreOnboardForm>(key: K, value: StoreOnboardForm[K]) => {
      setStoreOnboardForm((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const handleStoreNameChange = useCallback(
    (value: string) => {
      setStoreOnboardForm((current) => ({
        ...current,
        name: value,
        slug: current.slug ? current.slug : slugifyStore(value),
      }));
    },
    []
  );

  const refreshPoolTiles = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshing(true);
      setLoadingPoolTiles(true);
      try {
        const res = await api.adminListAllQrTiles();
        const tiles = res.tiles ?? [];
        setPoolTiles(tiles);
      } catch (error) {
        console.error("Failed to load QR tile pool", error);
        toast({
          variant: "destructive",
          title: "Failed to load QR pool",
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
        const tilesRes = await api.adminListQrTiles(storeId);
        const tiles = tilesRes.tiles ?? [];
        setStoreTiles(tiles);
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

  const loadRemoteNode = useCallback(
    async (storeId: string) => {
      if (!storeId) return;
      setLoadingNode(true);
      try {
        const res = await api.adminListStoreNodes(storeId);
        const node = pickPrimaryRemoteNode(res.nodes ?? []);
        setRemoteNode(node);
        if (node?.config) {
          const configWifi =
            node.config.wifiNetworks?.length
              ? node.config.wifiNetworks.map(normalizeRemoteNodeWifi)
              : node.config.wifiSsid
              ? [
                  normalizeRemoteNodeWifi({
                    id: "wifi-1",
                    ssid: node.config.wifiSsid,
                    password: "",
                    passwordSet: node.config.wifiPasswordSet,
                    priority: 1,
                    hidden: false,
                  }, 0),
                ]
              : defaultRemoteNodeConfig().wifiNetworks;
          setNodeConfig({
            ...defaultRemoteNodeConfig(),
            ...node.config,
            displayName: node.config.displayName || node.displayName,
            nodeSlug: node.config.nodeSlug || node.slug,
            printers: node.config.printers?.length
              ? node.config.printers.map(normalizeRemoteNodePrinter)
              : defaultRemoteNodeConfig().printers,
            wifiNetworks: configWifi,
            wifiPassword: "",
            mqttPass: "",
          });
          return;
        }

        const selected = stores.find((store) => store.id === storeId);
        setNodeConfig({
          ...defaultRemoteNodeConfig(),
          printers:
            selected?.printers?.length
              ? selected.printers.map((topic, index) => ({
                  id: `printer-${index + 1}`,
                  type: "58",
                  ordinal: index + 1,
                  mac: "",
                  topicSuffix: topic,
                  interface: `/dev/rfcomm${index}`,
                  label: topic,
                }))
              : defaultRemoteNodeConfig().printers,
        });
      } catch (error) {
        console.error("Failed to load remote node", error);
        toast({
          variant: "destructive",
          title: "Failed to load remote node",
          description:
            error instanceof ApiError ? error.message : "Please try again.",
        });
      } finally {
        setLoadingNode(false);
      }
    },
    [stores, toast]
  );

  const waitForRemoteNodeAck = useCallback(
    async (storeId: string, targetVersion: number) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const res = await api.adminListStoreNodes(storeId);
        const node = pickPrimaryRemoteNode(res.nodes ?? []);
        if (!node) continue;
        setRemoteNode(node);
        const ack = node.config?.lastConfigAck;
        if (
          node.lastAppliedVersion === targetVersion ||
          ack?.version === targetVersion
        ) {
          const hostnameFailure = Object.values(ack?.hostnames ?? {}).find(
            (result) => result?.requested && !result.applied
          );
          toast({
            variant:
              ack?.status === "DEGRADED" || ack?.status === "ERROR" || hostnameFailure
                ? "destructive"
                : "default",
            title: hostnameFailure ? "Pi could not apply a hostname" : "Pi acknowledged config",
            description:
              hostnameFailure?.message ||
              ack?.message ||
              `OK, got it. Config v${targetVersion} received.`,
          });
          return;
        }
      }
    },
    [toast]
  );

  const loadPendingNodes = useCallback(async () => {
    try {
      const res = await api.adminListPendingNodes();
      setPendingNodes(res.pendingNodes ?? []);
    } catch (error) {
      console.error("Failed to load pending nodes", error);
      toast({
        variant: "destructive",
        title: "Failed to load waiting Pis",
        description: error instanceof ApiError ? error.message : "Please try again.",
      });
    }
  }, [toast]);

  const loadStoreUsers = useCallback(
    async (storeId: string) => {
      if (!storeId) return;
      setLoadingStoreUsers(true);
      try {
        const res = await api.adminListStoreUsers(storeId);
        setStoreUsers(res.users ?? []);
      } catch (error) {
        console.error("Failed to load store users", error);
        toast({
          variant: "destructive",
          title: "Failed to load users",
          description: error instanceof ApiError ? error.message : "Please try again.",
        });
      } finally {
        setLoadingStoreUsers(false);
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

  const handleCreateStore = useCallback(async () => {
    const payload: StoreOnboardPayload = {
      ...storeOnboardForm,
      slug: slugifyStore(storeOnboardForm.slug),
      name: storeOnboardForm.name.trim(),
      defaultPassword: storeOnboardForm.defaultPassword,
      currencyCode: (storeOnboardForm.currencyCode || "EUR").trim(),
      locale: (storeOnboardForm.locale || "el").trim(),
      printerTopic: (storeOnboardForm.printerTopic || "printer_1").trim(),
      tableCount: Number(storeOnboardForm.tableCount || 10),
      managerEmail: storeOnboardForm.managerEmail?.trim() || undefined,
      waiterEmail: storeOnboardForm.waiterEmail?.trim() || undefined,
      cookEmail: storeOnboardForm.cookEmail?.trim() || undefined,
    };

    if (
      !payload.name ||
      !payload.slug ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug) ||
      payload.defaultPassword.length < 8
    ) {
      toast({
        variant: "destructive",
        title: "Venue details are incomplete",
        description: "Name, slug and an 8+ character password are required.",
      });
      return;
    }

    setCreatingStore(true);
    try {
      const res = await api.adminCreateStore(payload);
      await loadStores();
      setSelectedStoreId(res.store.id);
      setStoreDialogOpen(false);
      setStoreOnboardForm(defaultStoreOnboardForm());
      setActiveTab("settings");
      void loadOverview();
      toast({
        title: "Venue onboarded",
        description: `${res.store.name} has ${res.tableCount} tables and default staff accounts.`,
      });
    } catch (error) {
      console.error("Failed to onboard venue", error);
      toast({
        variant: "destructive",
        title: "Venue onboarding failed",
        description:
          error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setCreatingStore(false);
    }
  }, [loadOverview, loadStores, storeOnboardForm, toast]);

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
      await loadStores();
      if (cancelled) return;
      await refreshPoolTiles();
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadStores, refreshPoolTiles]);

  useEffect(() => {
    if (!selectedStore) return;
    setStoreOrderingMode(selectedStore.orderingMode ?? "qr");
    setPrinters(selectedStore.printers ?? []);
    void refreshStoreTiles(selectedStore.id);
    void loadRemoteNode(selectedStore.id);
    void loadStoreUsers(selectedStore.id);
    setEditingStoreUserId(null);
    setStoreUserForm(defaultStoreUserForm());
    setHistoryConfirmation("");
    setHistoryDialogOpen(false);
  }, [loadRemoteNode, loadStoreUsers, refreshStoreTiles, selectedStore]);

  useEffect(() => {
    if (activeTab === "overview") {
      void loadOverview();
      return;
    }
    if (activeTab === "settings") {
      void loadPendingNodes();
    }
  }, [activeTab, loadOverview, loadPendingNodes]);

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
        return true;
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
        return false;
      } finally {
        setUpdatingTileId(null);
      }
    },
    [syncTile, toast]
  );

  const handleVenueAssignment = useCallback(
    async (tile: QRTile, storeId: string | null) => {
      if ((tile.storeId ?? null) === storeId) return;

      const targetStore = stores.find((store) => store.id === storeId);
      const updated = await handleUpdateTile(tile.id, { storeId });
      if (!updated) return;

      toast({
        title: storeId ? "QR moved to venue" : "QR removed from venue",
        description: storeId
          ? `${tile.publicCode} now opens ${targetStore?.name ?? "the selected venue"}. Its previous table assignment was cleared.`
          : `${tile.publicCode} is now unassigned and ready to use at another venue.`,
      });
    },
    [handleUpdateTile, stores, toast]
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

  const handleBulkCreate = useCallback(async () => {
    const count = Math.trunc(generateCount);
    if (!canGenerate) {
      toast({
        variant: "destructive",
        title: generateMethod === "manual" ? "Invalid QR code" : "Invalid count",
        description: generateMethod === "manual"
          ? "Use the format GT-XXXX-XXXX."
          : `Choose a number between 1 and ${MAX_GENERATE_COUNT}.`,
      });
      return;
    }

    try {
      const payload = generateMethod === "manual"
        ? { publicCodes: [normalizedManualCode] }
        : { count };
      const res =
        generateScope === "pool"
          ? await api.adminGenerateGlobalQrTiles(payload)
          : await api.adminGenerateQrTiles(selectedStoreId, payload);
      const created = res.tiles ?? [];

      setDialogOpen(false);
      setGenerateCount(generateScope === "pool" ? 20 : 10);
      setManualPublicCode("");
      setRecentScope(generateScope);
      setRecentTiles(created);
      setPoolTiles((current) => mergeTiles(current, created));
      if (generateScope === "store") {
        setStoreTiles((current) => mergeTiles(current, created));
      }
      toast({
        title:
          generateScope === "pool"
            ? "QR pool extended"
            : "Store QR codes generated",
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
    generateMethod,
    generateScope,
    mergeTiles,
    normalizedManualCode,
    selectedStoreId,
    toast,
    canGenerate,
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

  const startEditStoreUser = useCallback((storeUser: ArchitectStoreUser) => {
    setEditingStoreUserId(storeUser.id);
    setStoreUserForm({
      email: storeUser.email,
      password: "",
      displayName: storeUser.displayName,
      role: storeUser.role.toUpperCase() as StoreUserRoleInput,
    });
    setStoreUserDialogOpen(true);
  }, []);

  const resetStoreUserForm = useCallback(() => {
    setEditingStoreUserId(null);
    setStoreUserForm(defaultStoreUserForm());
  }, []);

  const startCreateStoreUser = useCallback(() => {
    resetStoreUserForm();
    setStoreUserDialogOpen(true);
  }, [resetStoreUserForm]);

  const handleSaveStoreUser = useCallback(async () => {
    if (!selectedStoreId) return;
    const email = storeUserForm.email.trim();
    const displayName = storeUserForm.displayName.trim();
    const password = storeUserForm.password;
    if (!email || !displayName || (!editingStoreUserId && !password)) {
      toast({
        variant: "destructive",
        title: "User details required",
        description: "Email, display name and password are required for new users.",
      });
      return;
    }
    setSavingStoreUser(true);
    try {
      const payload = {
        email,
        displayName,
        role: storeUserForm.role,
        ...(password ? { password } : {}),
      };
      const res = editingStoreUserId
        ? await api.adminUpdateStoreUser(selectedStoreId, editingStoreUserId, payload)
        : await api.adminCreateStoreUser(selectedStoreId, {
            ...payload,
            password,
          });
      setStoreUsers((current) => {
        const exists = current.some((user) => user.id === res.user.id);
        return exists
          ? current.map((user) => (user.id === res.user.id ? res.user : user))
          : [...current, res.user];
      });
      resetStoreUserForm();
      setStoreUserDialogOpen(false);
      toast({
        title: editingStoreUserId ? "User updated" : "User created",
        description: `${res.user.displayName} can access ${selectedStore?.name ?? "this store"}.`,
      });
      void loadOverview();
    } catch (error) {
      console.error("Failed to save store user", error);
      toast({
        variant: "destructive",
        title: "User save failed",
        description: error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setSavingStoreUser(false);
    }
  }, [editingStoreUserId, loadOverview, resetStoreUserForm, selectedStore?.name, selectedStoreId, storeUserForm, toast]);

  const handleDeleteStoreUser = useCallback(
    async (storeUser: ArchitectStoreUser) => {
      if (!selectedStoreId) return;
      const confirmed = window.confirm(`Delete ${storeUser.displayName || storeUser.email}?`);
      if (!confirmed) return;
      try {
        await api.adminDeleteStoreUser(selectedStoreId, storeUser.id);
        setStoreUsers((current) => current.filter((user) => user.id !== storeUser.id));
        if (editingStoreUserId === storeUser.id) resetStoreUserForm();
        toast({ title: "User deleted" });
        void loadOverview();
      } catch (error) {
        console.error("Failed to delete store user", error);
        toast({
          variant: "destructive",
          title: "User delete failed",
          description: error instanceof ApiError ? error.message : "Please try again.",
        });
      }
    },
    [editingStoreUserId, loadOverview, resetStoreUserForm, selectedStoreId, toast]
  );

  const handlePurgeHistory = useCallback(async () => {
    if (!selectedStore || historyConfirmation !== historyConfirmationPhrase) return;
    setPurgingHistory(true);
    try {
      const res = await api.adminPurgeStoreHistory(
        selectedStore.id,
        historyConfirmation
      );
      setHistoryDialogOpen(false);
      setHistoryConfirmation("");
      setOverview((current) =>
        current.map((store) =>
          store.id === selectedStore.id ? { ...store, ordersCount: 0 } : store
        )
      );
      await Promise.all([
        loadOverview(),
        refreshStoreTiles(selectedStore.id),
      ]);
      const deletedOrders = res.deleted?.orders ?? 0;
      toast({
        title: "Venue history deleted",
        description: `${deletedOrders} order${deletedOrders === 1 ? "" : "s"} removed from ${selectedStore.name}.`,
      });
    } catch (error) {
      console.error("Failed to purge store history", error);
      toast({
        variant: "destructive",
        title: "History deletion failed",
        description: error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setPurgingHistory(false);
    }
  }, [
    historyConfirmation,
    historyConfirmationPhrase,
    loadOverview,
    refreshStoreTiles,
    selectedStore,
    toast,
  ]);

  const handleResetStoreUserPassword = useCallback(
    async (storeUser: ArchitectStoreUser) => {
      if (!selectedStoreId) return;
      const confirmed = window.confirm(`Reset ${storeUser.displayName || storeUser.email}'s password to 1234?`);
      if (!confirmed) return;
      try {
        const res = await api.adminUpdateStoreUser(selectedStoreId, storeUser.id, { password: "1234" });
        setStoreUsers((current) => current.map((user) => (user.id === res.user.id ? res.user : user)));
        toast({
          title: "Password reset",
          description: `${storeUser.displayName || storeUser.email} must change it after signing in with 1234.`,
        });
      } catch (error) {
        console.error("Failed to reset store user password", error);
        toast({
          variant: "destructive",
          title: "Password reset failed",
          description: error instanceof ApiError ? error.message : "Please try again.",
        });
      }
    },
    [selectedStoreId, toast]
  );

  const updateNodeField = useCallback(
    <K extends keyof RemoteNodeConfig>(key: K, value: RemoteNodeConfig[K]) => {
      setNodeConfig((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const updateNodePrinter = useCallback(
    (index: number, patch: Partial<RemoteNodePrinter>) => {
      setNodeConfig((current) => ({
        ...current,
        printers: current.printers.map((printer, printerIndex) =>
          printerIndex === index ? { ...printer, ...patch } : printer
        ),
      }));
    },
    []
  );

  const updateWifiNetwork = useCallback(
    (index: number, patch: Partial<RemoteNodeWifi>) => {
      setNodeConfig((current) => ({
        ...current,
        wifiNetworks: (current.wifiNetworks ?? []).map((wifi, wifiIndex) =>
          wifiIndex === index ? { ...wifi, ...patch } : wifi
        ),
      }));
    },
    []
  );

  const addWifiNetwork = useCallback(() => {
    setNodeConfig((current) => {
      const existing = current.wifiNetworks ?? [];
      const index = existing.length;
      return {
        ...current,
        wifiNetworks: [
          ...existing,
          {
            id: `wifi-${index + 1}`,
            ssid: "",
            password: "",
            priority: index + 1,
            hidden: false,
          },
        ],
      };
    });
  }, []);

  const removeWifiNetwork = useCallback((index: number) => {
    setNodeConfig((current) => ({
      ...current,
      wifiNetworks: (current.wifiNetworks ?? []).filter(
        (_, wifiIndex) => wifiIndex !== index
      ),
    }));
  }, []);

  const addNodePrinter = useCallback(() => {
    setNodeConfig((current) => {
      const index = current.printers.length;
      return {
        ...current,
        printers: [
          ...current.printers,
          {
            id: `printer-${index + 1}`,
            type: "58",
            ordinal: index + 1,
            mac: "",
            topicSuffix: `printer_${index + 1}`,
            interface: `/dev/rfcomm${index}`,
            label: `Printer ${index + 1}`,
          },
        ],
      };
    });
  }, []);

  const removeNodePrinter = useCallback((index: number) => {
    setNodeConfig((current) => ({
      ...current,
      printers: current.printers.filter((_, printerIndex) => printerIndex !== index),
    }));
  }, []);

  const handleSaveRemoteNode = useCallback(async () => {
    if (!selectedStoreId) return;
    setSavingNode(true);
    try {
      const payload = buildNodeConfigPayload(nodeConfig);
      const res = await api.adminSaveStoreMainNode(selectedStoreId, payload);
      setRemoteNode(res.node);
      const topics = payload.printers
        .map((printer) => printer.topicSuffix.trim())
        .filter(Boolean);
      setPrinters(topics);
      setStores((current) =>
        current.map((store) =>
          store.id === selectedStoreId ? { ...store, printers: topics } : store
        )
      );
      setNodeConfig({
        ...defaultRemoteNodeConfig(),
        ...(res.node.config as Partial<RemoteNodeConfig>),
        wifiPassword: "",
        mqttPass: "",
        wifiNetworks:
          (res.node.config?.wifiNetworks as RemoteNodeWifi[] | undefined)
            ?.length
            ? (res.node.config?.wifiNetworks as RemoteNodeWifi[]).map(normalizeRemoteNodeWifi)
            : payload.wifiNetworks?.length
            ? payload.wifiNetworks.map((wifi, index) =>
                normalizeRemoteNodeWifi({ ...wifi, password: "" }, index)
              )
            : defaultRemoteNodeConfig().wifiNetworks,
        printers:
          (res.node.config?.printers as RemoteNodePrinter[] | undefined)?.length
            ? (res.node.config?.printers as RemoteNodePrinter[]).map(normalizeRemoteNodePrinter)
            : payload.printers.map(normalizeRemoteNodePrinter),
      });
      toast({
        title: "Remote node saved",
        description: "Waiting for the Pi to acknowledge the MQTT config.",
      });
      void waitForRemoteNodeAck(selectedStoreId, res.node.desiredConfigVersion);
    } catch (error) {
      console.error("Failed to save remote node", error);
      toast({
        variant: "destructive",
        title: "Node save failed",
        description:
          error instanceof ApiError ? error.message : "Please check required fields.",
      });
    } finally {
      setSavingNode(false);
    }
  }, [nodeConfig, selectedStoreId, toast, waitForRemoteNodeAck]);

  const handleClaimPendingNode = useCallback(
    async (pendingNode: PendingNodeAgent) => {
      if (!selectedStoreId) return;
      setClaimingNodeId(pendingNode.id);
      try {
        const payload = buildNodeConfigPayload(nodeConfig);
        const res = await api.adminClaimPendingNode(
          pendingNode.id,
          selectedStoreId,
          payload
        );
        setRemoteNode(res.node);
        const topics = payload.printers
          .map((printer) => printer.topicSuffix.trim())
          .filter(Boolean);
        setPrinters(topics);
        setStores((current) =>
          current.map((store) =>
            store.id === selectedStoreId ? { ...store, printers: topics } : store
          )
        );
        setPendingNodes((current) =>
          current.map((node) =>
            node.id === pendingNode.id
              ? {
                  ...node,
                  status: "CLAIMED",
                  storeId: selectedStoreId,
                  claimedNodeId: res.node.id,
                }
              : node
          )
        );
        setNodeConfig({
          ...defaultRemoteNodeConfig(),
          ...(res.node.config as Partial<RemoteNodeConfig>),
          wifiPassword: "",
          mqttPass: "",
          wifiNetworks:
            (res.node.config?.wifiNetworks as RemoteNodeWifi[] | undefined)
              ?.length
              ? (res.node.config?.wifiNetworks as RemoteNodeWifi[]).map(normalizeRemoteNodeWifi)
              : payload.wifiNetworks?.length
              ? payload.wifiNetworks.map((wifi, index) =>
                  normalizeRemoteNodeWifi({ ...wifi, password: "" }, index)
                )
              : defaultRemoteNodeConfig().wifiNetworks,
          printers:
            (res.node.config?.printers as RemoteNodePrinter[] | undefined)?.length
              ? (res.node.config?.printers as RemoteNodePrinter[]).map(normalizeRemoteNodePrinter)
              : payload.printers.map(normalizeRemoteNodePrinter),
        });
        toast({
          title: "Pi associated",
          description: "Waiting for the Pi to acknowledge the MQTT config.",
        });
        void waitForRemoteNodeAck(selectedStoreId, res.node.desiredConfigVersion);
      } catch (error) {
        console.error("Failed to claim pending node", error);
        toast({
          variant: "destructive",
          title: "Association failed",
          description:
            error instanceof ApiError ? error.message : "Please try again.",
        });
      } finally {
        setClaimingNodeId(null);
      }
    },
    [nodeConfig, selectedStoreId, toast, waitForRemoteNodeAck]
  );

  const handleRotateNodeToken = useCallback(async () => {
    if (!remoteNode?.id) return;
    setSavingNode(true);
    try {
      const res = await api.adminRotateNodeToken(remoteNode.id);
      setRemoteNode(res.node);
      toast({
        title: "Node token rotated",
        description: "The new token was sent to the Pi over MQTT.",
      });
    } catch (error) {
      console.error("Failed to rotate node token", error);
      toast({
        variant: "destructive",
        title: "Token rotation failed",
        description: error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setSavingNode(false);
    }
  }, [remoteNode?.id, toast]);

  const printerTopicFor = useCallback(
    (printer: RemoteNodePrinter, index: number) => {
      const suffix = (printer.topicSuffix || `printer_${index + 1}`).trim();
      return `${selectedStore?.slug || selectedStoreId || "store"}/orders/preparing/${suffix}`;
    },
    [selectedStore?.slug, selectedStoreId]
  );

  const handleTestPrinter = useCallback(
    async (printer: RemoteNodePrinter, index: number) => {
      if (!selectedStoreId) return;
      const topicSuffix = (printer.topicSuffix || `printer_${index + 1}`).trim();
      if (!topicSuffix) return;
      const key = printer.id || `${index}:${topicSuffix}`;
      setTestingPrinterKey(key);
      try {
        const res = await api.adminTestStorePrinter(selectedStoreId, {
          topicSuffix,
          mac: printer.mac,
          label: printer.label || `Printer ${index + 1}`,
          type: printer.type,
        });
        toast({
          title: "Test print sent",
          description: `Published to ${res.topic}.`,
        });
      } catch (error) {
        console.error("Failed to send test print", error);
        toast({
          variant: "destructive",
          title: "Test print failed",
          description:
            error instanceof ApiError ? error.message : "Please check the printer topic.",
        });
      } finally {
        setTestingPrinterKey(null);
      }
    },
    [selectedStoreId, toast]
  );

  const handleRefresh = useCallback(() => {
    if (activeTab === "overview") {
      void loadOverview();
      return;
    }
    if (activeTab === "settings") {
      void loadPendingNodes();
      if (selectedStoreId) void loadRemoteNode(selectedStoreId);
      if (selectedStoreId) void loadStoreUsers(selectedStoreId);
      if (selectedStoreId) void refreshStoreTiles(selectedStoreId, true);
      return;
    }
    void refreshPoolTiles(true);
  }, [activeTab, loadOverview, loadPendingNodes, loadRemoteNode, loadStoreUsers, refreshPoolTiles, refreshStoreTiles, selectedStoreId]);

  const unassignedPoolTiles = useMemo(
    () => poolTiles.filter((tile) => !tile.storeId && !tile.tableId),
    [poolTiles]
  );

  const poolStats = useMemo(() => {
    return unassignedPoolTiles.reduce(
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
  }, [unassignedPoolTiles]);

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

  const selectedStoreOverview = useMemo(() => {
    const aggregate = overview.find((store) => store.id === selectedStoreId) ?? null;
    if (!selectedStore) return aggregate;
    return {
      id: selectedStore.id,
      slug: selectedStore.slug,
      name: selectedStore.name,
      usersCount: storeUsers.length || aggregate?.usersCount || 0,
      tilesCount: selectedStoreStats.total,
      ordersCount: aggregate?.ordersCount || 0,
    };
  }, [overview, selectedStore, selectedStoreId, selectedStoreStats.total, storeUsers.length]);

  const filteredPoolTiles = useMemo(() => {
    const term = poolSearch.trim().toLowerCase();
    const searchableTiles = term ? poolTiles : unassignedPoolTiles;
    return searchableTiles.filter((tile) => {
      if (poolStatusFilter !== "all" && getTileLifecycle(tile) !== poolStatusFilter) {
        return false;
      }
      if (!term) return true;
      return [
        tile.publicCode,
        tile.storeName,
        tile.storeSlug,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [poolSearch, poolStatusFilter, poolTiles, unassignedPoolTiles]);

  const filteredStoreTiles = useMemo(() => {
    const term = storeSearch.trim().toLowerCase();
    if (!term) return storeTiles;
    return storeTiles.filter((tile) =>
      [tile.publicCode, tile.tableLabel]
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
      ? "Unassigned QR inventory ready to bind to venues."
      : selectedStore
      ? `Managing ${selectedStore.name}`
      : "Select a store to continue.";

  const openGenerateDialog = (scope: GenerateScope) => {
    if (scope === "store" && !selectedStoreId) {
      toast({
        variant: "destructive",
        title: "No venue selected",
        description: "Pick a store before generating store-specific QR codes.",
      });
      return;
    }
    setGenerateScope(scope);
    setGenerateMethod("random");
    setGenerateCount(scope === "pool" ? 20 : 10);
    setManualPublicCode("");
    setDialogOpen(true);
  };

  const handleStoreSelect = (value: string) => {
    if (value === ADD_STORE_VALUE) {
      setStoreDialogOpen(true);
      return;
    }
    setSelectedStoreId(value);
  };

  return (
    <PageTransition className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        supertitle="Architect"
        title="Garsone Architect"
        subtitle={headerSubtitle}
        icon="GA"
        tone="secondary"
        burgerActions={
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => setStoreDialogOpen(true)}
            >
              <Building2 className="mr-2 h-4 w-4" />
              Onboard venue
            </Button>
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
              onClick={() => openGenerateDialog("pool")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Grow QR pool
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
                QR Pool
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                Per Store Setting
              </TabsTrigger>
              <TabsTrigger value="overview" className="gap-2">
                <Building2 className="h-4 w-4" />
                Garsone Overview
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
                  openGenerateDialog(
                    activeTab === "settings" && selectedStoreId ? "store" : "pool"
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {activeTab === "settings" && selectedStoreId
                  ? "Generate Store QR"
                  : "Generate QR"}
              </Button>
            </div>
          </div>

          <TabsContent value="pool" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Unassigned QR Codes"
                value={poolStats.total}
                description="No venue or table attached."
              />
              <MetricCard
                title="Active"
                value={poolStats.unbound}
                description="Ready to bind to a venue."
              />
              <MetricCard
                title="Inactive"
                value={poolStats.inactive}
                description="Held out of circulation."
              />
              <MetricCard
                title="Visible"
                value={filteredPoolTiles.length}
                description="Matching the current search and filter."
              />
            </div>

            <Card interactive={false} className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Binding flow</CardTitle>
                <CardDescription>
                  This pool only shows QR codes with no venue or table assignment.
                  Once a QR is bound to a venue, it moves into that venue's Store QR Tiles tab.
                  Search by a printed code to find and move it even when it belongs to another venue.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Badge variant="warning">1. QR only</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create a public code with no store or table assignment.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Badge variant="info">2. Venue linked</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Attach the code to a venue when inventory is allocated.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Badge variant="success">3. Assign in venue</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create tables and link QR codes from the venue's table editor.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Find any printed code..."
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
                    <SelectItem value="all">All unassigned</SelectItem>
                    <SelectItem value="unbound">QR only</SelectItem>
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
                  Generate QR
                </Button>
              </div>
            </div>

            {recentScope === "pool" ? (
              <RecentTilesCard
                tiles={recentTiles}
                title="Fresh pool QR codes"
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
                    <p className="text-muted-foreground">No QR codes found.</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      Generate global QR codes to start the unassigned pool.
                    </p>
                    <Button className="mt-4" onClick={() => openGenerateDialog("pool")}>
                      <Plus className="mr-2 h-4 w-4" />
                      Generate QR
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>Code</TableHead>
                        <TableHead>Venue</TableHead>
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
                              </div>
                            </TableCell>
                            <TableCell className="min-w-[13rem]">
                              <Select
                                value={tile.storeId ?? UNBOUND_STORE_VALUE}
                                onValueChange={(value) =>
                                  void handleVenueAssignment(
                                    tile,
                                    value === UNBOUND_STORE_VALUE ? null : value
                                  )
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
                            <TableCell>
                              <div className="space-y-2">
                                <TileLifecycleBadge tile={tile} />
                                <p className="text-xs text-muted-foreground">
                                  {getTileLifecycle(tile) === "unbound"
                                    ? "Waiting for venue inventory."
                                    : getTileLifecycle(tile) === "venue"
                                    ? "Assign tables from per-venue options."
                                    : getTileLifecycle(tile) === "live"
                                    ? "Assigned from venue settings."
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
                                  includeMargin={true}
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
          <TabsContent value="settings" className="space-y-5">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="h-4 w-4 text-primary" />
                      Store
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Pick the store to configure, or create a new one.
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      value={selectedStoreId}
                      onValueChange={handleStoreSelect}
                      disabled={loadingStores}
                    >
                      <SelectTrigger className="h-9 w-full sm:w-64">
                        <SelectValue placeholder="Select store" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={ADD_STORE_VALUE}>
                          <span className="flex items-center gap-2">
                            <Plus className="h-3.5 w-3.5" />
                            Add new store
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setStoreDialogOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Create store
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
            {!selectedStore ? (
              <Card interactive={false}>
                <CardContent className="py-16 text-center text-muted-foreground">
                  Select a store to manage settings.
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="store-overview" className="space-y-5">
                <TabsList className="w-full justify-start lg:w-auto">
                  <TabsTrigger value="store-overview" className="gap-2">
                    <Grid3X3 className="h-4 w-4" />
                    Store Overview
                  </TabsTrigger>
                  <TabsTrigger value="store-settings" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Store Settings
                  </TabsTrigger>
                  <TabsTrigger value="store-qr-tiles" className="gap-2">
                    <QrCode className="h-4 w-4" />
                    Store QR Tiles
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="store-overview" className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      title="QR Tiles"
                      value={selectedStoreOverview?.tilesCount ?? selectedStoreStats.total}
                      description="Tiles linked to this store."
                    />
                    <MetricCard
                      title="Live Tables"
                      value={selectedStoreStats.live}
                      description="Active QR codes bound to tables."
                    />
                    <MetricCard
                      title="Users"
                      value={selectedStoreOverview?.usersCount ?? 0}
                      description="Profiles counted for this store."
                    />
                    <MetricCard
                      title="Orders"
                      value={selectedStoreOverview?.ordersCount ?? 0}
                      description="Lifetime order volume snapshot."
                    />
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle>{selectedStore.name}</CardTitle>
                      <CardDescription>
                        {selectedStore.slug ? `${selectedStore.slug}.garsone` : "No slug"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <p className="text-sm text-muted-foreground">Ordering mode</p>
                        <p className="mt-2 font-medium capitalize">{storeOrderingMode}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <p className="text-sm text-muted-foreground">Printers</p>
                        <p className="mt-2 font-medium">{printers.length}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <p className="text-sm text-muted-foreground">Remote node</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="font-medium">{remoteNodeSummary.label}</p>
                          <Badge variant={remoteNodeSummary.variant} size="sm">
                            {remoteNodeSummary.badgeLabel}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {remoteNodeSummary.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="store-qr-tiles" className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      title="Store QR Tiles"
                      value={selectedStoreStats.total}
                      description="All QR codes linked to this venue."
                    />
                    <MetricCard
                      title="Table Unassigned"
                      value={selectedStoreStats.unassigned}
                      description="Venue-linked but not bound to a table."
                    />
                    <MetricCard
                      title="Table Assigned"
                      value={selectedStoreStats.live}
                      description="QR codes bound to venue tables."
                    />
                    <MetricCard
                      title="Inactive"
                      value={selectedStoreStats.inactive}
                      description="Venue QR codes held out of circulation."
                    />
                  </div>

                  <Card interactive={false} className="border-primary/25 bg-primary/5">
                    <CardContent className="flex gap-3 p-4">
                      <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="font-medium">Assign or move printed QR tiles here</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Use the Venue assignment control on any row. Moving a QR changes
                          where the same printed code opens and clears its old table. Removing
                          it from the venue keeps the code reusable in the unassigned pool.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative flex-1 lg:max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search code or table..."
                        value={storeSearch}
                        onChange={(event) => setStoreSearch(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {filteredStoreTiles.length} tile
                        {filteredStoreTiles.length === 1 ? "" : "s"}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refreshStoreTiles(selectedStore.id)}
                        disabled={loadingStoreTiles}
                      >
                        {loadingStoreTiles ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="mr-2 h-4 w-4" />
                        )}
                        Refresh
                      </Button>
                      <Button size="sm" onClick={() => openGenerateDialog("store")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Generate Store QR
                      </Button>
                    </div>
                  </div>

                  {recentScope === "store" ? (
                    <RecentTilesCard
                      tiles={recentTiles}
                      title={`Fresh QR codes for ${selectedStore.name}`}
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
                          <QrCode className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
                          <p className="text-muted-foreground">No store QR tiles found.</p>
                          <p className="mt-1 text-sm text-muted-foreground/70">
                            Bind QR codes from the pool or generate venue-specific QR codes.
                          </p>
                          <Button className="mt-4" onClick={() => openGenerateDialog("store")}>
                            <Plus className="mr-2 h-4 w-4" />
                            Generate Store QR
                          </Button>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead>Code</TableHead>
                              <TableHead>Venue assignment</TableHead>
                              <TableHead>Table</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="hidden md:table-cell">QR</TableHead>
                              <TableHead className="text-center">Active</TableHead>
                              <TableHead className="hidden lg:table-cell">Updated</TableHead>
                              <TableHead className="w-12" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredStoreTiles.map((tile) => {
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
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[14rem]">
                                    <Select
                                      value={tile.storeId ?? UNBOUND_STORE_VALUE}
                                      onValueChange={(value) =>
                                        void handleVenueAssignment(
                                          tile,
                                          value === UNBOUND_STORE_VALUE ? null : value
                                        )
                                      }
                                      disabled={isBusy}
                                    >
                                      <SelectTrigger className="h-9 font-medium">
                                        <SelectValue placeholder="Choose venue" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={UNBOUND_STORE_VALUE}>
                                          Remove from venue (unassigned)
                                        </SelectItem>
                                        {stores.map((store) => (
                                          <SelectItem key={store.id} value={store.id}>
                                            {store.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                      Move or remove this printed code without deleting it.
                                    </p>
                                  </TableCell>
                                  <TableCell className="min-w-[12rem]">
                                    <p className="font-medium">
                                      {tile.tableLabel || "No table assigned"}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {tile.tableId
                                        ? `Table ID ${tile.tableId}`
                                        : "Assign from the venue table editor."}
                                    </p>
                                  </TableCell>
                                  <TableCell>
                                    <div className="space-y-2">
                                      <TileLifecycleBadge tile={tile} />
                                      <p className="text-xs text-muted-foreground">
                                        {getTileLifecycle(tile) === "venue"
                                          ? "Ready for table assignment."
                                          : getTileLifecycle(tile) === "live"
                                          ? "Bound to a table."
                                          : getTileLifecycle(tile) === "inactive"
                                          ? "Kept out of circulation."
                                          : "Not attached to a venue."}
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
                                        includeMargin={true}
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

                <TabsContent value="store-settings" className="space-y-5">
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
                        value={storeOrderingMode || "qr"}
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
                          <Building2 className="h-4 w-4 text-primary" />
                          Store Users
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Create, edit and remove staff access for {selectedStore.name}.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => void loadStoreUsers(selectedStore.id)} disabled={loadingStoreUsers}>
                          {loadingStoreUsers ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="mr-2 h-4 w-4" />
                          )}
                          Refresh
                        </Button>
                        <Button size="sm" onClick={startCreateStoreUser}>
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add User
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {storeUsers.length === 0 ? (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                        No store users yet.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="w-[230px] text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {storeUsers.map((storeUser) => (
                            <TableRow key={storeUser.id}>
                              <TableCell className="font-medium">{storeUser.displayName}</TableCell>
                              <TableCell className="break-all">{storeUser.email}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="capitalize">
                                  {storeUser.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={() => startEditStoreUser(storeUser)}>
                                    Edit
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleResetStoreUserPassword(storeUser)}>
                                    Reset pass
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => void handleDeleteStoreUser(storeUser)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {pendingNodes.some((node) => node.status === "PENDING") ? (
                  <Card>
                    <CardHeader className="pb-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Wifi className="h-4 w-4 text-primary" />
                            Waiting Pis
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Fresh nodes that registered locally and are waiting for
                            association with {selectedStore.name}.
                          </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => void loadPendingNodes()}>
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Refresh
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {pendingNodes
                        .filter((node) => node.status === "PENDING")
                        .map((node) => (
                          <div
                            key={node.id}
                            className="grid gap-3 rounded-lg border border-border/60 p-4 lg:grid-cols-[1fr_auto]"
                          >
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">
                                  {node.displayName || node.localHostname || "Pending Pi"}
                                </p>
                                <Badge variant="warning" size="sm">
                                  Waiting
                                </Badge>
                              </div>
                              <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                                <span>Host: {node.localHostname || "-"}</span>
                                <span>Tailscale: {node.tailscaleHostname || "-"}</span>
                                <span className="break-all">
                                  MAC: {node.macAddresses.join(", ") || "-"}
                                </span>
                                <span className="break-all">
                                  IP: {node.ipAddresses.join(", ") || "-"}
                                </span>
                                <span>Last seen: {formatDate(node.lastSeenAt)}</span>
                                <span className="break-all">Key: {node.nodeKey}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-end">
                              <Button
                                size="sm"
                                onClick={() => void handleClaimPendingNode(node)}
                                disabled={claimingNodeId === node.id || savingNode}
                              >
                                {claimingNodeId === node.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="mr-2 h-4 w-4" />
                                )}
                                Associate to store
                              </Button>
                            </div>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <ServerCog className="h-4 w-4 text-primary" />
                          Remote Node Pi
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Per-venue config delivered to the central node container over MQTT.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {remoteNode ? (
                          <Badge variant={remoteNodeAgentStatus?.variant ?? "outline"}>
                            {remoteNodeAgentStatus?.label ?? "Node agent"}
                          </Badge>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void loadRemoteNode(selectedStore.id)}
                          disabled={loadingNode}
                        >
                          {loadingNode ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button size="sm" onClick={handleSaveRemoteNode} disabled={savingNode}>
                          {savingNode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Save node
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Display name</Label>
                        <Input value={nodeConfig.displayName} onChange={(event) => updateNodeField("displayName", event.target.value)} />
                      </div>
                      <div>
                        <Label>Node slug</Label>
                        <Input value={nodeConfig.nodeSlug} onChange={(event) => updateNodeField("nodeSlug", event.target.value)} />
                      </div>
                      <div>
                        <Label>Tailscale machine name</Label>
                        <Input
                          value={nodeConfig.tailscaleHostname || ""}
                          maxLength={63}
                          autoCapitalize="none"
                          spellCheck={false}
                          onChange={(event) => updateNodeField("tailscaleHostname", event.target.value)}
                        />
                      </div>
                      <div>
                        <Label>LAN / router hostname</Label>
                        <Input
                          value={nodeConfig.localHostname || ""}
                          maxLength={63}
                          autoCapitalize="none"
                          spellCheck={false}
                          onChange={(event) => updateNodeField("localHostname", event.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Saving applies these names on the Pi. Tailscale updates directly; the router may show the LAN name after its next DHCP lease refresh.
                    </p>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="flex items-center gap-1.5">
                          <Wifi className="h-3.5 w-3.5" />
                          Local Wi-Fi connections
                        </Label>
                        <Button variant="outline" size="sm" onClick={addWifiNetwork}>
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add Wi-Fi
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Saving installs the profiles; acknowledgement does not mean every hotspot is currently detectable. Phone hotspots should use compatibility or 2.4 GHz mode.
                      </p>
                      <div className="space-y-2">
                        {(nodeConfig.wifiNetworks ?? []).map((wifi, index) => (
                          <div key={wifi.id || index} className="grid gap-2 rounded-lg border border-border/60 p-3 md:grid-cols-12">
                            <div className="md:col-span-4">
                              <Label>SSID</Label>
                              <Input
                                value={wifi.ssid}
                                onChange={(event) => updateWifiNetwork(index, { ssid: event.target.value })}
                                placeholder={`Venue Wi-Fi ${index + 1}`}
                              />
                            </div>
                            <div className="md:col-span-4">
                              <Label>Password {wifi.passwordSet ? "(saved)" : ""}</Label>
                              <Input
                                type="password"
                                value={wifi.password || ""}
                                onChange={(event) => updateWifiNetwork(index, { password: event.target.value })}
                                placeholder={wifi.passwordSet ? "Leave blank to keep existing" : ""}
                              />
                              {wifi.passwordSet ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  A password is saved; leave this blank to keep it.
                                </p>
                              ) : null}
                            </div>
                            <div className="md:col-span-2">
                              <Label>Priority</Label>
                              <Input
                                type="number"
                                min={1}
                                max={20}
                                value={wifi.priority ?? index + 1}
                                onChange={(event) => updateWifiNetwork(index, { priority: Number(event.target.value || index + 1) })}
                              />
                              <p className="mt-1 text-xs text-muted-foreground">
                                1 is primary; higher numbers are fallback networks.
                              </p>
                            </div>
                            <div className="flex items-end gap-3 pb-2 md:col-span-1">
                              <label className="flex items-center gap-2 text-sm">
                                <Switch
                                  checked={Boolean(wifi.hidden)}
                                  onCheckedChange={(checked) => updateWifiNetwork(index, { hidden: checked })}
                                />
                                Hidden
                              </label>
                            </div>
                            <div className="flex items-end justify-end md:col-span-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removeWifiNetwork(index)}
                                disabled={(nodeConfig.wifiNetworks ?? []).length <= 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <Label>MQTT host</Label>
                        <Input value={nodeConfig.mqttHost} onChange={(event) => updateNodeField("mqttHost", event.target.value)} />
                      </div>
                      <div>
                        <Label>MQTT port</Label>
                        <Input type="number" value={nodeConfig.mqttPort} onChange={(event) => updateNodeField("mqttPort", Number(event.target.value || 8883))} />
                      </div>
                      <div className="flex items-end gap-4 pb-2">
                        <label className="flex items-center gap-2 text-sm">
                          <Switch checked={nodeConfig.mqttTls} onCheckedChange={(checked) => updateNodeField("mqttTls", checked)} />
                          TLS
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch checked={nodeConfig.mqttInsecure} onCheckedChange={(checked) => updateNodeField("mqttInsecure", checked)} />
                          Insecure
                        </label>
                      </div>
                      <div>
                        <Label>MQTT user</Label>
                        <Input value={nodeConfig.mqttUser || ""} onChange={(event) => updateNodeField("mqttUser", event.target.value)} />
                      </div>
                      <div>
                        <Label>MQTT password {nodeConfig.mqttPassSet ? "(saved)" : ""}</Label>
                        <Input
                          type="password"
                          value={nodeConfig.mqttPass || ""}
                          onChange={(event) => updateNodeField("mqttPass", event.target.value)}
                          placeholder={nodeConfig.mqttPassSet ? "Leave blank to keep existing" : ""}
                        />
                        {nodeConfig.mqttPassSet ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            A password is saved; leave this blank to keep it.
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <Label>Status seconds</Label>
                        <Input type="number" value={nodeConfig.pollSeconds || 30} onChange={(event) => updateNodeField("pollSeconds", Number(event.target.value || 30))} />
                      </div>
                      <div>
                        <Label>Timezone</Label>
                        <Input value={nodeConfig.timezone || "Europe/Athens"} onChange={(event) => updateNodeField("timezone", event.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Declared printer interfaces</Label>
                        <Button variant="outline" size="sm" onClick={addNodePrinter}>
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add printer
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {nodeConfig.printers.map((printer, index) => (
                          <div key={printer.id || index} className="grid gap-2 rounded-lg border border-border/60 p-3 md:grid-cols-12">
                            <div className="md:col-span-1">
                              <Label>Type</Label>
                              <Select value={printer.type || "58"} onValueChange={(value) => updateNodePrinter(index, { type: value as "58" | "80" })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="58">58mm</SelectItem>
                                  <SelectItem value="80">80mm</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="md:col-span-1">
                              <Label>No.</Label>
                              <Input type="number" value={printer.ordinal} onChange={(event) => updateNodePrinter(index, { ordinal: Number(event.target.value || index + 1) })} />
                            </div>
                            <div className="md:col-span-3">
                              <Label>Bluetooth MAC</Label>
                              <Input value={printer.mac} onChange={(event) => updateNodePrinter(index, { mac: event.target.value })} placeholder="AA:BB:CC:DD:EE:FF" />
                            </div>
                            <div className="md:col-span-2">
                              <Label>Interface</Label>
                              <Input value={printer.interface || ""} onChange={(event) => updateNodePrinter(index, { interface: event.target.value })} placeholder={`/dev/rfcomm${index}`} />
                            </div>
                            <div className="md:col-span-2">
                              <Label>Topic suffix</Label>
                              <Input value={printer.topicSuffix} onChange={(event) => updateNodePrinter(index, { topicSuffix: event.target.value })} placeholder={`printer_${index + 1}`} />
                            </div>
                            <div className="md:col-span-2">
                              <Label>Label</Label>
                              <Input value={printer.label || ""} onChange={(event) => updateNodePrinter(index, { label: event.target.value })} />
                            </div>
                            <div className="flex items-end justify-end md:col-span-1">
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeNodePrinter(index)} disabled={nodeConfig.printers.length <= 1}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex flex-col gap-2 rounded-md bg-muted/25 p-2 md:col-span-12 md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0">
                                <Label className="text-xs text-muted-foreground">MQTT topic this printer listens on</Label>
                                <div className="mt-1 break-all font-mono text-xs text-primary">
                                  {printerTopicFor(printer, index)}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleTestPrinter(printer, index)}
                                disabled={testingPrinterKey === (printer.id || `${index}:${printer.topicSuffix}`)}
                              >
                                {testingPrinterKey === (printer.id || `${index}:${printer.topicSuffix}`) ? (
                                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                ) : (
                                  <Printer className="mr-1.5 h-4 w-4" />
                                )}
                                Test print
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {remoteNode ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
                        <span>
                          Desired v{remoteNode.desiredConfigVersion} · Applied {remoteNode.lastAppliedVersion ?? "never"} · Last seen {formatDate(remoteNode.lastSeenAt || undefined)}
                        </span>
                        {remoteNode.statusMessage ? (
                          <span
                            className={
                              remoteNode.status === "DEGRADED" || remoteNode.status === "ERROR"
                                ? "text-destructive"
                                : "text-foreground"
                            }
                          >
                            {remoteNode.statusMessage}
                          </span>
                        ) : null}
                        {remoteNode.config?.lastConfigAck ? (
                          <span className="text-foreground">
                            {remoteNode.config.lastConfigAck.message || "OK, got it."} - Received {formatDate(remoteNode.config.lastConfigAck.receivedAt)}
                          </span>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={handleRotateNodeToken} disabled={savingNode}>
                          Rotate token
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
                        No saved remote-node config exists for this venue yet. Save node to create and publish one.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-destructive/30 bg-destructive/5">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base text-destructive">
                          <Trash2 className="h-4 w-4" />
                          Danger Zone
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Delete historical operational data for {selectedStore.name}.
                        </CardDescription>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setHistoryDialogOpen(true)}
                        disabled={purgingHistory}
                      >
                        {purgingHistory ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete history
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Removes orders, order items, table visit history, locality approvals,
                      waiter shifts, kitchen ticket counters, audit/event history, and node
                      event history. Menu, staff accounts, tables, QR tiles, printers, and
                      venue settings stay intact.
                    </p>
                  </CardContent>
                </Card>
                </TabsContent>
              </Tabs>
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
                              setActiveTab("settings");
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
        open={storeDialogOpen}
        onOpenChange={(open) => {
          setStoreDialogOpen(open);
          if (!open && !creatingStore) {
            setStoreOnboardForm(defaultStoreOnboardForm());
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Onboard Venue</DialogTitle>
            <DialogDescription>
              Creates the venue, baseline staff accounts, tables and default
              printer topic.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="store-name">Venue name</Label>
              <Input
                id="store-name"
                value={storeOnboardForm.name}
                onChange={(event) => handleStoreNameChange(event.target.value)}
                placeholder="Noor"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-slug">Store slug</Label>
              <Input
                id="store-slug"
                value={storeOnboardForm.slug}
                onChange={(event) =>
                  updateStoreOnboardField("slug", slugifyStore(event.target.value))
                }
                placeholder="noor"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-password">Default staff password</Label>
              <Input
                id="store-password"
                type="password"
                value={storeOnboardForm.defaultPassword}
                onChange={(event) =>
                  updateStoreOnboardField("defaultPassword", event.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-tables">Tables</Label>
              <Input
                id="store-tables"
                type="number"
                min={1}
                max={200}
                value={storeOnboardForm.tableCount ?? 10}
                onChange={(event) =>
                  updateStoreOnboardField(
                    "tableCount",
                    Number(event.target.value || 10)
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-printer-topic">Printer topic suffix</Label>
              <Input
                id="store-printer-topic"
                value={storeOnboardForm.printerTopic || ""}
                onChange={(event) =>
                  updateStoreOnboardField("printerTopic", event.target.value)
                }
                placeholder="printer_1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-locale">Locale</Label>
              <Input
                id="store-locale"
                value={storeOnboardForm.locale || "el"}
                onChange={(event) =>
                  updateStoreOnboardField("locale", event.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-manager-email">Manager email</Label>
              <Input
                id="store-manager-email"
                type="email"
                value={storeOnboardForm.managerEmail || ""}
                onChange={(event) =>
                  updateStoreOnboardField("managerEmail", event.target.value)
                }
                placeholder={`manager@${storeOnboardForm.slug || "venue"}.local`}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-waiter-email">Waiter email</Label>
              <Input
                id="store-waiter-email"
                type="email"
                value={storeOnboardForm.waiterEmail || ""}
                onChange={(event) =>
                  updateStoreOnboardField("waiterEmail", event.target.value)
                }
                placeholder={`waiter@${storeOnboardForm.slug || "venue"}.local`}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="store-cook-email">Cook email</Label>
              <Input
                id="store-cook-email"
                type="email"
                value={storeOnboardForm.cookEmail || ""}
                onChange={(event) =>
                  updateStoreOnboardField("cookEmail", event.target.value)
                }
                placeholder={`cook@${storeOnboardForm.slug || "venue"}.local`}
              />
            </div>
            {!canCreateStore ? (
              <p className="text-xs text-destructive md:col-span-2">
                Name, valid slug and an 8+ character password are required.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStoreDialogOpen(false)}
              disabled={creatingStore}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateStore()}
              disabled={!canCreateStore || creatingStore}
            >
              {creatingStore ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="mr-2 h-4 w-4" />
              )}
              Create venue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={storeUserDialogOpen}
        onOpenChange={(open) => {
          setStoreUserDialogOpen(open);
          if (!open && !savingStoreUser) resetStoreUserForm();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingStoreUserId ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              {editingStoreUserId
                ? "Update staff details. Use Reset pass from the table to set password to 1234."
                : "Create staff access for the selected store."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                value={storeUserForm.email}
                onChange={(event) =>
                  setStoreUserForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="staff@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>Display name</Label>
              <Input
                value={storeUserForm.displayName}
                onChange={(event) =>
                  setStoreUserForm((current) => ({ ...current, displayName: event.target.value }))
                }
                placeholder="Floor staff"
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select
                value={storeUserForm.role}
                onValueChange={(value) =>
                  setStoreUserForm((current) => ({ ...current, role: value as StoreUserRoleInput }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="WAITER">Waiter</SelectItem>
                  <SelectItem value="HYBRID">Hybrid waiter + cook</SelectItem>
                  <SelectItem value="COOK">Cook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!editingStoreUserId ? (
              <div className="grid gap-2">
                <Label>Initial password</Label>
                <Input
                  type="password"
                  value={storeUserForm.password}
                  onChange={(event) =>
                    setStoreUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Required"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoreUserDialogOpen(false)} disabled={savingStoreUser}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveStoreUser()} disabled={savingStoreUser}>
              {savingStoreUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingStoreUserId ? "Update user" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyDialogOpen}
        onOpenChange={(open) => {
          setHistoryDialogOpen(open);
          if (!open && !purgingHistory) setHistoryConfirmation("");
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete venue history?</DialogTitle>
            <DialogDescription>
              This permanently deletes historical data for {selectedStore?.name ?? "this venue"}.
              Current setup, menu, staff, tables, QR tiles, printers, and node config are kept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">This cannot be undone.</p>
              <p className="mt-1 text-muted-foreground">
                Type the exact phrase below to confirm:
              </p>
              <code className="mt-2 block rounded bg-background px-3 py-2 font-mono text-sm">
                {historyConfirmationPhrase}
              </code>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="history-confirmation">Confirmation phrase</Label>
              <Input
                id="history-confirmation"
                value={historyConfirmation}
                onChange={(event) => setHistoryConfirmation(event.target.value)}
                placeholder={historyConfirmationPhrase}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHistoryDialogOpen(false)}
              disabled={purgingHistory}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handlePurgeHistory()}
              disabled={
                purgingHistory ||
                !historyConfirmationPhrase ||
                historyConfirmation !== historyConfirmationPhrase
              }
            >
              {purgingHistory ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete history permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setGenerateCount(generateScope === "pool" ? 20 : 10);
            setGenerateMethod("random");
            setManualPublicCode("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {generateScope === "pool"
                ? "Create global QR codes"
                : `Create QR codes for ${selectedStore?.name ?? "store"}`}
            </DialogTitle>
            <DialogDescription>
              {generateScope === "pool"
                ? "These QR codes stay unbound until you attach them to a store."
                : "These QR codes are born inside the selected store and only need table binding."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Tabs
              value={generateMethod}
              onValueChange={(value) => setGenerateMethod(value as GenerateMethod)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="random">Random batch</TabsTrigger>
                <TabsTrigger value="manual">Manual code</TabsTrigger>
              </TabsList>
              <TabsContent value="random" className="mt-4 grid gap-2">
                <Label htmlFor="generate-count">How many QR codes</Label>
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
              </TabsContent>
              <TabsContent value="manual" className="mt-4 grid gap-2">
                <Label htmlFor="manual-public-code">QR code</Label>
                <Input
                  id="manual-public-code"
                  value={manualPublicCode}
                  onChange={(event) => setManualPublicCode(event.target.value.toUpperCase())}
                  placeholder="GT-ABCD-1234"
                  className="font-mono uppercase"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the exact code printed on the QR tile. Format: GT-XXXX-XXXX.
                </p>
              </TabsContent>
            </Tabs>
            {!canGenerate ? (
              <p className="text-xs text-destructive">
                {generateMethod === "manual"
                  ? "Enter a valid code in the format GT-XXXX-XXXX."
                  : `Enter a number between 1 and ${MAX_GENERATE_COUNT}.`}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleBulkCreate()} disabled={!canGenerate}>
              <Plus className="mr-2 h-4 w-4" />
              {generateMethod === "manual" ? "Create exact code" : "Generate"}
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
                  includeMargin={true}
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
