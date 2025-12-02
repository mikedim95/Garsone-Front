import { useState } from 'react';
import { Order, OrderStatus } from '@/types';
import { formatTableLabel } from '@/lib/formatTableLabel';
import { Loader2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface Props {
  order: Order;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  mode?: 'full' | 'waiter'; // waiter: only READY -> SERVED
  busy?: boolean; // show spinner when true (e.g., serving)
  highlighted?: boolean;
}

const statusColors = {
  PLACED: 'bg-blue-50 text-blue-700 border border-blue-200',
  PREPARING: 'bg-amber-50 text-amber-700 border border-amber-200',
  READY: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  SERVED: 'bg-slate-100 text-slate-700 border border-slate-200',
  PAID: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  CANCELLED: 'bg-rose-50 text-rose-700 border border-rose-200',
} as const;

const borderColors = {
  PLACED: 'border-l-4 border-blue-200',
  PREPARING: 'border-l-4 border-amber-300',
  READY: 'border-l-4 border-emerald-300',
  SERVED: 'border-l-4 border-slate-200',
  PAID: 'border-l-4 border-emerald-400',
  CANCELLED: 'border-l-4 border-rose-300',
} as const;

export const OrderCard = ({ order, onUpdateStatus, mode = 'full', busy = false, highlighted = false }: Props) => {
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;
  const startPreparingLabel = 'Start preparing';
  const markReadyLabel = 'Mark ready';
  const markServedLabel = 'Mark served';
  const markPaidLabel = 'Mark paid';
  const border = borderColors[order.status] || '';
  const statusClass = statusColors[order.status] || 'bg-muted text-foreground';
  const statusLabel = order.status === 'CANCELLED' ? 'CANCELED' : order.status;
  return (
    <Card
      className={`p-4 transition-all duration-200 ${border} hover:shadow-lg hover:-translate-y-0.5 ${highlighted ? 'animate-pulse ring-2 ring-primary/50 ring-offset-2' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">{formatTableLabel(order.tableLabel)}</h3>
          <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleTimeString()}</p>
        </div>
        <Badge className={`${statusClass} animate-in fade-in zoom-in-90 duration-200`}>{statusLabel}</Badge>
      </div>
      
      <div className="space-y-2 mb-4">
        {(order.items ?? []).map((item, idx) => (
          <div key={idx} className="text-sm">
            <span className="font-medium">{item.quantity}x</span> {item.item.name ?? 'Item'}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {mode === 'full' ? (
          <>
            {order.status === 'PLACED' && (
              <Button
                size="sm"
                onClick={() => onUpdateStatus(order.id, 'PREPARING')}
                className="flex-1 inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-md"
                aria-label={startPreparingLabel}
                title={startPreparingLabel}
              >
                <span role="img" aria-hidden="true" className="text-2xl leading-none">
                  🍳
                </span>
              </Button>
            )}
            {order.status === 'PREPARING' && (
              <Button
                size="sm"
                onClick={() => onUpdateStatus(order.id, 'READY')}
                className="flex-1 inline-flex items-center justify-center bg-accent text-accent-foreground hover:bg-accent/90 shadow-md"
                aria-label={markReadyLabel}
                title={markReadyLabel}
              >
                <span role="img" aria-hidden="true" className="text-2xl leading-none">
                  ✅
                </span>
              </Button>
            )}
            {order.status === 'READY' && (
              <Button
                size="sm"
                onClick={() => {
                  setLocalBusy(true);
                  Promise.resolve(onUpdateStatus(order.id, 'SERVED'))
                    .catch(() => {})
                    .finally(() => {
                      setLocalBusy(false);
                    });
                }}
                className="relative flex-1 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                aria-busy={isBusy}
                data-busy={isBusy ? 'true' : 'false'}
                disabled={isBusy}
                aria-label={markServedLabel}
                title={markServedLabel}
              >
                <span className={`absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none ${isBusy ? 'opacity-100' : 'opacity-0'}`}>
                  <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
                </span>
                <span className={`transition-opacity ${isBusy ? 'opacity-0' : 'opacity-100'}`} role="img" aria-hidden="true">
                  🥂
                </span>
              </Button>
            )}
            {order.status === 'SERVED' && (
              <Button
                size="sm"
                onClick={() => {
                  setLocalBusy(true);
                  Promise.resolve(onUpdateStatus(order.id, 'PAID'))
                    .catch(() => {})
                    .finally(() => {
                      setLocalBusy(false);
                    });
                }}
                className="relative flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 shadow-md"
                aria-label={markPaidLabel}
                title={markPaidLabel}
                aria-busy={isBusy}
                data-busy={isBusy ? 'true' : 'false'}
                disabled={isBusy}
              >
                <span className={`absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none ${isBusy ? 'opacity-100' : 'opacity-0'}`}>
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </span>
                <span className={`transition-opacity ${isBusy ? 'opacity-0' : 'opacity-100'}`} role="img" aria-hidden="true">
                  💳
                </span>
              </Button>
            )}
          </>
        ) : (
          <>
            {order.status === 'READY' && (
              <Button
                size="sm"
                onClick={() => {
                  setLocalBusy(true);
                  Promise.resolve(onUpdateStatus(order.id, 'SERVED'))
                    .catch(() => {})
                    .finally(() => setLocalBusy(false));
                }}
                className="relative flex-1 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                aria-busy={isBusy}
                data-busy={isBusy ? 'true' : 'false'}
                disabled={isBusy}
                aria-label={markServedLabel}
                title={markServedLabel}
              >
                <span className={`absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none ${isBusy ? 'opacity-100' : 'opacity-0'}`}>
                  <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
                </span>
                <span className={`transition-opacity ${isBusy ? 'opacity-0' : 'opacity-100'}`} role="img" aria-hidden="true">
                  🥂
                </span>
              </Button>
            )}
            {order.status === 'SERVED' && (
              <Button
                size="sm"
                onClick={() => {
                  setLocalBusy(true);
                  Promise.resolve(onUpdateStatus(order.id, 'PAID'))
                    .catch(() => {})
                    .finally(() => {
                      setLocalBusy(false);
                    });
                }}
                className="relative flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 shadow-md"
                aria-label={markPaidLabel}
                title={markPaidLabel}
                aria-busy={isBusy}
                data-busy={isBusy ? 'true' : 'false'}
                disabled={isBusy}
              >
                <span className={`absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none ${isBusy ? 'opacity-100' : 'opacity-0'}`}>
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </span>
                <span className={`transition-opacity ${isBusy ? 'opacity-0' : 'opacity-100'}`} role="img" aria-hidden="true">
                  💳
                </span>
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
};
