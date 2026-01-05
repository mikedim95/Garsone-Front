import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Loader2, Plus, QrCode, RefreshCcw, Trash2, Search, Link as LinkIcon } from 'lucide-react';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { api, ApiError, API_BASE } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { ManagerTableSummary, QRTile, StoreInfo } from '@/types';
import { DashboardGridSkeleton } from '@/components/ui/dashboard-skeletons';
import { PageTransition } from '@/components/ui/page-transition';

type StoreOption = Pick<StoreInfo, 'id' | 'name' | 'slug'>;

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

export default function ArchitectQrTiles() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuthStore();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [tiles, setTiles] = useState<QRTile[]>([]);
  const [tables, setTables] = useState<ManagerTableSummary[]>([]);
  const [recentTiles, setRecentTiles] = useState<QRTile[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingTiles, setLoadingTiles] = useState(false);
  const storesLoading = loadingStores && stores.length === 0;
  const tilesLoading = loadingTiles && tiles.length === 0;
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [count, setCount] = useState<string>('12');
  const [labelPrefix, setLabelPrefix] = useState<string>(''); // unused now, kept for compatibility
  const [updatingTileId, setUpdatingTileId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [codeSearch, setCodeSearch] = useState('');
  const [previewQr, setPreviewQr] = useState<{ code: string; url: string } | null>(null);
  const [publicResolverBase, setPublicResolverBase] = useState<string>('');

  const isArchitect = user?.role === 'architect';
  const isAllowed = isArchitect;

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
        if (!selectedStoreId) {
          setSelectedStoreId(list[0].id);
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

    // Fallback to current store if admin endpoint is empty
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
      }
    } catch {
      // ignore, already surfaced toast
    }
  }, [selectedStoreId, toast]);

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

  useEffect(() => {
    loadStores();
    const baseEnv = (import.meta.env.VITE_PUBLIC_CODE_BASE as string | undefined)?.trim();
    let derived = baseEnv && baseEnv.length > 0 ? baseEnv : '';
    if (!derived && typeof window !== 'undefined') {
      derived = `${window.location.origin.replace(/\/$/, '')}/publiccode`;
    }
    if (!derived) {
      const originEnv = (import.meta.env.VITE_PUBLIC_BASE_ORIGIN as string | undefined)?.trim();
      const origin = originEnv && originEnv.length > 0 ? originEnv.replace(/\/$/, '') : 'http://localhost:5173';
      derived = `${origin}/publiccode`;
    }
    setPublicResolverBase(derived.replace(/\/$/, ''));
  }, [loadStores]);

  useEffect(() => {
    if (selectedStoreId) {
      refreshTiles(selectedStoreId);
    }
  }, [selectedStoreId, refreshTiles]);

  useEffect(() => {
    setRecentTiles([]);
  }, [selectedStoreId]);

  const storeName = useMemo(() => stores.find((s) => s.id === selectedStoreId)?.name, [stores, selectedStoreId]);
  const buildPublicUrl = useCallback(
    (code: string) => {
      const base = (publicResolverBase || 'https://www.garsone.gr/publiccode').replace(/\/$/, '');
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
    const numericCount = Math.max(1, Math.min(500, Number(count) || 0));
    if (!selectedStoreId) return;
    try {
      const created = await api.adminBulkCreateQrTiles(selectedStoreId, {
        count: numericCount,
      });
      setDialogOpen(false);
      setRecentTiles(created.tiles ?? []);
      setTiles((prev) => [...(created.tiles ?? []), ...prev]);
      toast({ title: 'QR tiles created', description: `${created.tiles?.length ?? 0} new tiles ready.` });
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

  const headerStoreTitle =
    storeName ||
    (() => {
      try {
        return localStorage.getItem('STORE_NAME');
      } catch {
        return null;
      }
    })() ||
    'QR Tile Architect';

  return (
    <PageTransition className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        supertitle="QR Tile Architect"
        title={headerStoreTitle}
        subtitle={storeName ? `Managing ${storeName}` : 'Generate & assign QR tiles'}
        icon="🎛️"
        tone="secondary"
        rightContent={
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="bg-secondary/40 border-secondary/50">
              {isArchitect ? 'Architect' : 'Manager'}
            </Badge>
            {selectedStoreId && (
              <span className="font-medium text-foreground/80">Store ID: {selectedStoreId.slice(0, 8)}…</span>
            )}
          </div>
        }
        burgerActions={
          <div className="flex items-center gap-2 text-xs">
            <Button variant="outline" size="sm" onClick={() => selectedStoreId && refreshTiles(selectedStoreId)} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Generate QR tiles
            </Button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <QrCode className="h-5 w-5 text-primary" />
                Store scope
              </CardTitle>
              <CardDescription>Choose a venue to inspect and manage its QR tiles.</CardDescription>
            </div>
            {storesLoading ? (
              <DashboardGridSkeleton count={2} className="w-full grid sm:grid-cols-2" />
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search code"
                    value={codeSearch}
                    onChange={(e) => setCodeSearch(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="store-select">Store</Label>
                  <Select
                    value={selectedStoreId}
                    onValueChange={(value) => setSelectedStoreId(value)}
                    disabled={loadingStores || stores.length === 0}
                  >
                    <SelectTrigger id="store-select" className="w-64">
                      <SelectValue placeholder="Select store" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name} {store.slug ? `(${store.slug})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={loadStores} disabled={loadingStores}>
                  {loadingStores ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Reload stores
                </Button>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Generate QR tiles
                </Button>
              </div>
            )}
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QR tiles</CardTitle>
            <CardDescription>Copy, assign, deactivate, or delete tiles.</CardDescription>
          </CardHeader>
          <CardContent>
            {tilesLoading ? (
              <DashboardGridSkeleton count={6} className="grid md:grid-cols-2" />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-[180px]">Public code</TableHead>
                      <TableHead className="w-[220px]">Assigned table</TableHead>
                      <TableHead className="w-[260px]">URL</TableHead>
                      <TableHead className="w-[160px] text-center">QR</TableHead>
                      <TableHead className="w-[120px] text-center">Active</TableHead>
                      <TableHead className="w-[190px] text-right">Created</TableHead>
                      <TableHead className="w-[80px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No QR tiles yet. Generate a batch to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTiles.map((tile) => (
                        <TableRow key={tile.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{tile.publicCode}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => copyTileCode(tile.publicCode)}
                                aria-label={`Copy ${tile.publicCode}`}
                              >
                                {copiedCode === tile.publicCode ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={tile.tableId ?? 'unassigned'}
                              onValueChange={(value) =>
                                handleUpdateTile(tile.id, { tableId: value === 'unassigned' ? null : value })
                              }
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue>
                                  {tile.tableLabel ?? 'Unassigned'}
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
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-xs break-all">{buildPublicUrl(tile.publicCode)}</span>
                              <Button variant="ghost" size="icon" onClick={() => copyTileUrl(tile.publicCode)} aria-label="Copy URL">
                                {copiedCode === tile.publicCode ? <Check className="h-4 w-4 text-green-600" /> : <LinkIcon className="h-4 w-4" />}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewQr({
                                  code: tile.publicCode,
                                  url: buildPublicUrl(tile.publicCode),
                                })
                              }
                              className="inline-block rounded border border-border bg-card p-1 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                                  buildPublicUrl(tile.publicCode)
                                )}`}
                                alt={`QR for ${tile.publicCode}`}
                                className="h-20 w-20"
                                loading="lazy"
                              />
                            </button>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center">
                              <Switch
                                checked={tile.isActive}
                                onCheckedChange={(checked) => handleUpdateTile(tile.id, { isActive: checked })}
                                disabled={updatingTileId === tile.id}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatDate(tile.createdAt || tile.updatedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTile(tile.id)}
                              aria-label="Delete tile"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {recentTiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recently generated</CardTitle>
              <CardDescription>Quick copy panel for printing and labeling.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyRecentAsCsv(false)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy codes
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => copyRecentAsCsv(true)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy CSV
                  </Button>
                </div>
                <Badge variant="secondary">{recentTiles.length} new</Badge>
              </div>
              <Separator className="my-3" />
              <ScrollArea className="h-[200px] rounded-md border">
                <div className="divide-y divide-border">
                  {recentTiles.map((tile) => (
                    <div key={tile.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="font-mono text-sm text-foreground">{tile.publicCode}</p>
                        <p className="text-xs text-muted-foreground">URL: {buildPublicUrl(tile.publicCode)}</p>
                        <p className="text-xs text-muted-foreground">Table: {tile.tableLabel || 'Unassigned'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => copyTileCode(tile.publicCode)}>
                          {copiedCode === tile.publicCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => copyTileUrl(tile.publicCode)}>
                          {copiedCode === tile.publicCode ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate QR tiles</DialogTitle>
            <DialogDescription>Create a batch of QR codes ready for printing and later assignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tile-count">How many tiles?</Label>
              <Input
                id="tile-count"
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Limit 500 per batch.</p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewQr)} onOpenChange={(open) => !open && setPreviewQr(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR for {previewQr?.code}</DialogTitle>
            <DialogDescription>{previewQr?.url}</DialogDescription>
          </DialogHeader>
          <div className="w-full flex items-center justify-center py-4">
            {previewQr ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
                  previewQr.url
                )}`}
                alt={`QR for ${previewQr.code}`}
                className="h-64 w-64 rounded border border-border bg-card p-2"
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => copyTileUrl(previewQr?.code || '')}>
              Copy URL
            </Button>
            <Button onClick={() => setPreviewQr(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
