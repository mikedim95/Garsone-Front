import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Loader2, Plus, QrCode, RefreshCcw, Trash2, Search, Link as LinkIcon, Settings, Grid3X3, Printer, Building2, ChevronDown } from 'lucide-react';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { ManagerTableSummary, OrderingMode, QRTile, StoreInfo, StoreOverview } from '@/types';
import { DashboardCardSkeleton, DashboardGridSkeleton } from '@/components/ui/dashboard-skeletons';
import { PageTransition } from '@/components/ui/page-transition';

type StoreOption = Pick<StoreInfo, 'id' | 'name' | 'slug' | 'orderingMode' | 'printers'>;

const OVERVIEW_STORE_ID = '__overview__';
const QR_CODE_REGEX = /^GT-[0-9A-HJKMNPQRSTVWXYZ]{4}-[0-9A-HJKMNPQRSTVWXYZ]{4}$/;
const MAX_MANUAL_CODES = 500;

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const buildSparkline = (store: StoreOverview, points = 12) => {
  const base =
    store.usersCount * 0.6 + store.tilesCount * 0.25 + store.ordersCount * 0.15;
  const seed = (store.slug ?? store.id).length + base;
  const values = Array.from({ length: points }, (_, i) => {
    const wave = Math.sin((i / (points - 1)) * Math.PI * 2 + seed) * 0.35 + 0.6;
    const ramp = (i / (points - 1)) * 0.15;
    const intensity = Math.min(1, base / 200 + 0.35);
    const value = (wave + ramp) * intensity;
    return Math.max(0.08, Math.min(0.95, value));
  });
  return values;
};

const sparklinePath = (values: number[], width = 320, height = 80, padding = 6) => {
  if (values.length === 0) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = padding + index * step;
      const y =
        padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};


