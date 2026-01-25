export type OrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'PAID' | 'CANCELLED';
export type OrderItemStatus = 'PLACED' | 'ACCEPTED' | 'SERVED';
export type UserRole = 'waiter' | 'manager' | 'cook' | 'architect';
export type OrderingMode = 'qr' | 'waiter' | 'hybrid';

export interface MenuItem {
  id: string;
  name?: string;
  title?: string;
  titleEn?: string;
  titleEl?: string;
  description?: string;
  descriptionEn?: string;
  descriptionEl?: string;
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
  displayName?: string;
  displayDescription?: string;
  printerTopic?: string | null;
  modifiers?: Modifier[];
}

export interface Modifier {
  id: string;
  name: string;
  titleEn?: string;
  titleEl?: string;
  options: ModifierOption[];
  required?: boolean;
  minSelect?: number;
  maxSelect?: number | null;
  title?: string;
  isAvailable?: boolean;
}

export interface ModifierOption {
  id: string;
  label: string;
  titleEn?: string;
  titleEl?: string;
  priceDelta?: number;
  priceDeltaCents?: number;
  title?: string;
  sortOrder?: number;
}

export interface CartItem {
  item: MenuItem;
  quantity: number;
  selectedModifiers: { [modifierId: string]: string };
  orderItemId?: string;
  status?: OrderItemStatus;
  acceptedAt?: string | null;
  servedAt?: string | null;
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
  preparingAt?: string | null;
  readyAt?: string | null;
  paidAt?: string | null;
  cancelledAt?: string | null;
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
  storeId?: string;
  storeSlug?: string;
  cookTypeId?: string | null;
  waiterTypeId?: string | null;
  cookType?: StaffType | null;
  waiterType?: StaffType | null;
}

export interface Table {
  id: string;
  label: string;
  active?: boolean;
  isActive?: boolean;
}

export interface QRTile {
  id: string;
  storeId: string;
  storeSlug?: string;
  publicCode: string;
  label?: string | null;
  isActive: boolean;
  tableId?: string | null;
  tableLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderQueueSummary {
  ahead?: number;
}

export interface MenuCategory {
  id: string;
  title: string;
  titleEn?: string;
  titleEl?: string;
  sortOrder?: number;
  printerTopic?: string | null;
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
  itemId?: string;
  printerTopic?: string | null;
  modifiers?: Array<{
    id?: string;
    modifierId?: string;
    modifierOptionId?: string;
    title?: string;
    priceDeltaCents?: number;
  }>;
  quantity?: number;
  qty?: number;
}

export interface SubmittedOrderSummary {
  id?: string;
  tableId?: string;
  tableLabel?: string;
  table?: string;
  createdAt?: string;
   updatedAt?: string;
  total?: number;
  totalCents?: number;
  items?: SubmittedOrderItem[];
  status?: OrderStatus;
  note?: string;
  ticketNumber?: number;
}

export interface StoreInfo {
  id: string;
  name: string;
  slug?: string;
  currencyCode?: string;
  currencySymbol?: string;
  timezone?: string;
  orderingMode?: OrderingMode;
   printers?: string[];
}

export interface LandingStoreLink {
  id: string;
  name: string;
  slug?: string;
  tableId?: string | null;
  tableLabel?: string | null;
  publicCode?: string | null;
}

export interface ManagerTableSummary {
  id: string;
  label: string;
  isActive: boolean;
  waiterCount: number;
  orderCount: number;
  openOrders?: number;
}

export interface WaiterSummary {
  id: string;
  email: string;
  displayName: string;
  waiterTypeId?: string | null;
  waiterType?: StaffType | null;
}

export interface CookSummary {
  id: string;
  email: string;
  displayName: string;
  cookTypeId?: string | null;
  cookType?: StaffType | null;
}

export interface StaffType {
  id: string;
  slug: string;
  title: string;
  printerTopic?: string | null;
}

export type CookType = StaffType;
export type WaiterType = StaffType;

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
  titleEn?: string;
  titleEl?: string;
  name?: string;
  description?: string;
  descriptionEn?: string;
  descriptionEl?: string;
  priceCents?: number;
  costCents?: number;
  categoryId?: string;
  category?: string;
  isAvailable?: boolean;
  imageUrl?: string;
  image?: string;
  printerTopic?: string | null;
}

export interface ManagerItemPayload {
  titleEn: string;
  titleEl: string;
  descriptionEn?: string;
  descriptionEl?: string;
  priceCents: number;
  categoryId: string;
  isAvailable?: boolean;
  imageUrl?: string;
  printerTopic?: string | null;
}

export interface ModifierInput {
  titleEn: string;
  titleEl: string;
  minSelect: number;
  maxSelect?: number | null;
  isAvailable?: boolean;
}

export interface ModifierOptionPayload {
  modifierId: string;
  titleEn: string;
  titleEl: string;
  priceDeltaCents: number;
  sortOrder: number;
}

export interface ModifierOptionUpdatePayload {
  title?: string;
  titleEn?: string;
  titleEl?: string;
  priceDeltaCents?: number;
  sortOrder?: number;
}

export interface CategoryPayload {
  titleEn: string;
  titleEl: string;
  sortOrder?: number;
  printerTopic?: string | null;
}

export interface OkResponse {
  ok: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
  store?: {
    id: string;
    slug: string;
    name?: string;
    orderingMode?: OrderingMode;
  };
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
  visit?: string;
}

export interface OrderResponse {
  order: Order;
}

export interface OrdersResponse {
  orders: Order[];
  shift?: {
    id?: string;
    status?: string;
    start?: string;
    end?: string;
  };
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
