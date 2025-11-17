import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { Order, MenuData, MenuItem, Modifier } from '@/types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type OrderItemLike = Order['items'][number] & {
  itemId?: string;
  title?: string;
  name?: string;
  price?: number;
  priceCents?: number;
  selectedModifiers?: Record<string, string>;
};

const getItemName = (item?: MenuItem | null) => item?.name ?? item?.title ?? 'Unknown';

const getItemPrice = (item?: MenuItem | null) => {
  if (!item) return 0;
  if (typeof item.price === 'number') return item.price;
  if (typeof item.priceCents === 'number') return item.priceCents / 100;
  return 0;
};

const getItemModifiers = (item?: MenuItem | null): Modifier[] => item?.modifiers ?? [];

const coerceQuantity = (line: OrderItemLike) => {
  if (typeof line.quantity === 'number') return line.quantity;
  if (typeof (line as { qty?: number }).qty === 'number') return (line as { qty?: number }).qty as number;
  return 1;
};

const extractItemId = (line: OrderItemLike) => line.item?.id ?? line.itemId ?? null;

const getSelectedModifiers = (line: OrderItemLike): Record<string, string> => line.selectedModifiers ?? {};

const resolveMenuItem = (line: OrderItemLike, lookup: Map<string, MenuItem>) => {
  const id = extractItemId(line);
  if (line.item) return line.item;
  if (id && lookup.has(id)) return lookup.get(id) ?? null;
  return null;
};

const formatModifierName = (modifier?: Modifier) => modifier?.name ?? 'Modifier';

function daypartOf(date: Date) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'Breakfast';
  if (h >= 11 && h < 15) return 'Lunch';
  if (h >= 15 && h < 18) return 'Afternoon';
  if (h >= 18 && h < 22) return 'Dinner';
  return 'Late';
}

type MenuIntelligenceProps = {
  orders: Order[];
  variant?: 'basic' | 'pro';
  currencyFormatter?: (value: number) => string;
};

