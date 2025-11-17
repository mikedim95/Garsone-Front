import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Order } from '@/types';
import {
  Activity,
  AlertTriangle,
  Ban,
  Clock,
  DollarSign,
  Filter,
  Loader2,
  Rocket,
  Search,
  Zap,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';

type ItemRecord = { id: string; title?: string; name?: string; priceCents?: number; categoryId?: string; category?: string; isAvailable?: boolean };
type DisabledItemRecord = { until?: number; reason?: string };
type DiscountRecord = { type: 'percent'|'amount'; value: number; reason?: string; createdAt: number };
type WaiterSummary = { id: string; displayName?: string; email?: string };

const logOpsError = (scope: string, error: unknown) => {
  console.warn(`[OperationsCenter] ${scope}`, error);
};

const readDisabledMap = (): Record<string, DisabledItemRecord> => {
  try {
    const raw = localStorage.getItem('mgr:86');
    return raw ? (JSON.parse(raw) as Record<string, DisabledItemRecord>) : {};
  } catch (error) {
    logOpsError('readDisabledMap', error);
    return {};
  }
};

const writeDisabledMap = (map: Record<string, DisabledItemRecord>) => {
  try {
    localStorage.setItem('mgr:86', JSON.stringify(map));
  } catch (error) {
    logOpsError('writeDisabledMap', error);
  }
};

function useNow(tickMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

function minutesSince(dateISO: string, nowMs: number) {
  const d = new Date(dateISO).getTime();
  return Math.max(0, Math.round((nowMs - d) / 60000));
}

function tinySparkline(data: Array<{ x: string; y: number }>, color: string) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
        <Tooltip formatter={(v)=>String(v)} labelFormatter={(l)=>String(l)} />
        <Line type="monotone" dataKey="y" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function OperationsCenter({ orders }: { orders: Order[] }) {
  const now = useNow(15000);

  // Items for quick actions and capacity
  const [items, setItems] = useState<ItemRecord[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const response = await api.listItems();
        setItems(response?.items ?? []);
      } catch (error) {
        logOpsError('listItems', error);
      }
    })();
  }, []);

  // Auto re-enable items whose 86 window has expired
  useEffect(() => {
    const check = async () => {
      const map = readDisabledMap();
      const nowMs = Date.now();
      let changed = false;
      for (const [id, record] of Object.entries(map)) {
        if (record.until && nowMs >= record.until) {
          try {
            await api.updateItem(id, { isAvailable: true });
          } catch (error) {
            logOpsError(`auto re-enable item ${id}`, error);
          }
          delete map[id];
          changed = true;
        }
      }
      if (changed) writeDisabledMap(map);
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  // Local annotations stored in localStorage
  const [discounts, setDiscounts] = useState<Record<string, DiscountRecord>>(() => {
    try { return JSON.parse(localStorage.getItem('mgr:discounts') || '{}'); } catch { return {}; }
  });
  const [expedite, setExpedite] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('mgr:expedite') || '{}'); } catch { return {}; }
  });
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('mgr:notes') || '{}'); } catch { return {}; }
  });

  useEffect(() => { localStorage.setItem('mgr:discounts', JSON.stringify(discounts)); }, [discounts]);
  useEffect(() => { localStorage.setItem('mgr:expedite', JSON.stringify(expedite)); }, [expedite]);
  useEffect(() => { localStorage.setItem('mgr:notes', JSON.stringify(notes)); }, [notes]);

  // KPIs
  const ordersInQueue = useMemo(() => orders.filter(o => o.status === 'PLACED' || o.status === 'PREPARING').length, [orders]);
  const readyCount = useMemo(() => orders.filter(o => o.status === 'READY').length, [orders]);
  const revenueToday = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return orders.reduce((sum, o) => {
      const d = new Date(o.createdAt);
      if (d >= today) {
        const base = o.total || 0;
        const disc = discounts[o.id];
        let adj = base;
        if (disc) adj = disc.type==='percent' ? base * (1 - disc.value/100) : Math.max(0, base - disc.value);
        return sum + adj;
      }
      return sum;
    }, 0);
  }, [orders, discounts]);

  const avgPrepMins = useMemo(() => {
    const active = orders.filter(o => o.status === 'PREPARING' || o.status === 'READY');
    if (active.length === 0) return 0;
    const sum = active.reduce((acc, o) => acc + minutesSince(o.createdAt, now), 0);
    return Math.round(sum / active.length);
  }, [orders, now]);

  const slaHitRate = useMemo(() => {
    // SLA: 15 minutes target to READY/SERVED
    const past = orders.filter(o => o.status === 'READY' || o.status === 'SERVED');
    if (past.length === 0) return 100;
    const hits = past.filter(o => minutesSince(o.createdAt, now) <= 15).length;
    return Math.round((hits / past.length) * 100);
  }, [orders, now]);

  // Trends: last 8 hours
  const trendOrders = useMemo(() => {
    const buckets: Array<{ x: string; y: number }> = [];
    const nowD = new Date(now);
    for (let i = 7; i >= 0; i--) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate(), nowD.getHours() - i, 0, 0, 0);
      const next = new Date(d.getTime() + 3600_000);
      const y = orders.filter(o => new Date(o.createdAt) >= d && new Date(o.createdAt) < next).length;
      buckets.push({ x: `${d.getHours()}:00`, y });
    }
    return buckets;
  }, [orders, now]);

  const trendRevenue = useMemo(() => {
    const buckets: Array<{ x: string; y: number }> = [];
    const nowD = new Date(now);
    for (let i = 7; i >= 0; i--) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate(), nowD.getHours() - i, 0, 0, 0);
      const next = new Date(d.getTime() + 3600_000);
      const y = orders.reduce((sum, o) => {
        const od = new Date(o.createdAt);
        if (od >= d && od < next) {
          const base = o.total || 0;
          const disc = discounts[o.id];
          if (disc) return sum + (disc.type==='percent' ? base * (1-disc.value/100) : Math.max(0, base - disc.value));
          return sum + base;
        }
        return sum;
      }, 0);
      buckets.push({ x: `${d.getHours()}:00`, y: Number(y.toFixed(2)) });
    }
    return buckets;
  }, [orders, discounts, now]);

  // Aging heat (top 12 oldest in queue)
  const aging = useMemo(() => {
    const queue = orders.filter(o => o.status === 'PLACED' || o.status === 'PREPARING');
    return [...queue]
      .map(o => ({ o, mins: minutesSince(o.createdAt, now) }))
      .sort((a,b)=> b.mins - a.mins)
      .slice(0,12);
  }, [orders, now]);

  // Capacity by category from open orders (PLACED+PREPARING)
  const categoryLoad = useMemo(() => {
    const load: Record<string, number> = {};
    orders.filter(o => o.status==='PLACED' || o.status==='PREPARING').forEach(o => {
      (o.items||[]).forEach(ci => {
        const cat = (ci.item.category || 'Other');
        load[cat] = (load[cat] || 0) + ci.quantity;
      });
    });
    return Object.entries(load).map(([category, count]) => ({ category, count })).sort((a,b)=> b.count-a.count);
  }, [orders]);

  // Quick actions state
  const [open86, setOpen86] = useState(false);
  const [query86, setQuery86] = useState('');
  const [saving86, setSaving86] = useState(false);
  const [reason86, setReason86] = useState('');
  const [minutes86, setMinutes86] = useState<string>('');
  const filteredItems86 = useMemo(() => {
    const q = query86.trim().toLowerCase();
    if (!q) return items.slice(0, 20);
    return items.filter(it => (it.title||it.name||'').toLowerCase().includes(q)).slice(0, 20);
  }, [items, query86]);

  const [discountModal, setDiscountModal] = useState<{ open: boolean; orderId?: string }>({ open: false });
  const [discountType, setDiscountType] = useState<'percent'|'amount'>('percent');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');
  const discountSaving = false;

  const [noteModal, setNoteModal] = useState<{ open: boolean; orderId?: string }>({ open: false });
  const [noteText, setNoteText] = useState<string>('');

  // Reassign waiter modal
  const [reassignModal, setReassignModal] = useState<{ open: boolean; orderId?: string; tableId?: string }>({ open: false });
  const [waiters, setWaiters] = useState<WaiterSummary[]>([]);
  const [selectedWaiter, setSelectedWaiter] = useState<string>('');
  useEffect(() => {
    (async () => {
      try {
        const res = await api.listWaiters();
        setWaiters(res.waiters || []);
      } catch (error) {
        logOpsError('listWaiters', error);
      }
    })();
  }, []);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Activity className="h-5 w-5"/> Operations Command Center</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen86(true)}><Ban className="h-4 w-4 mr-2"/> 86 Item</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Revenue Today</p>
              <p className="text-2xl font-bold">€{revenueToday.toFixed(2)}</p>
            </div>
            <DollarSign className="h-6 w-6 text-primary"/>
          </div>
          <div className="mt-2">{tinySparkline(trendRevenue, 'hsl(var(--chart-2))')}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Orders In Queue</p>
              <p className="text-2xl font-bold">{ordersInQueue}</p>
            </div>
            <Clock className="h-6 w-6 text-accent"/>
          </div>
          <div className="mt-2">{tinySparkline(trendOrders, 'hsl(var(--primary))')}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Avg Prep Time</p>
              <p className="text-2xl font-bold">{avgPrepMins}m</p>
            </div>
            <Rocket className="h-6 w-6 text-accent"/>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Across PREPARING + READY</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">SLA Hit Rate</p>
              <p className={cn("text-2xl font-bold", slaHitRate >= 85 ? 'text-primary' : slaHitRate >= 70 ? 'text-accent' : 'text-destructive')}>{slaHitRate}%</p>
            </div>
            <AlertTriangle className="h-6 w-6 text-destructive"/>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Ready/Served within 15m</div>
        </Card>
      </div>

      {/* Aging heat */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold">Aging Queue</h3>
          <Badge variant="outline">PLACED + PREPARING</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left">
                <th className="pb-2 font-medium">Order</th>
                <th className="pb-2 font-medium">Table</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Age</th>
                <th className="pb-2 font-medium">Flags</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {aging.map(({o, mins}) => {
                const ageClass = mins >= 20 ? 'text-destructive font-semibold' : mins >= 10 ? 'text-accent font-semibold' : 'text-muted-foreground';
                const isExp = !!expedite[o.id];
                const disc = discounts[o.id];
                return (
                  <tr key={o.id} className="border-b">
                    <td className="py-2 text-sm">{o.id.slice(-6)}</td>
                    <td className="py-2">{o.tableLabel}</td>
                    <td className="py-2"><Badge variant="outline">{o.status}</Badge></td>
                    <td className={cn('py-2', ageClass)}>{mins}m</td>
                    <td className="py-2 flex items-center gap-2">
                      {isExp && (<Badge className="bg-accent/30 text-accent-foreground" variant="outline"><Zap className="h-3 w-3 mr-1"/>Expedite</Badge>)}
                      {disc && (<Badge variant="outline">{disc.type==='percent' ? `${disc.value}%` : `-€${disc.value.toFixed(2)}`}</Badge>)}
                      {notes[o.id] && (<Badge variant="outline">Note</Badge>)}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant={isExp ? 'default' : 'outline'} onClick={()=> setExpedite(prev=> ({...prev, [o.id]: !prev[o.id]}))}>
                          <Zap className="h-4 w-4 mr-1"/>{isExp? 'Unmark' : 'Expedite'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={()=>{ setDiscountModal({ open: true, orderId: o.id }); setDiscountType('percent'); setDiscountValue(''); setDiscountReason(''); }}>
                          % Discount
                        </Button>
                        <Button size="sm" variant="outline" onClick={()=>{ setNoteModal({ open: true, orderId: o.id }); setNoteText(notes[o.id] || ''); }}>
                          Add Note
                        </Button>
                        <Button size="sm" variant="outline" onClick={()=>{ setReassignModal({ open: true, orderId: o.id, tableId: o.tableId }); setSelectedWaiter(''); }}>
                          Reassign Waiter
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Capacity by category */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold">Capacity by Category</h3>
          <Badge variant="outline">Active queue</Badge>
        </div>
        <div className="w-full h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryLoad}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 86 Item modal */}
      <Dialog open={open86} onOpenChange={setOpen86}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>86 an item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
              <Input className="pl-8" placeholder="Search item by name" value={query86} onChange={(e)=> setQuery86(e.target.value)} />
            </div>
            <div className="grid gap-2">
              {filteredItems86.length === 0 && (<div className="text-sm text-muted-foreground">No matches</div>)}
              {filteredItems86.map(it => {
                const isDisabled = it.isAvailable === false;
                return (
                <div key={it.id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    <div className="font-medium">{it.title || it.name}</div>
                    <div className="text-xs text-muted-foreground">{isDisabled ? 'Currently disabled' : 'Available'}</div>
                  </div>
                  <Button
                    size="sm"
                    variant={isDisabled ? 'default' : 'destructive'}
                    disabled={saving86}
                    onClick={async ()=>{
                      setSaving86(true);
                      try {
                        const nextAvailability = isDisabled ? true : false;
                        await api.updateItem(it.id, { isAvailable: nextAvailability });

                        const mins = parseInt(minutes86 || '', 10);
                        const disabledMap = readDisabledMap();
                        if (!isDisabled && Number.isFinite(mins) && mins > 0) {
                          const until = Date.now() + mins * 60000;
                          disabledMap[it.id] = { until, reason: reason86 || undefined };
                        } else {
                          delete disabledMap[it.id];
                        }
                        writeDisabledMap(disabledMap);

                        try {
                          const latest = await api.listItems();
                          setItems(latest?.items ?? []);
                        } catch (error) {
                          logOpsError('refresh items after toggle', error);
                        }
                      } catch (error) {
                        logOpsError('toggle item availability', error);
                      } finally {
                        setSaving86(false);
                      }
                    }}
                  >
                    {saving86 ? <Loader2 className="h-4 w-4 animate-spin"/> : (isDisabled ? 'Enable' : 'Disable')}
                  </Button>
                </div>
              )})}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Reason (optional)</Label>
                <Input value={reason86} onChange={(e)=> setReason86(e.target.value)} placeholder="e.g., Out of stock"/>
              </div>
              <div>
                <Label>Re-enable in (min)</Label>
                <Input type="number" min={0} step={5} value={minutes86} onChange={(e)=> setMinutes86(e.target.value)} placeholder="e.g., 60"/>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=> setOpen86(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount modal */}
      <Dialog open={discountModal.open} onOpenChange={(open)=> setDiscountModal({ open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discount / Comp</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 items-center">
              <Button variant={discountType==='percent'? 'default':'outline'} onClick={()=> setDiscountType('percent')}>Percent %</Button>
              <Button variant={discountType==='amount'? 'default':'outline'} onClick={()=> setDiscountType('amount')}>Amount €</Button>
            </div>
            <Input placeholder={discountType==='percent'? 'e.g., 100 for comp or 10' : 'e.g., 5.00'} value={discountValue} onChange={(e)=> setDiscountValue(e.target.value)} />
            <Input placeholder="Reason (optional)" value={discountReason} onChange={(e)=> setDiscountReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=> setDiscountModal({ open: false })}>Cancel</Button>
            <Button
              disabled={!discountModal.orderId || !discountValue || isNaN(Number(discountValue))}
              onClick={()=>{
                const id = discountModal.orderId!;
                const v = Math.max(0, Number(discountValue));
                const rec: DiscountRecord = { type: discountType, value: discountType==='percent'? v : Number(v.toFixed(2)), reason: discountReason?.trim() || undefined, createdAt: Date.now() };
                setDiscounts(prev => ({ ...prev, [id]: rec }));
                setDiscountModal({ open: false });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note modal */}
      <Dialog open={noteModal.open} onOpenChange={(open)=> setNoteModal({ open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Order Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Internal note / reassign instruction" value={noteText} onChange={(e)=> setNoteText(e.target.value)} />
            <div className="text-xs text-muted-foreground">This is a manager-side annotation.</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=> setNoteModal({ open: false })}>Cancel</Button>
            <Button onClick={()=>{ if (!noteModal.orderId) return; setNotes(prev => ({ ...prev, [noteModal.orderId!]: noteText })); setNoteModal({ open: false }); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign waiter modal */}
      <Dialog open={reassignModal.open} onOpenChange={(open)=> setReassignModal({ open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Waiter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Select waiter</Label>
              <select
                className="border rounded p-2 w-full"
                value={selectedWaiter}
                onChange={(e)=> setSelectedWaiter(e.target.value)}
              >
                <option value="">— Choose waiter —</option>
                {waiters.map(w => (
                  <option key={w.id} value={w.id}>{w.displayName || w.email}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=> setReassignModal({ open: false })}>Cancel</Button>
            <Button
              disabled={!selectedWaiter || !reassignModal.tableId}
              onClick={async ()=>{
                try {
                  await api.assignWaiterTable(selectedWaiter, reassignModal.tableId!);
                } catch (error) {
                  logOpsError('assignWaiterTable', error);
                } finally {
                  setReassignModal({ open: false });
                }
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
