import { useState } from 'react';
import { Order, OrderStatus } from '@/types';
import { Loader2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface Props {
  order: Order;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  mode?: 'full' | 'waiter'; // waiter: only READY -> SERVED
  busy?: boolean; // show spinner when true (e.g., serving)
}

const statusColors = {
  PLACED: 'bg-secondary text-secondary-foreground',
  PREPARING: 'bg-accent text-accent-foreground',
  READY: 'bg-primary/15 text-primary',
  SERVED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-destructive/10 text-destructive',
} as const;

const borderColors = {
  PLACED: 'border-l-4 border-secondary',
  PREPARING: 'border-l-4 border-accent',
  READY: 'border-l-4 border-primary',
  SERVED: 'border-l-4 border-muted',
  CANCELLED: 'border-l-4 border-destructive',
} as const;

export const OrderCard = ({ order, onUpdateStatus, mode = 'full', busy = false }: Props) => {
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;
  const startPreparingLabel = 'Start preparing';
  const markReadyLabel = 'Mark ready';
  const markServedLabel = 'Mark served';
  const border = borderColors[order.status] || '';
  return (
    <Card className={`p-4 ${border}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">Table {order.tableLabel}</h3>
          <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleTimeString()}</p>
        </div>
        <Badge className={statusColors[order.status]}>{order.status}</Badge>
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
          </>
        ) : (
          <>
            {order.status === 'READY' && (
              <Button
                size="sm"
                onClick={() => onUpdateStatus(order.id, 'SERVED')}
                className="flex-1 inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                aria-label={markServedLabel}
                title={markServedLabel}
              >
                <span role="img" aria-hidden="true" className="text-2xl leading-none">
                  🥂
                </span>
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
};
