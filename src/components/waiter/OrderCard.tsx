import { useEffect, useState } from 'react';
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
  PLACED: 'bg-blue-100 text-blue-800',
  PREPARING: 'bg-amber-100 text-amber-800',
  READY: 'bg-green-100 text-green-800',
  SERVED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
} as const;

const borderColors = {
  PLACED: 'border-l-4 border-blue-500',
  PREPARING: 'border-l-4 border-amber-500',
  READY: 'border-l-4 border-green-500',
  SERVED: 'border-l-4 border-gray-400',
  CANCELLED: 'border-l-4 border-red-500',
} as const;

export const OrderCard = ({ order, onUpdateStatus, mode = 'full', busy = false }: Props) => {
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;
  const startPreparingLabel = 'Start preparing';
  const markReadyLabel = 'Mark ready';
  const markServedLabel = 'Mark served';

  // Debug logs to help diagnose spinner issues
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[OrderCard] render', { id: order.id, status: order.status, busyProp: busy, localBusy, isBusy });
  });
  const border = borderColors[order.status] || '';
  return (
    <Card className={`p-4 ${border}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">Table {order.tableLabel}</h3>
          <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleTimeString()}</p>
        </div>
        <Badge className={statusColors[order.status]}>{order.status}</Badge>
      </div>
      
      <div className="space-y-2 mb-4">
        {(order.items || []).filter(Boolean).map((ci: any, idx: number) => {
          const qty = ci?.quantity ?? ci?.qty ?? 1;
          const name = ci?.item?.name ?? ci?.name ?? 'Item';
          return (
            <div key={idx} className="text-sm">
              <span className="font-medium">{qty}x</span> {name}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        {mode === 'full' ? (
          <>
            {order.status === 'PLACED' && (
              <Button
                size="sm"
                onClick={() => onUpdateStatus(order.id, 'PREPARING')}
                className="flex-1 inline-flex items-center justify-center bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md"
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
                className="flex-1 inline-flex items-center justify-center bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-md"
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
                  // eslint-disable-next-line no-console
                  console.log('[OrderCard] Mark Served clicked', { id: order.id });
                  setLocalBusy(true);
                  Promise.resolve(onUpdateStatus(order.id, 'SERVED'))
                    .then(() => {
                      // eslint-disable-next-line no-console
                      console.log('[OrderCard] Mark Served success', { id: order.id });
                    })
                    .catch((err) => {
                      // eslint-disable-next-line no-console
                      console.error('[OrderCard] Mark Served error', { id: order.id, err });
                    })
                    .finally(() => {
                      // eslint-disable-next-line no-console
                      console.log('[OrderCard] Mark Served finally (clearing localBusy)', { id: order.id });
                      setLocalBusy(false);
                    });
                }}
                className="relative flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md"
                aria-busy={isBusy}
                data-busy={isBusy ? 'true' : 'false'}
                disabled={isBusy}
                aria-label={markServedLabel}
                title={markServedLabel}
              >
                <span className={`absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none ${isBusy ? 'opacity-100' : 'opacity-0'}`}>
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
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
                className="flex-1 inline-flex items-center justify-center bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md"
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
