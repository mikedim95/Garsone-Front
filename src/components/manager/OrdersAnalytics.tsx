import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download, Calendar as CalendarIcon, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Order, OrderStatus } from '@/types';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface OrdersAnalyticsProps {
  orders: Order[];
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  PLACED: 'hsl(var(--chart-1))',
  PREPARING: 'hsl(var(--chart-2))',
  READY: 'hsl(var(--chart-3))',
  SERVED: 'hsl(var(--chart-4))',
  PAID: 'hsl(var(--chart-5))',
  CANCELLED: 'hsl(var(--destructive))',
};

const getCurrencyCode = () =>
  typeof window !== 'undefined' ? window.localStorage.getItem('CURRENCY') || 'EUR' : 'EUR';

const formatCurrencyValue = (value: number) => {
  const currency = getCurrencyCode();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `€${value.toFixed(2)}`;
  }
};

export function OrdersAnalytics({ orders }: OrdersAnalyticsProps) {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [selectedStatuses, setSelectedStatuses] = useState<OrderStatus[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);

  const getOrderTotal = (order: Order) => {
    if (typeof order.total === 'number' && Number.isFinite(order.total)) return order.total;
    if (typeof order.totalCents === 'number' && Number.isFinite(order.totalCents)) {
      return order.totalCents / 100;
    }
    return 0;
  };

  const allStatuses: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'SERVED', 'PAID', 'CANCELLED'];

  const toggleStatus = (status: OrderStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const sortedOrders = useMemo(
    () =>
      orders
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? b.updatedAt ?? 0).getTime() -
            new Date(a.createdAt ?? a.updatedAt ?? 0).getTime()
        ),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    return sortedOrders.filter(order => {
      const orderDate = new Date(order.placedAt ?? order.createdAt);
      
      // Date filter
      if (dateRange.from && orderDate < dateRange.from) return false;
      if (dateRange.to) {
        const toEndOfDay = new Date(dateRange.to);
        toEndOfDay.setHours(23, 59, 59, 999);
        if (orderDate > toEndOfDay) return false;
      }
      
      // Status filter
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(order.status)) return false;
      
      return true;
    });
  }, [sortedOrders, dateRange, selectedStatuses]);

  const latestOrders = useMemo(() => filteredOrders.slice(0, 20), [filteredOrders]);
  const servedFilteredOrders = useMemo(
    () => filteredOrders.filter((order) => order.status === 'SERVED' || order.status === 'PAID'),
    [filteredOrders]
  );

  // Orders by status data
  const ordersByStatus = useMemo(() => {
    const statusCounts: Record<OrderStatus, number> = {
      PLACED: 0,
      PREPARING: 0,
      READY: 0,
      SERVED: 0,
      PAID: 0,
      CANCELLED: 0,
    };
    
    filteredOrders.forEach(order => {
      statusCounts[order.status]++;
    });
    
    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));
  }, [filteredOrders]);

  // Orders over time data
  const ordersOverTime = useMemo(() => {
    const dateMap: Record<string, number> = {};
    
    filteredOrders.forEach(order => {
      const dateKey = format(new Date(order.placedAt ?? order.createdAt), 'MMM dd');
      dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;
    });
    
    return Object.entries(dateMap)
      .map(([date, count]) => ({ date, count }))
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      .slice(-10); // Last 10 days
  }, [filteredOrders]);

  // Revenue over time data
  const revenueOverTime = useMemo(() => {
    const dateMap: Record<string, number> = {};
    
    filteredOrders.forEach(order => {
      if (order.status !== 'SERVED' && order.status !== 'PAID') return;
      const dateKey = format(new Date(order.placedAt ?? order.createdAt), 'MMM dd');
      dateMap[dateKey] = (dateMap[dateKey] || 0) + getOrderTotal(order);
    });

    return Object.entries(dateMap)
      .map(([date, revenue]) => ({ date, revenue: Number(revenue.toFixed(2)) }))
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      .slice(-10);
  }, [filteredOrders]);

  const clearFilters = () => {
    setDateRange({});
    setSelectedStatuses([]);
  };

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Orders Analytics</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPanelOpen((prev) => !prev)}
            aria-label={panelOpen ? 'Collapse analytics' : 'Expand analytics'}
          >
            {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(dateRange.from || dateRange.to || selectedStatuses.length > 0) && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {panelOpen && (
        <Tabs defaultValue="list" className="w-full">
          <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2 justify-items-center">
            <TabsTrigger className="w-full text-xs sm:text-sm" value="list">
              Orders List
            </TabsTrigger>
            <TabsTrigger className="w-full text-xs sm:text-sm" value="status">
              By Status
            </TabsTrigger>
            <TabsTrigger className="w-full text-xs sm:text-sm" value="timeline">
              Timeline
            </TabsTrigger>
            <TabsTrigger className="w-full text-xs sm:text-sm" value="revenue">
              Revenue
            </TabsTrigger>
          </TabsList>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 my-4 p-4 bg-muted/50 rounded-lg">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange.from}
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {allStatuses.map(status => (
              <Badge
                key={status}
                variant={selectedStatuses.includes(status) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleStatus(status)}
              >
                {status}
              </Badge>
            ))}
          </div>
        </div>

        <TabsContent value="list" className="space-y-4">
          <div className="text-sm text-muted-foreground mb-2">
            Showing {latestOrders.length} of {filteredOrders.length} filtered orders
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Table</th>
                  <th className="pb-3 font-medium">Items</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {latestOrders.map((order) => (
                  <tr key={order.id} className="border-b">
                    <td className="py-3">{order.tableLabel}</td>
                    <td className="py-3">{order.items?.length ?? 0}</td>
                    <td className="py-3">€{getOrderTotal(order).toFixed(2)}</td>
                    <td className="py-3">
                      <Badge variant="outline">{order.status}</Badge>
                    </td>
                    <td className="py-3 text-sm text-muted-foreground">
                      {format(new Date(order.placedAt ?? order.createdAt), 'PPp')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Orders by Status</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ordersByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Status Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={ordersByStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ status, count }) =>
                      count > 0 ? `${status}: ${count}` : ''
                    }
                    outerRadius={80}
                    fill="hsl(var(--primary))"
                    dataKey="count"
                  >
                    {ordersByStatus.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status as OrderStatus]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <h3 className="text-lg font-semibold mb-4">Orders Timeline (Last 10 Days)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={ordersOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <h3 className="text-lg font-semibold mb-4">Revenue Timeline (Last 10 Days)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={revenueOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrencyValue(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} name="Revenue (€)" />
            </LineChart>
          </ResponsiveContainer>
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">
                {formatCurrencyValue(
                  servedFilteredOrders.reduce((sum, o) => sum + getOrderTotal(o), 0)
                )}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Average Order Value</p>
              <p className="text-2xl font-bold">
                {formatCurrencyValue(
                  servedFilteredOrders.length > 0
                    ? servedFilteredOrders.reduce((sum, o) => sum + getOrderTotal(o), 0) /
                        servedFilteredOrders.length
                    : 0
                )}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Served Orders</p>
              <p className="text-2xl font-bold">{servedFilteredOrders.length}</p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      )}
    </Card>
  );
}
