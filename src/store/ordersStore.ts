import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Order, OrderStatus } from '@/types';

interface OrdersStore {
  orders: Order[];
  // Priority queue of PREPARING orders (orderIds). First element has priority 1.
  priorityQueue: string[];
  setOrders: (orders: Order[]) => void;
  upsert: (order: Order) => void;
  updateStatus: (orderId: string, status: OrderStatus) => void;
  clear: () => void;
}

export const useOrdersStore = create<OrdersStore>()(
  persist(
    (set, get) => ({
      orders: [],
      priorityQueue: [],
      setOrders: (orders) => set((state) => {
        // Replace orders; rebuild queue from PREPARING orders if needed.
        const queue = new Set(state.priorityQueue || []);
        // add any PREPARING orders not already in queue, ordered by createdAt asc
        const preparing = orders
          .filter((o) => o.status === 'PREPARING')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        for (const o of preparing) {
          if (!queue.has(o.id)) queue.add(o.id);
        }
        // Remove any ids no longer PREPARING
        const nextQueue = Array.from(queue).filter((id) => preparing.some((o) => o.id === id));
        // Apply priorities to orders
        const withPriorities = orders.map((o) => {
          if (o.status === 'PREPARING') {
            const idx = nextQueue.indexOf(o.id);
            return { ...o, priority: idx >= 0 ? idx + 1 : undefined };
          }
          // READY/SERVED/CANCELLED/PLACED -> no priority
          return { ...o, priority: undefined };
        });
        return { orders: withPriorities, priorityQueue: nextQueue };
      }),
      upsert: (order) =>
        set((state) => {
          let queue = state.priorityQueue.slice();
          const existingIdx = state.orders.findIndex((o) => o.id === order.id);
          let nextOrders: Order[];
          if (existingIdx >= 0) {
            nextOrders = state.orders.slice();
            nextOrders[existingIdx] = { ...nextOrders[existingIdx], ...order };
          } else {
            nextOrders = [order, ...state.orders].slice(0, 200);
          }
          // Ensure queue membership
          const cur = nextOrders.find((o) => o.id === order.id);
          if (cur?.status === 'PREPARING') {
            if (!queue.includes(cur.id)) queue.push(cur.id);
          } else {
            queue = queue.filter((id) => id !== cur?.id);
          }
          // Apply priorities
          nextOrders = nextOrders.map((o) =>
            o.status === 'PREPARING' ? { ...o, priority: queue.indexOf(o.id) + 1 || undefined } : { ...o, priority: undefined }
          );
          return { orders: nextOrders, priorityQueue: queue };
        }),
      updateStatus: (orderId, status) =>
        set((state) => {
          const orders = state.orders.map((o) => (o.id === orderId ? { ...o, status } : o));
          let queue = state.priorityQueue.slice();
          // Transition logic
          const updated = orders.find((o) => o.id === orderId);
          if (updated) {
            if (status === 'PREPARING') {
              if (!queue.includes(orderId)) queue.push(orderId);
            } else if (status === 'READY' || status === 'SERVED' || status === 'CANCELLED') {
              queue = queue.filter((id) => id !== orderId);
            }
          }
          // Apply priorities per queue
          const nextOrders = orders.map((o) =>
            o.status === 'PREPARING' ? { ...o, priority: queue.indexOf(o.id) + 1 || undefined } : { ...o, priority: undefined }
          );
          return { orders: nextOrders, priorityQueue: queue };
        }),
      clear: () => set({ orders: [] }),
    }),
    { name: 'orders-storage' }
  )
);

