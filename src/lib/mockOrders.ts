import { Order } from '@/types';
import { MENU_ITEMS } from './menuData';

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord-1',
    tableId: 't1',
    tableLabel: 'T1',
    items: [
      { item: MENU_ITEMS[1], quantity: 2, selectedModifiers: {} },
      { item: MENU_ITEMS[4], quantity: 1, selectedModifiers: {} },
    ],
    total: 9.2,
    status: 'PLACED',
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: 'ord-2',
    tableId: 't2',
    tableLabel: 'T2',
    items: [
      { item: MENU_ITEMS[2], quantity: 1, selectedModifiers: {} },
      { item: MENU_ITEMS[5], quantity: 2, selectedModifiers: {} },
    ],
    total: 9.0,
    status: 'PREPARING',
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: 'ord-3',
    tableId: 't3',
    tableLabel: 'T3',
    items: [
      { item: MENU_ITEMS[0], quantity: 3, selectedModifiers: {} },
    ],
    total: 7.5,
    status: 'READY',
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
  },
];
