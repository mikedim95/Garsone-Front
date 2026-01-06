import { useMemo, useState, useEffect } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Order, OrderStatus } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ChefHat, CheckCircle, CreditCard, XCircle, Eye, EyeOff } from 'lucide-react';

interface TableCardViewProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  showInactiveTables?: boolean;
  onToggleInactive?: () => void;
  busy?: boolean;
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  PLACED: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  PREPARING: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  READY: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
  SERVED: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
  PAID: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
  CANCELLED: 'bg-red-500/20 text-red-600 border-red-500/30',
};

const STATUS_DOT_COLORS: Record<OrderStatus, string> = {
  PLACED: 'bg-amber-500',
  PREPARING: 'bg-blue-500',
  READY: 'bg-emerald-500',
  SERVED: 'bg-purple-500',
  PAID: 'bg-slate-500',
  CANCELLED: 'bg-red-500',
};

const getTablePriorityStatus = (orders: Order[]): OrderStatus | null => {
  const priority: OrderStatus[] = ['READY', 'PLACED', 'PREPARING', 'SERVED', 'PAID', 'CANCELLED'];
  for (const status of priority) {
    if (orders.some(o => o.status === status)) return status;
  }
  return null;
};

export function TableCardView({ orders, onUpdateStatus, showInactiveTables, onToggleInactive, busy }: TableCardViewProps) {
  const { t } = useTranslation();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [showLessImportant, setShowLessImportant] = useState(false);

  // Reset toggle when closing the modal or switching tables
  useEffect(() => {
    if (!selectedTable) setShowLessImportant(false);
  }, [selectedTable]);

  // Group orders by table
  const tableGroups = useMemo(() => {
    const groups = new Map<string, { tableId: string; tableLabel: string; orders: Order[] }>();
    
    orders.forEach(order => {
      const key = order.tableId || 'unknown';
      const label = order.tableLabel || order.tableId || '??';
      
      if (!groups.has(key)) {
        groups.set(key, { tableId: key, tableLabel: label, orders: [] });
      }
      groups.get(key)!.orders.push(order);
    });

    // Sort by table label
    return Array.from(groups.values()).sort((a, b) => 
      a.tableLabel.localeCompare(b.tableLabel, undefined, { numeric: true })
    );
  }, [orders]);

  // Separate active and inactive tables
  const { activeTables, inactiveTables } = useMemo(() => {
    const active: typeof tableGroups = [];
    const inactive: typeof tableGroups = [];
    
    tableGroups.forEach(table => {
      const hasActiveOrders = table.orders.some(o => !['PAID', 'CANCELLED'].includes(o.status));
      if (hasActiveOrders) {
        active.push(table);
      } else {
        inactive.push(table);
      }
    });
    
    return { activeTables: active, inactiveTables: inactive };
  }, [tableGroups]);

  const selectedTableData = useMemo(() => {
    if (!selectedTable) return null;
    return tableGroups.find(g => g.tableId === selectedTable) || null;
  }, [selectedTable, tableGroups]);

  const handleStatusChange = async (orderId: string, status: OrderStatus) => {
    setActingIds(prev => new Set(prev).add(orderId));
    try {
      await onUpdateStatus(orderId, status);
    } finally {
      setActingIds(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const getStatusBadgeVariant = (status: OrderStatus) => {
    switch (status) {
      case 'PLACED': return 'warning';
      case 'PREPARING': return 'secondary';
      case 'READY': return 'success';
      case 'SERVED': return 'outline';
      case 'PAID': return 'default';
      case 'CANCELLED': return 'destructive';
      default: return 'default';
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderTableCard = (
    { tableId, tableLabel, orders: tableOrders }: typeof tableGroups[0],
    isInactive: boolean = false
  ) => {
    const importantStatuses: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'SERVED'];
    const priorityStatus = getTablePriorityStatus(tableOrders);
    const hasReady = tableOrders.some(o => o.status === 'READY');
    const hasPlaced = tableOrders.some(o => o.status === 'PLACED');
    const activeCount = tableOrders.filter(o => !['PAID', 'CANCELLED'].includes(o.status)).length;
    const importantOrders = tableOrders.filter(o => importantStatuses.includes(o.status));
    const orderDots = [...importantOrders]
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 18);
    
    return (
      <motion.button
        key={tableId}
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: isInactive ? 0.5 : 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        whileHover={{ scale: isInactive ? 1 : 1.05 }}
        whileTap={{ scale: isInactive ? 1 : 0.95 }}
        onClick={() => !isInactive && setSelectedTable(tableId)}
        disabled={isInactive}
        className={clsx(
          'relative aspect-square rounded-xl border-2 p-2 flex flex-col items-center justify-center gap-1',
          'transition-all duration-200 shadow-sm',
          isInactive ? [
            'bg-muted/50 border-border/50 cursor-not-allowed opacity-50',
          ] : [
            'bg-card/80 backdrop-blur-sm cursor-pointer hover:shadow-md',
            // Stop infinite flashing: keep static highlight without pulse
            hasReady && 'border-emerald-500 ring-2 ring-emerald-500/30',
            hasPlaced && !hasReady && 'border-amber-500 ring-2 ring-amber-500/20',
            !hasReady && !hasPlaced && 'border-border hover:border-primary/50',
          ]
        )}
      >
        {/* Priority status dot (hide if rendering center dots) */}
        {priorityStatus && !isInactive && orderDots.length === 0 && (
          <span 
            className={clsx(
              'absolute top-1 right-1 w-2 h-2 rounded-full',
              STATUS_DOT_COLORS[priorityStatus]
            )} 
          />
        )}
        
        {/* Table label */}
        <span className={clsx(
          'text-sm sm:text-base font-bold truncate max-w-full',
          isInactive ? 'text-muted-foreground' : 'text-foreground'
        )}>
          {tableLabel}
        </span>
        
        {/* Order count */}
        {activeCount > 0 && !isInactive && (
          <span className={clsx(
            'text-xs font-medium px-1.5 py-0.5 rounded-full',
            hasReady ? 'bg-emerald-500/20 text-emerald-600' :
            hasPlaced ? 'bg-amber-500/20 text-amber-600' :
            'bg-muted text-muted-foreground'
          )}>
            {activeCount}
          </span>
        )}

        {/* Order status dots */}
        {!isInactive && tableOrders.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-1 max-w-[90%]">
            {orderDots.map((order) => (
              <span
                key={order.id}
                className={clsx(
                  'w-2.5 h-2.5 rounded-full border border-background shadow-sm',
                  STATUS_DOT_COLORS[order.status]
                )}
                title={`${t(`status.${order.status}`)} ${order.tableLabel || ''}`}
              />
            ))}
          </div>
        )}
        
        {/* Inactive indicator */}
        {isInactive && (
          <span className="text-[10px] text-muted-foreground">
            {tableOrders.length} done
          </span>
        )}
      </motion.button>
    );
  };

  return (
    <>
      {/* Toggle for inactive tables */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          {activeTables.length} active tables
          {inactiveTables.length > 0 && ` • ${inactiveTables.length} inactive`}
        </div>
        {onToggleInactive && inactiveTables.length > 0 && (
          <button
            onClick={onToggleInactive}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
              'border',
              showInactiveTables
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-card text-muted-foreground border-border hover:border-primary/30'
            )}
          >
            {showInactiveTables ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showInactiveTables ? 'Hiding inactive' : 'Show inactive'}
          </button>
        )}
      </div>

      {/* Table Cards Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 sm:gap-3">
        <AnimatePresence mode="popLayout">
          {/* Active tables first */}
          {activeTables.map(table => renderTableCard(table, false))}
          
          {/* Inactive tables if toggled on */}
          {showInactiveTables && inactiveTables.map(table => renderTableCard(table, true))}
        </AnimatePresence>
      </div>

      {activeTables.length === 0 && !showInactiveTables && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
            <ChefHat className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No active tables</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {inactiveTables.length > 0 
              ? `${inactiveTables.length} table${inactiveTables.length > 1 ? 's have' : ' has'} only completed orders. Toggle "Show inactive" to view them.`
              : 'Tables with orders will appear here.'}
          </p>
        </div>
      )}

      {/* Table Orders Modal */}
      <Dialog open={!!selectedTable} onOpenChange={(open) => !open && setSelectedTable(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
            <DialogTitle className="flex items-center gap-3">
              <span className="text-2xl">🍽️</span>
              <span>Table {selectedTableData?.tableLabel}</span>
              <Badge variant="outline" className="ml-auto">
                {selectedTableData?.orders.length || 0} orders
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {/* Table orders filter toolbar */}
          <div className="px-4 py-2 flex items-center justify-between border-b border-border/60">
            <div className="text-xs text-muted-foreground">
              Important: {(selectedTableData?.orders?.filter(o => ['PLACED','READY','PREPARING','SERVED'].includes(o.status)).length) ?? 0}
            </div>
            {((selectedTableData?.orders?.filter(o => !['PLACED','READY','PREPARING','SERVED'].includes(o.status)).length) ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Show less important</span>
                <Switch checked={showLessImportant} onCheckedChange={setShowLessImportant} />
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence mode="popLayout">
              {selectedTableData?.orders
                .filter((o) => ['PLACED','READY','PREPARING','SERVED'].includes(o.status))
                .sort((a, b) => {
                  const statusOrder: OrderStatus[] = ['PLACED','PREPARING','READY','SERVED'];
                  const aIdx = statusOrder.indexOf(a.status);
                  const bIdx = statusOrder.indexOf(b.status);
                  if (aIdx !== bIdx) return aIdx - bIdx;
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .map((order) => {
                  const isActing = actingIds.has(order.id);
                  
                  return (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={clsx(
                        'rounded-xl border p-3 space-y-2',
                        STATUS_COLORS[order.status]
                      )}
                    >
                      {/* Order header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={getStatusBadgeVariant(order.status)} className="text-xs">
                            {t(`status.${order.status}`)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(order.createdAt)}
                          </span>
                        </div>
                        {order.total !== undefined && (
                          <span className="text-sm font-semibold">
                            €{order.total.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Order items */}
                      <div className="space-y-1">
                        {order.items?.slice(0, 4).map((item, idx) => (
                          <div key={idx} className="text-xs flex items-center gap-1">
                            <span className="font-medium">{item.quantity}×</span>
                            <span className="truncate">{item.item?.name || 'Item'}</span>
                          </div>
                        ))}
                        {(order.items?.length || 0) > 4 && (
                          <div className="text-xs text-muted-foreground">
                            +{(order.items?.length || 0) - 4} more items
                          </div>
                        )}
                      </div>

                      {/* Note */}
                      {order.note && (
                        <div className="text-xs italic text-muted-foreground bg-background/50 rounded px-2 py-1">
                          "{order.note}"
                        </div>
                      )}

                      {/* Status change buttons */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {order.status === 'READY' && (
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1 h-8 text-xs bg-purple-600 hover:bg-purple-700"
                            onClick={() => handleStatusChange(order.id, 'SERVED')}
                            disabled={isActing}
                          >
                            <CheckCircle className="w-3 h-3" />
                            Mark Served
                          </Button>
                        )}
                        {order.status === 'SERVED' && (
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1 h-8 text-xs bg-slate-600 hover:bg-slate-700"
                            onClick={() => handleStatusChange(order.id, 'PAID')}
                            disabled={isActing}
                          >
                            <CreditCard className="w-3 h-3" />
                            Mark Paid
                          </Button>
                        )}
                        {!['PAID', 'CANCELLED'].includes(order.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleStatusChange(order.id, 'CANCELLED')}
                            disabled={isActing}
                          >
                            <XCircle className="w-3 h-3" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
            </AnimatePresence>
            {showLessImportant && (
              <div className="mt-4 pt-3 border-t border-border/60">
                <div className="text-xs font-semibold text-muted-foreground mb-2">Other orders</div>
                <AnimatePresence mode="popLayout">
                  {selectedTableData?.orders
                    .filter((o) => !['PLACED','READY','PREPARING','SERVED'].includes(o.status))
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((order) => {
                      const isActing = actingIds.has(order.id);
                      return (
                        <motion.div
                          key={order.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className={clsx('rounded-xl border p-3 space-y-2', STATUS_COLORS[order.status])}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={getStatusBadgeVariant(order.status)} className="text-xs">
                                {t(`status.${order.status}`)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</span>
                            </div>
                            {order.total !== undefined && (
                              <span className="text-sm font-semibold">ƒ,ª{order.total.toFixed(2)}</span>
                            )}
                          </div>
                          <div className="space-y-1">
                            {order.items?.slice(0, 4).map((item, idx) => (
                              <div key={idx} className="text-xs flex items-center gap-1">
                                <span className="font-medium">{item.quantity}A-</span>
                                <span className="truncate">{item.item?.name || 'Item'}</span>
                              </div>
                            ))}
                            {(order.items?.length || 0) > 4 && (
                              <div className="text-xs text-muted-foreground">+{(order.items?.length || 0) - 4} more items</div>
                            )}
                          </div>
                          {order.note && (
                            <div className="text-xs italic text-muted-foreground bg-background/50 rounded px-2 py-1">"{order.note}"</div>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {!['PAID', 'CANCELLED'].includes(order.status) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleStatusChange(order.id, 'CANCELLED')}
                                disabled={isActing}
                              >
                                <XCircle className="w-3 h-3" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