export default function ArchitectQrTiles() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuthStore();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'tiles' | 'settings' | 'overview'>('tiles');
  const [tiles, setTiles] = useState<QRTile[]>([]);
  const [tables, setTables] = useState<ManagerTableSummary[]>([]);
  const [recentTiles, setRecentTiles] = useState<QRTile[]>([]);
  const [overview, setOverview] = useState<StoreOverview[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [collapsedOverview, setCollapsedOverview] = useState<Record<string, boolean>>({});
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingTiles, setLoadingTiles] = useState(false);
  const storesLoading = loadingStores && stores.length === 0;
  const tilesLoading = loadingTiles && tiles.length === 0;
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualCodes, setManualCodes] = useState<string>('');
  const [updatingTileId, setUpdatingTileId] = useState<string | null>(null);
  const [updatingMode, setUpdatingMode] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [codeSearch, setCodeSearch] = useState('');
  const [previewQr, setPreviewQr] = useState<{ code: string; url: string } | null>(null);
  const [publicResolverBase, setPublicResolverBase] = useState<string>('');
  const [storeOrderingMode, setStoreOrderingMode] = useState<OrderingMode>('qr');
  const [printers, setPrinters] = useState<string[]>([]);
  const [savingPrinters, setSavingPrinters] = useState(false);

  const isArchitect = user?.role === 'architect';
  const isAllowed = isArchitect;
  const isOverview = selectedStoreId === OVERVIEW_STORE_ID;

  const parsedCodes = useMemo(
    () =>
      manualCodes
        .split(/[\s,]+/)
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    [manualCodes]
  );
  const uniqueCodes = useMemo(
    () => Array.from(new Set(parsedCodes)),
    [parsedCodes]
  );
  const duplicateCodes = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const code of parsedCodes) {
      if (seen.has(code)) duplicates.add(code);
      seen.add(code);
    }
    return Array.from(duplicates);
  }, [parsedCodes]);
  const invalidCodes = useMemo(
    () => parsedCodes.filter((code) => !QR_CODE_REGEX.test(code)),
    [parsedCodes]
  );
  const tooManyCodes = uniqueCodes.length > MAX_MANUAL_CODES;
  const canSubmitCodes =
    uniqueCodes.length > 0 &&
    invalidCodes.length === 0 &&
    duplicateCodes.length === 0 &&
    !tooManyCodes;

  useEffect(() => {
    if (!isAuthenticated() || !isAllowed) {
      navigate('/login');
    }
  }, [isAuthenticated, isAllowed, navigate]);

  const loadStores = useCallback(async () => {
    try {
      setLoadingStores(true);
      const res = await api.adminListStores();
      const list = res.stores ?? [];
      if (list.length > 0) {
        setStores(list);
        if (!selectedStoreId || (!isOverview && !list.some((s) => s.id === selectedStoreId))) {
          setSelectedStoreId(list[0].id);
        }
        if (!isOverview) {
          const selected = list.find((s) => s.id === selectedStoreId) ?? list[0];
          setStoreOrderingMode((selected as StoreOption | undefined)?.orderingMode ?? 'qr');
          setPrinters((selected as any)?.printers ?? []);
        }
        return;
      }
    } catch (error) {
      console.error('Failed to load stores', error);
      toast({
        variant: 'destructive',
        title: 'Unable to load stores',
        description: 'Check your permissions or connection.',
      });
    } finally {
      setLoadingStores(false);
    }

    try {
      const fallback = await api.getStore();
      if (fallback?.store?.id) {
        const store: StoreOption = {
          id: fallback.store.id,
          name: fallback.store.name,
          slug: fallback.store.slug,
        };
        setStores([store]);
        setSelectedStoreId(store.id);
        setPrinters((store as any)?.printers ?? []);
      }
    } catch {
      // ignore
    }
  }, [isOverview, selectedStoreId, toast]);

  const refreshTiles = useCallback(
    async (storeId: string) => {
      try {
        setLoadingTiles(true);
        setRefreshing(true);
        const [tilesRes, tablesRes] = await Promise.all([
          api.adminListQrTiles(storeId),
          api.adminListStoreTables(storeId),
        ]);
        setTiles(tilesRes.tiles ?? []);
        setTables(tablesRes.tables ?? []);
      } catch (error) {
        console.error('Failed to load QR tiles', error);
        toast({
          variant: 'destructive',
          title: 'Failed to load QR tiles',
          description: error instanceof ApiError ? error.message : 'Try again in a moment.',
        });
      } finally {
        setLoadingTiles(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  const loadOverview = useCallback(async () => {
    try {
      setOverviewLoading(true);
      const res = await api.adminListStoreOverview();
      setOverview(res.stores ?? []);
    } catch (error) {
      console.error('Failed to load store overview', error);
      toast({
        variant: 'destructive',
        title: 'Failed to load overview',
        description: error instanceof ApiError ? error.message : 'Try again in a moment.',
      });
    } finally {
      setOverviewLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStores();
    const baseEnv = (import.meta.env.VITE_PUBLIC_CODE_BASE as string | undefined)?.trim();
    let derived = baseEnv && baseEnv.length > 0 ? baseEnv : '';
    if (!derived && typeof window !== 'undefined') {
      derived = `${window.location.origin.replace(/\/$/, '')}/q`;
    }
    if (!derived) {
      const originEnv = (import.meta.env.VITE_PUBLIC_BASE_ORIGIN as string | undefined)?.trim();
      const origin = originEnv && originEnv.length > 0 ? originEnv.replace(/\/$/, '') : 'http://localhost:5173';
      derived = `${origin}/q`;
    }
    setPublicResolverBase(derived.replace(/\/$/, ''));
  }, [loadStores]);

  useEffect(() => {
    if (isOverview) {
      if (activeTab !== 'overview') setActiveTab('overview');
      loadOverview();
      return;
    }
    if (activeTab === 'overview') setActiveTab('tiles');
    if (selectedStoreId) {
      refreshTiles(selectedStoreId);
      const mode = stores.find((s) => s.id === selectedStoreId)?.orderingMode ?? 'qr';
      setStoreOrderingMode(mode as OrderingMode);
      const selectedStore = stores.find((s) => s.id === selectedStoreId) as any;
      setPrinters(selectedStore?.printers ?? []);
    }
  }, [activeTab, isOverview, loadOverview, refreshTiles, selectedStoreId, stores]);

  useEffect(() => {
    setRecentTiles([]);
  }, [selectedStoreId]);

  const storeName = useMemo(() => {
    if (isOverview) return 'All Stores';
    return stores.find((s) => s.id === selectedStoreId)?.name;
  }, [isOverview, stores, selectedStoreId]);
  const buildPublicUrl = useCallback(
    (code: string) => {
      const base = (publicResolverBase || 'https://www.garsone.gr/q').replace(/\/$/, '');
      return `${base}/${code}`;
    },
    [publicResolverBase]
  );

  const handleUpdateTile = async (tileId: string, data: Partial<QRTile>) => {
    try {
      setUpdatingTileId(tileId);
      const res = await api.adminUpdateQrTile(tileId, {
        tableId: data.tableId ?? null,
        isActive: data.isActive,
        label: data.label,
      });
      const next = res.tile;
      setTiles((prev) => {
        const existing = prev.find((t) => t.id === next.id);
        if (existing) {
          return prev.map((t) => (t.id === next.id ? { ...t, ...next } : t));
        }
        return [next, ...prev];
      });
    } catch (error) {
      console.error('Failed to update tile', error);
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error instanceof ApiError ? error.message : 'Could not update QR tile.',
      });
    } finally {
      setUpdatingTileId(null);
    }
  };

  const handleBulkCreate = async () => {
    if (!selectedStoreId) return;
    if (uniqueCodes.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No codes provided',
        description: 'Paste one or more GT-XXXX-XXXX codes.',
      });
      return;
    }
    if (tooManyCodes) {
      toast({
        variant: 'destructive',
        title: 'Too many codes',
        description: `Maximum ${MAX_MANUAL_CODES} codes per batch.`,
      });
      return;
    }
    if (invalidCodes.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid code format',
        description: 'Use GT-XXXX-XXXX with A-Z (no I,L,O,U) and 0-9.',
      });
      return;
    }
    if (duplicateCodes.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Duplicate codes',
        description: 'Remove duplicates before submitting.',
      });
      return;
    }
    try {
      const created = await api.adminBulkCreateQrTiles(selectedStoreId, {
        codes: uniqueCodes,
      });
      setDialogOpen(false);
      setManualCodes('');
      setRecentTiles(created.tiles ?? []);
      setTiles((prev) => [...(created.tiles ?? []), ...prev]);
      toast({ title: 'QR tiles added', description: `${created.tiles?.length ?? 0} new tiles ready.` });
    } catch (error) {
      console.error('Bulk creation failed', error);
      toast({
        variant: 'destructive',
        title: 'Bulk creation failed',
        description: error instanceof ApiError ? error.message : 'Please retry.',
      });
    }
  };

  const copyText = async (text: string) => {
    try {
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        toast({ variant: 'destructive', title: 'Copy failed', description: 'Clipboard is unavailable.' });
        return false;
      }
      await clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Clipboard copy failed', error);
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Clipboard is unavailable.' });
      return false;
    }
  };

  const copyTileCode = async (code: string) => {
    const ok = await copyText(code);
    if (ok) {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1200);
    }
  };

  const copyTileUrl = async (code: string) => {
    const url = buildPublicUrl(code);
    const ok = await copyText(url);
    if (ok) {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1200);
    }
  };

  const handleSavePrinters = async () => {
    if (!selectedStoreId) return;
    const cleaned = Array.from(new Set(printers.map((p) => p.trim()).filter(Boolean)));
    setSavingPrinters(true);
    try {
      const res = await api.adminUpdateStorePrinters(selectedStoreId, cleaned);
      const updatedPrinters = (res.store as any)?.printers ?? [];
      setPrinters(updatedPrinters);
      setStores((prev) =>
        prev.map((s) => (s.id === selectedStoreId ? { ...s, printers: updatedPrinters } : s))
      );
      toast({ title: 'Printers saved', description: 'Updated printer topics for this venue.' });
    } catch (error) {
      console.error('Failed to save printers', error);
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof ApiError ? error.message : 'Try again.',
      });
    } finally {
      setSavingPrinters(false);
    }
  };

  const copyRecentAsCsv = async (asCsv: boolean) => {
    if (!recentTiles.length) return;
    const header = asCsv ? 'publicCode,label,tableLabel' : 'publicCode';
    const lines = recentTiles.map((tile) =>
      asCsv
        ? `${tile.publicCode},"${tile.label ?? ''}","${tile.tableLabel ?? ''}"`
        : `${tile.publicCode}${tile.label ? ` — ${tile.label}` : ''}`
    );
    const body = [header, ...lines].join('\n');
    await copyText(body);
    toast({ title: asCsv ? 'CSV copied' : 'Codes copied' });
  };

  const handleDeleteTile = async (id: string) => {
    try {
      await api.adminDeleteQrTile(id);
      setTiles((prev) => prev.filter((t) => t.id !== id));
      setRecentTiles((prev) => prev.filter((t) => t.id !== id));
      toast({ title: 'Tile deleted' });
    } catch (error) {
      console.error('Failed to delete tile', error);
      toast({ variant: 'destructive', title: 'Delete failed' });
    }
  };

  const filteredTiles = useMemo(() => {
    const term = codeSearch.trim().toLowerCase();
    if (!term) return tiles;
    return tiles.filter((tile) => tile.publicCode.toLowerCase().includes(term));
  }, [tiles, codeSearch]);

  const handleModeChange = (val: string) => {
    const next = val as OrderingMode;
    if (!selectedStoreId) return;
    setUpdatingMode(true);
    api
      .adminUpdateStoreOrderingMode(selectedStoreId, next)
      .then(() => {
        setStoreOrderingMode(next);
        setStores((prev) =>
          prev.map((s) =>
            s.id === selectedStoreId ? { ...s, orderingMode: next } : s
          )
        );
        toast({
          title: 'Venue mode updated',
          description:
            next === 'waiter'
              ? 'Guests can browse; waiters place orders.'
              : 'Guests can place their own orders.',
        });
      })
      .catch((error) => {
        console.error('Failed to update ordering mode', error);
        toast({
          variant: 'destructive',
          title: 'Update failed',
          description: error instanceof ApiError ? error.message : 'Try again.',
        });
      })
      .finally(() => setUpdatingMode(false));
  };

  const handleRefresh = () => {
    if (isOverview) {
      void loadOverview();
      return;
    }
    if (selectedStoreId) {
      void refreshTiles(selectedStoreId);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        supertitle="Admin"
        title="QR Architect"
        subtitle={
          isOverview
            ? 'Overview of all venues'
            : storeName
              ? `Managing ${storeName}`
              : 'Add & assign QR tiles'
        }
        icon="🏗️"
        tone="secondary"
        rightContent={
          storesLoading ? (
            <div className="h-9 w-48 bg-muted/50 rounded animate-pulse" />
          ) : (
            <Select
              value={selectedStoreId}
              onValueChange={(value) => {
                setSelectedStoreId(value);
                if (value === OVERVIEW_STORE_ID) {
                  setActiveTab('overview');
                } else if (activeTab === 'overview') {
                  setActiveTab('tiles');
                }
              }}
              disabled={loadingStores || stores.length === 0}
            >
              <SelectTrigger className="w-48 h-9 text-sm bg-card border-border/50">
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERVIEW_STORE_ID}>
                  All Stores Overview
                </SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        burgerActions={
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleRefresh}
              disabled={refreshing || overviewLoading}
            >
              {refreshing || overviewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              {isOverview ? 'Refresh overview' : 'Refresh data'}
            </Button>
            <Button
              size="sm"
              className="w-full justify-start"
              onClick={() => setDialogOpen(true)}
              disabled={isOverview}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add tiles
            </Button>
          </div>
        }
      />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            const next = val as 'tiles' | 'settings' | 'overview';
            if (next === 'overview' && !isOverview) return;
            setActiveTab(next);
          }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList className="bg-muted/50 p-1">
              {isOverview ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-background shadow-sm text-sm font-medium">
                  <Building2 className="h-4 w-4" />
                  Overview
                </div>
              ) : (
                <>
                  <TabsTrigger value="tiles" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <Grid3X3 className="h-4 w-4" />
                    QR Tiles
                    {tiles.length > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {tiles.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <Settings className="h-4 w-4" />
                    Settings
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing || overviewLoading}
              >
                {refreshing || overviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              </Button>
              {!isOverview && (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              )}
            </div>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            {overviewLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <DashboardCardSkeleton key={idx} className="w-full" />
                ))}
              </div>
            ) : overview.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No store data available</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Refresh to load the latest overview.</p>
                  <Button className="mt-4" variant="outline" onClick={handleRefresh}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Refresh overview
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {overview.map((store) => {
                  const isCollapsed = collapsedOverview[store.id] ?? false;
                  const chartValues = buildSparkline(store);
                  const chartPath = sparklinePath(chartValues);
                  const areaPath = chartPath ? `${chartPath} L 320 80 L 0 80 Z` : '';
                  return (
                    <Collapsible
                      key={store.id}
                      open={!isCollapsed}
                      onOpenChange={(open) =>
                        setCollapsedOverview((prev) => ({ ...prev, [store.id]: !open }))
                      }
                    >
                      <Card className="border-border/70 w-full">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-primary" />
                                {store.name}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                {store.slug ?? '-'}
                              </CardDescription>
                            </div>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 px-2">
                                <span className="text-xs text-muted-foreground">
                                  {isCollapsed ? 'Show metrics' : 'Hide metrics'}
                                </span>
                                <ChevronDown
                                  className={`ml-1 h-4 w-4 transition-transform ${
                                    isCollapsed ? '' : 'rotate-180'
                                  }`}
                                />
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                        </CardHeader>
                        <CollapsibleContent>
                          <CardContent className="pt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                                <p className="text-xs text-muted-foreground">Users</p>
                                <p className="text-2xl font-semibold">{store.usersCount}</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                                <p className="text-xs text-muted-foreground">Tiles</p>
                                <p className="text-2xl font-semibold">{store.tilesCount}</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                                <p className="text-xs text-muted-foreground">Orders</p>
                                <p className="text-2xl font-semibold">{store.ordersCount}</p>
                              </div>
                            </div>
                            <div className="mt-4 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 via-background to-muted/40 p-3">
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                <span>Activity trend</span>
                                <span>Last 12 points</span>
                              </div>
                              <svg
                                viewBox="0 0 320 80"
                                width="100%"
                                height="80"
                                preserveAspectRatio="none"
                                className="block"
                              >
                                <defs>
                                  <linearGradient id={`venue-line-${store.id}`} x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
                                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                                  </linearGradient>
                                  <linearGradient id={`venue-fill-${store.id}`} x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <path
                                  d={areaPath}
                                  fill={`url(#venue-fill-${store.id})`}
                                />
                                <path
                                  d={chartPath}
                                  fill="none"
                                  stroke={`url(#venue-line-${store.id})`}
                                  strokeWidth="2"
                                />
                              </svg>
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* QR Tiles Tab */}
          <TabsContent value="tiles" className="space-y-4 mt-0">
            {/* Search bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code..."
                  value={codeSearch}
                  onChange={(e) => setCodeSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <span className="text-sm text-muted-foreground">
                {filteredTiles.length} tile{filteredTiles.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Recent tiles panel */}
            {recentTiles.length > 0 && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Just added</CardTitle>
                      <Badge variant="secondary" className="text-xs">{recentTiles.length} new</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyRecentAsCsv(false)}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Codes
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyRecentAsCsv(true)}>
                        CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-32">
                    <div className="flex flex-wrap gap-2">
                      {recentTiles.map((tile) => (
                        <button
                          key={tile.id}
                          onClick={() => copyTileCode(tile.publicCode)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background border border-border/50 text-sm font-mono hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        >
                          {tile.publicCode}
                          {copiedCode === tile.publicCode ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Tiles table */}
            <Card>
              <CardContent className="p-0">
                {tilesLoading ? (
                  <div className="p-6">
                    <DashboardGridSkeleton count={4} className="grid gap-3" />
                  </div>
                ) : filteredTiles.length === 0 ? (
                  <div className="py-16 text-center">
                    <QrCode className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No QR tiles found</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">Add tiles to get started</p>
                    <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add tiles
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="font-medium">Code</TableHead>
                          <TableHead className="font-medium">Table</TableHead>
                          <TableHead className="font-medium hidden md:table-cell">QR</TableHead>
                          <TableHead className="font-medium text-center w-20">Active</TableHead>
                          <TableHead className="font-medium text-right hidden sm:table-cell">Created</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTiles.map((tile) => (
                          <TableRow key={tile.id} className="group">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded">
                                  {tile.publicCode}
                                </code>
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => copyTileCode(tile.publicCode)}
                                  >
                                    {copiedCode === tile.publicCode ? (
                                      <Check className="h-3.5 w-3.5 text-green-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => copyTileUrl(tile.publicCode)}
                                  >
                                    <LinkIcon className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={tile.tableId ?? 'unassigned'}
                                onValueChange={(value) =>
                                  handleUpdateTile(tile.id, { tableId: value === 'unassigned' ? null : value })
                                }
                              >
                                <SelectTrigger className="w-40 h-8 text-sm">
                                  <SelectValue>
                                    {tile.tableLabel ?? <span className="text-muted-foreground">Unassigned</span>}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {tables.map((table) => (
                                    <SelectItem key={table.id} value={table.id}>
                                      {table.label} {table.isActive ? '' : '(inactive)'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                                className="block rounded border border-border/50 bg-white p-0.5 hover:border-primary/50 hover:shadow-sm transition-all"
                              >
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
                                    buildPublicUrl(tile.publicCode)
                                  )}`}
                                  alt={`QR for ${tile.publicCode}`}
                                  className="h-10 w-10"
                                  loading="lazy"
                                />
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={tile.isActive}
                                onCheckedChange={(checked) => handleUpdateTile(tile.id, { isActive: checked })}
                                disabled={updatingTileId === tile.id}
                              />
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                              {formatDate(tile.createdAt || tile.updatedAt)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteTile(tile.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4 mt-0">
            {/* Ordering Mode */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" />
                      Ordering Mode
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Control how guests interact with the menu
                    </CardDescription>
                  </div>
                  <Select
                    value={storeOrderingMode}
                    onValueChange={handleModeChange}
                    disabled={!selectedStoreId || updatingMode}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qr">
                        <span className="flex flex-col items-start">
                          <span>Self-order</span>
                        </span>
                      </SelectItem>
                      <SelectItem value="waiter">
                        <span className="flex flex-col items-start">
                          <span>Browse-only</span>
                        </span>
                      </SelectItem>
                      <SelectItem value="hybrid">
                        <span className="flex flex-col items-start">
                          <span>Hybrid</span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-4 text-sm">
                  <div className={`flex-1 p-3 rounded-lg border transition-colors ${storeOrderingMode === 'qr' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-transparent'}`}>
                    <p className="font-medium">Self-order</p>
                    <p className="text-muted-foreground text-xs mt-0.5">Guests order directly from their phone</p>
                  </div>
                  <div className={`flex-1 p-3 rounded-lg border transition-colors ${storeOrderingMode === 'waiter' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-transparent'}`}>
                    <p className="font-medium">Browse-only</p>
                    <p className="text-muted-foreground text-xs mt-0.5">Guests browse, waiters submit orders</p>
                  </div>
                  <div className={`flex-1 p-3 rounded-lg border transition-colors ${storeOrderingMode === 'hybrid' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-transparent'}`}>
                    <p className="font-medium">Hybrid</p>
                    <p className="text-muted-foreground text-xs mt-0.5">Both modes available</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Printers */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Printer className="h-4 w-4 text-primary" />
                      Printers
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Configure printer topics for order routing
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPrinters((prev) => [...prev, ''])}
                      disabled={!selectedStoreId}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSavePrinters}
                      disabled={!selectedStoreId || savingPrinters}
                    >
                      {savingPrinters && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {printers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Printer className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No printers configured</p>
                    <p className="text-xs mt-0.5">Add printer topics for routing orders</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {printers.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={p}
                          onChange={(e) =>
                            setPrinters((prev) => prev.map((val, i) => (i === idx ? e.target.value : val)))
                          }
                          placeholder={`printer_${idx + 1}`}
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={() => setPrinters((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setManualCodes('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add QR tiles</DialogTitle>
            <DialogDescription>Paste GT-XXXX-XXXX codes to register them</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="tile-codes" className="text-sm font-medium">
              QR codes
            </Label>
            <Textarea
              id="tile-codes"
              rows={6}
              value={manualCodes}
              onChange={(e) => setManualCodes(e.target.value)}
              placeholder="GT-AB12-CD34\nGT-EF56-GH78"
              className="mt-2 font-mono"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{uniqueCodes.length} code{uniqueCodes.length === 1 ? '' : 's'} ready</span>
              <span>Max {MAX_MANUAL_CODES} per batch</span>
            </div>
            {invalidCodes.length > 0 && (
              <p className="text-xs text-destructive mt-2">
                Invalid format detected. Use GT-XXXX-XXXX with A-Z (no I,L,O,U) and 0-9.
              </p>
            )}
            {duplicateCodes.length > 0 && (
              <p className="text-xs text-destructive mt-1">
                Duplicate codes found. Remove duplicates before submitting.
              </p>
            )}
            {tooManyCodes && (
              <p className="text-xs text-destructive mt-1">
                Too many codes. Maximum {MAX_MANUAL_CODES} per batch.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkCreate} disabled={!canSubmitCodes}>
              <Plus className="mr-2 h-4 w-4" />
              Add tiles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Preview Dialog */}
      <Dialog open={Boolean(previewQr)} onOpenChange={(open) => !open && setPreviewQr(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono">{previewQr?.code}</DialogTitle>
            <DialogDescription className="text-xs break-all">{previewQr?.url}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-6">
            {previewQr && (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
                  previewQr.url
                )}`}
                alt={`QR for ${previewQr.code}`}
                className="h-56 w-56 rounded-lg border border-border bg-white p-2"
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => copyTileUrl(previewQr?.code || '')}>
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
