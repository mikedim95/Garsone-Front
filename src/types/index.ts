export type OrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type UserRole = 'waiter' | 'manager' | 'cook';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  available: boolean;
  modifiers?: Modifier[];
}

export interface Modifier {
  id: string;
  name: string;
  options: ModifierOption[];
  required?: boolean;
  minSelect?: number;
  maxSelect?: number | null;
}

export interface ModifierOption {
  id: string;
  label: string;
  priceDelta: number;
}

export interface CartItem {
  item: MenuItem;
  quantity: number;
  selectedModifiers: { [modifierId: string]: string };
}

export interface Order {
  id: string;
  tableId: string;
  tableLabel: string;
  items: CartItem[];
  total: number;
  totalCents?: number;
  status: OrderStatus;
  placedAt?: string;
  createdAt: string;
  updatedAt?: string;
  servedAt?: string | null;
  cancelReason?: string | null;
  ticketNumber?: number;
  note?: string;
  // Local-only: preparation queue priority (1 = highest). Present only while PREPARING.
  priority?: number;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
}

export interface Table {
  id: string;
  label: string;
  active: boolean;
}