export function MenuIntelligence({
  orders,
  variant = 'basic',
  currencyFormatter,
}: MenuIntelligenceProps) {
  const [menu, setMenu] = useState<MenuData>({ items: [], categories: [] });

  useEffect(() => {
    (async () => {
      try {
        const menuResponse = await api.getMenu();
        setMenu({
          items: menuResponse?.items ?? [],
          categories: menuResponse?.categories ?? [],
        });
      } catch (error) {
        console.warn('Failed to fetch menu for intelligence', error);
      }
    })();
  }, []);

  const itemMap = useMemo(() => {
    const map = new Map<string, MenuItem>();
    menu.items.forEach((it) => map.set(it.id, it));
    return map;
  }, [menu.items]);

  const perItem = useMemo(() => {
    const aggregate = new Map<string, { id: string; name: string; qty: number; revenue: number; price: number }>();
    orders.forEach((order) => {
      (order.items ?? []).forEach((line) => {
        const id = extractItemId(line);
        if (!id) return;
        const menuItem = resolveMenuItem(line as OrderItemLike, itemMap);
        const price = getItemPrice(menuItem);
        const quantity = coerceQuantity(line as OrderItemLike);
        const name = getItemName(menuItem);
        const revenue = price * quantity;
        const prev = aggregate.get(id) ?? { id, name, qty: 0, revenue: 0, price };
        prev.qty += quantity;
        prev.revenue += revenue;
        aggregate.set(id, prev);
      });
    });
    return Array.from(aggregate.values());
  }, [orders, itemMap]);

  const perDaypart = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => {
      const dp = daypartOf(new Date(o.placedAt ?? o.createdAt));
      map[dp] = (map[dp] || 0) + 1;
    });
    return Object.entries(map).map(([daypart, count]) => ({ daypart, count }));
  }, [orders]);

  const modifierAttach = useMemo(() => {
    const modCounts: Record<string, { name: string; count: number }> = {};
    let orderItemsWithMods = 0;
    let totalOrderItems = 0;
    orders.forEach((o) => {
      (o.items || []).forEach((line) => {
        totalOrderItems += 1;
        const selected = getSelectedModifiers(line as OrderItemLike);
        if (Object.keys(selected).length > 0) {
          orderItemsWithMods += 1;
        }
        const menuItem = resolveMenuItem(line as OrderItemLike, itemMap);
        const itemMods = getItemModifiers(menuItem);
        Object.entries(selected).forEach(([modId]) => {
          const mod = itemMods.find((m) => m.id === modId);
          const name = formatModifierName(mod);
          const key = `${modId}:${name}`;
          modCounts[key] = { name, count: (modCounts[key]?.count || 0) + 1 };
        });
      });
    });
    const percent = totalOrderItems > 0 ? (orderItemsWithMods / totalOrderItems) * 100 : 0;
    return {
      top: Object.values(modCounts).sort((a, b) => b.count - a.count).slice(0, 6),
      totalOrderItems,
      orderItemsWithMods,
      percent,
    };
  }, [orders, itemMap]);

  const topItems = useMemo(() => perItem.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5), [perItem]);
  const bottomItems = useMemo(() => perItem.slice().sort((a, b) => a.qty - b.qty).slice(0, 5), [perItem]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    const catMap = new Map<string, string>();
    menu.categories?.forEach((cat) => catMap.set(cat.id, cat.title));
    menu.items.forEach((it) => {
      const catTitle = (it.categoryId && catMap.get(it.categoryId)) || it.category || 'Other';
      map.set(it.id, catTitle);
    });
    return map;
  }, [menu.items, menu.categories]);

  const categoryPerformance = useMemo(() => {
    const map = new Map<string, number>();
    perItem.forEach((item) => {
      const cat = categoryLookup.get(item.id) || 'Other';
      map.set(cat, (map.get(cat) ?? 0) + item.revenue);
    });
    return Array.from(map.entries()).map(([category, revenue]) => ({ category, revenue }));
  }, [perItem, categoryLookup]);

  const profitRows = useMemo(() => {
    return perItem.slice(0, 5).map((item) => {
      const menuItem = itemMap.get(item.id);
      const cost =
        typeof menuItem?.costCents === 'number' ? menuItem.costCents / 100 : null;
      const price = menuItem?.price ?? item.price;
      const margin =
        cost != null && price ? ((price - cost) / price) * 100 : null;
      return { ...item, margin };
    });
  }, [perItem, itemMap]);

  const totalRevenue = useMemo(
    () => perItem.reduce((sum, item) => sum + item.revenue, 0),
    [perItem]
  );

  const hintText = useMemo(() => {
    if (variant !== 'pro' || !perItem.length || totalRevenue <= 0) return null;
    const leader = perItem[0];
    const pct = Math.round((leader.revenue / totalRevenue) * 100);
    return `${leader.name} drives ${pct}% of revenue this period. Consider highlighting it on the menu.`;
  }, [variant, perItem, totalRevenue]);

  const fmtCurrency = (value: number) =>
    currencyFormatter ? currencyFormatter(value) : `€${value.toFixed(2)}`;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Menu Intelligence</h2>
        {variant === 'pro' && <Badge variant="outline">Pro</Badge>}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-3">Top Items (Revenue)</p>
          <div className="space-y-2">
            {topItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-sm">
                <span className="truncate mr-2">{it.name}</span>
                <span className="font-medium">{fmtCurrency(it.revenue)}</span>
              </div>
            ))}
            {topItems.length === 0 && <div className="text-sm text-muted-foreground">No data yet.</div>}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-3">Bottom Items (Units)</p>
          <div className="space-y-2">
            {bottomItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-sm">
                <span className="truncate mr-2">{it.name}</span>
                <span className="font-medium">{it.qty}</span>
              </div>
            ))}
            {bottomItems.length === 0 && <div className="text-sm text-muted-foreground">No data yet.</div>}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-3">Daypart Mix</p>
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perDaypart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="daypart" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-3">Modifier Attach Rate</p>
          <div className="space-y-2">
            <p className="text-2xl font-bold">
              {modifierAttach.percent.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {modifierAttach.orderItemsWithMods} of {modifierAttach.totalOrderItems} items carried a modifier
            </p>
          </div>
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modifierAttach.top}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        {variant === 'pro' && hintText ? (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-3">Hint</p>
            <p className="text-sm">{hintText}</p>
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-3">Preparation Notes</p>
            <p className="text-sm text-muted-foreground">
              Attach rates stay factual; adjust recipes or staffing based on actual flow.
            </p>
          </Card>
        )}
      </div>
      {variant === 'pro' && (
        <>
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Category performance</p>
                  <h3 className="text-lg font-semibold">Sales by category</h3>
                </div>
                <Badge variant="outline">Pro</Badge>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryPerformance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-3">Profitability</p>
              <div className="space-y-2 text-sm">
                {profitRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3">
                    <div className="truncate flex-1">
                      <span className="font-medium mr-2">{row.name}</span>
                      <span className="text-muted-foreground">{fmtCurrency(row.revenue)}</span>
                    </div>
                    <span className="font-semibold">
                      {row.margin != null ? `${row.margin.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <div className="mt-4 text-sm flex items-center gap-2">
            <Badge variant="outline">Experimental</Badge>
            <span>Expected weekend volume: +5–10% vs last week</span>
          </div>
        </>
      )}
    </Card>
  );
}

