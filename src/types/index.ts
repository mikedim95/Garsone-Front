export type OrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type UserRole = 'waiter' | 'manager' | 'cook';

export interface MenuItem {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  price?: number;
  priceCents?: number;
  cost?: number;
  costCents?: number;
  image?: string;
  imageUrl?: string;
  category?: string;
  categoryId?: string;
  available?: boolean;
  isAvailable?: boolean;
  modifiers?: Modifier[];
}

export interface Modifier {
  id: string;
  name: string;
  options: ModifierOption[];
  required?: boolean;
  minSelect?: number;
  maxSelect?: number | null;
  title?: string;
}

export interface ModifierOption {
  id: string;
  label: string;
  priceDelta?: number;
  priceDeltaCents?: number;
  title?: string;
  sortOrder?: number;
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
  active?: boolean;
  isActive?: boolean;
}

export interface OrderQueueSummary {
  ahead?: number;
}

export interface MenuCategory {
  id: string;
  title: string;
  sortOrder?: number;
}

export interface MenuData {
  categories: MenuCategory[];
  items: MenuItem[];
  updatedAt?: string;
}

export interface SubmittedOrderItem {
  title?: string;
  name?: string;
  item?: MenuItem;
  quantity?: number;
  qty?: number;
}

export interface SubmittedOrderSummary {
  id?: string;
  tableId?: string;
  tableLabel?: string;
  table?: string;
  createdAt?: string;
  total?: number;
  totalCents?: number;
  items?: SubmittedOrderItem[];
  status?: OrderStatus;
}

export interface StoreInfo {
  id: string;
  name: string;
  slug?: string;
  currencyCode?: string;
  currencySymbol?: string;
  timezone?: string;
}

export interface ManagerTableSummary {
  id: string;
  label: string;
  isActive: boolean;
  waiterCount: number;
  orderCount: number;
}

export interface WaiterSummary {
  id: string;
  email: string;
  displayName: string;
}

export interface WaiterTableAssignment {
  waiterId: string;
  tableId: string;
  waiter: WaiterSummary;
  table: Table;
}

export interface WaiterTableOverview {
  assignments: WaiterTableAssignment[];
  waiters: WaiterSummary[];
  tables: Table[];
}

export interface ManagerItemSummary {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  priceCents?: number;
  costCents?: number;
  categoryId?: string;
  category?: string;
  isAvailable?: boolean;
  imageUrl?: string;
  image?: string;
}

export interface ManagerItemPayload {
  title: string;
  description?: string;
  priceCents: number;
  categoryId: string;
  isAvailable?: boolean;
  imageUrl?: string;
}

export interface ModifierInput {
  title: string;
  minSelect: number;
  maxSelect: number | null;
}

export interface ModifierOptionPayload {
  modifierId: string;
  title: string;
  priceDeltaCents: number;
  sortOrder: number;
}

export interface ModifierOptionUpdatePayload {
  title?: string;
  priceDeltaCents?: number;
  sortOrder?: number;
}

export interface CategoryPayload {
  title: string;
  sortOrder?: number;
}

export interface OkResponse {
  ok: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface CreateOrderPayloadItem {
  itemId: string;
  quantity: number;
  modifiers?: string | Record<string, unknown>;
}

export interface CreateOrderPayload {
  tableId: string;
  items: CreateOrderPayloadItem[];
  note?: string;
}

export interface OrderResponse {
  order: Order;
}

export interface OrdersResponse {
  orders: Order[];
}

export interface ImageUploadPayload {
  fileName: string;
  mimeType: string;
  base64: string;
  storeSlug?: string;
  itemId?: string;
}

export interface ImageUploadResponse {
  publicUrl: string;
  path: string;
}
