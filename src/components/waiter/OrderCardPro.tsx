import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Order, OrderStatus } from '@/types';
import { formatTableLabel } from '@/lib/formatTableLabel';
import { Loader2, Check, ChefHat, UtensilsCrossed, CreditCard } from 'lucide-react';

interface Props {
  order: Order;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  mode?: 'full' | 'waiter';
  busy?: boolean;
  highlighted?: boolean;
}

// Professional, minimal status styling
const statusConfig: Record<OrderStatus, {
  bg: string;
  border: string;
  text: string;
  badge: string;
  badgeText: string;
}> = {
  PLACED: {
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    border: 'border-l-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/50',
    badgeText: 'text-amber-700 dark:text-amber-300',
  },
  PREPARING: {
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    border: 'border-l-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/50',
    badgeText: 'text-blue-700 dark:text-blue-300',
  },
  READY: {
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    border: 'border-l-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    badge: 'bg-emerald-100 dark:bg-emerald-900/50',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
  },
  SERVED: {
    bg: 'bg-slate-50/50 dark:bg-slate-900/20',
    border: 'border-l-slate-400',
    text: 'text-slate-600 dark:text-slate-400',
    badge: 'bg-slate-100 dark:bg-slate-800/50',
    badgeText: 'text-slate-600 dark:text-slate-400',
  },
  PAID: {
    bg: 'bg-green-50/50 dark:bg-green-950/20',
    border: 'border-l-green-600',
    text: 'text-green-700 dark:text-green-400',
    badge: 'bg-green-100 dark:bg-green-900/50',
    badgeText: 'text-green-700 dark:text-green-300',
  },
  CANCELLED: {
    bg: 'bg-red-50/50 dark:bg-red-950/20',
    border: 'border-l-red-500',
    text: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-100 dark:bg-red-900/50',
    badgeText: 'text-red-700 dark:text-red-300',
  },
};

const getTimeAgo = (dateStr: string): string => {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
};

export function OrderCardPro({ order, onUpdateStatus, mode = 'full', busy = false, highlighted = false }: Props) {
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;
  const config = statusConfig[order.status];
  const timeAgo = getTimeAgo(order.createdAt);
  
  const handleAction = async (status: OrderStatus) => {
    setLocalBusy(true);
    try {
      await Promise.resolve(onUpdateStatus(order.id, status));
    } finally {
      setLocalBusy(false);
    }
  };

  // Determine action button based on status
  const renderActionButton = () => {
    const buttonBase = 'flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 disabled:opacity-50';
    
    if (mode === 'waiter') {
      if (order.status === 'READY') {
        return (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAction('SERVED')}
            disabled={isBusy}
            className={clsx(buttonBase, 'bg-primary text-primary-foreground hover:bg-primary/90 flex-1')}
          >
            {isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <UtensilsCrossed className="w-4 h-4" />
                <span>Serve</span>
              </>
            )}
          </motion.button>
        );
      }
      if (order.status === 'SERVED') {
        return (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAction('PAID')}
            disabled={isBusy}
            className={clsx(buttonBase, 'bg-green-600 text-white hover:bg-green-700 flex-1')}
          >
            {isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Paid</span>
              </>
            )}
          </motion.button>
        );
      }
      return null;
    }
    
    // Full mode
    if (order.status === 'PLACED') {
      return (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction('PREPARING')}
          disabled={isBusy}
          className={clsx(buttonBase, 'bg-secondary text-secondary-foreground hover:bg-secondary/80 flex-1')}
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ChefHat className="w-4 h-4" /><span>Start</span></>}
        </motion.button>
      );
    }
    if (order.status === 'PREPARING') {
      return (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction('READY')}
          disabled={isBusy}
          className={clsx(buttonBase, 'bg-accent text-accent-foreground hover:bg-accent/90 flex-1')}
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /><span>Ready</span></>}
        </motion.button>
      );
    }
    if (order.status === 'READY') {
      return (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction('SERVED')}
          disabled={isBusy}
          className={clsx(buttonBase, 'bg-primary text-primary-foreground hover:bg-primary/90 flex-1')}
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UtensilsCrossed className="w-4 h-4" /><span>Serve</span></>}
        </motion.button>
      );
    }
    if (order.status === 'SERVED') {
      return (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction('PAID')}
          disabled={isBusy}
          className={clsx(buttonBase, 'bg-green-600 text-white hover:bg-green-700 flex-1')}
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CreditCard className="w-4 h-4" /><span>Paid</span></>}
        </motion.button>
      );
    }
    return null;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={clsx(
        'group relative rounded-xl border border-border/60 overflow-hidden transition-all duration-300',
        'border-l-4',
        config.bg,
        config.border,
        highlighted && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background animate-pulse'
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Table label - prominent */}
          <span className="text-lg font-bold text-foreground">
            {formatTableLabel(order.tableLabel)}
          </span>
          
          {/* Status badge */}
          <span className={clsx(
            'px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide',
            config.badge,
            config.badgeText
          )}>
            {order.status === 'CANCELLED' ? 'CANCELED' : order.status}
          </span>
        </div>
        
        {/* Time indicator */}
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {timeAgo}
        </span>
      </div>
      
      {/* Items list - compact */}
      <div className="px-4 pb-3">
        <div className="space-y-1">
          {(order.items ?? []).slice(0, 4).map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-foreground min-w-[1.5rem]">
                {item.quantity}×
              </span>
              <span className="text-muted-foreground truncate">
                {item.item.name ?? 'Item'}
              </span>
            </div>
          ))}
          {(order.items ?? []).length > 4 && (
            <div className="text-xs text-muted-foreground pl-7">
              +{order.items.length - 4} more items
            </div>
          )}
        </div>
        
        {/* Note if present */}
        {order.note && (
          <div className="mt-2 px-2 py-1.5 rounded-md bg-muted/50 text-xs text-muted-foreground italic">
            "{order.note}"
          </div>
        )}
      </div>
      
      {/* Action button */}
      {renderActionButton() && (
        <div className="px-4 pb-4">
          {renderActionButton()}
        </div>
      )}
    </motion.div>
  );
}
