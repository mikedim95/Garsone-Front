export type OrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'PAID' | 'CANCELLED';
export type OrderItemStatus = 'PLACED' | 'ACCEPTED' | 'SERVED';
export type UserRole = 'waiter' | 'manager' | 'cook' | 'architect' | 'hybrid';
export type OrderingMode = 'qr' | 'waiter' | 'hybrid';

export interface MenuItem {
  id: string;
  name?: string;
  title?: string;
  titleEn?: string;
  titleEl?: string;
  subcategory?: string | null;
  subcategoryEn?: string | null;
  subcategoryEl?: string | null;
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
  selectedModifiers: { [modifierId: string]: string | string[] };
  selectedModifierLabels?: { [modifierId: string]: string };
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
  printerTopic?: string | null;
  cookTypeId?: string | null;
  waiterTypeId?: string | null;
  cookType?: StaffType | null;
  waiterType?: StaffType | null;
  mustChangePassword?: boolean;
}

export interface ArchitectStoreUser {
  id: string;
  storeId: string;
  email: string;
  displayName: string;
  role: Exclude<UserRole, "architect">;
  createdAt?: string;
  updatedAt?: string;
}

export interface Table {
  id: string;
  label: string;
  active?: boolean;
  isActive?: boolean;
}

export interface QRTile {
  id: string;
  storeId?: string | null;
  storeSlug?: string | null;
  storeName?: string | null;
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

export interface OrderPublicSummary {
  queuePosition?: number | null;
  estimatedMinutes?: number | null;
}

export interface MenuCategory {
  id: string;
  title: string;
  titleEn?: string;
  titleEl?: string;
  imageUrl?: string | null;
  sortOrder?: number;
  printerTopic?: string | null;
}

export interface MenuData {
  categories: MenuCategory[];
  items: MenuItem[];
  updatedAt?: string;
}

export interface SubmittedOrderItem {
  id?: string;
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
  status?: OrderItemStatus;
  unitPrice?: number;
  unitPriceCents?: number;
  acceptedAt?: string | null;
  servedAt?: string | null;
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
  printOnArrival?: boolean;
  settings?: {
    printers?: string[];
    printOnArrival?: boolean;
    [key: string]: unknown;
  };
}

export type RemoteNodeStatus = 'PENDING' | 'ONLINE' | 'APPLYING' | 'DEGRADED' | 'ERROR' | 'OFFLINE';
export type RemotePrinterType = '58' | '80';

export interface RemoteNodePrinter {
  id?: string;
  type: RemotePrinterType;
  ordinal: number;
  mac: string;
  topicSuffix: string;
  interface?: string;
  label?: string;
}

export interface RemoteNodePrinterTestResponse {
  ok: boolean;
  topic: string;
  payload?: unknown;
}

export interface RemoteNodeWifi {
  id?: string;
  ssid: string;
  password?: string;
  passwordSet?: boolean;
  priority?: number;
  hidden?: boolean;
}

export interface RemoteNodeConfigAck {
  version?: number | null;
  receivedAt?: string;
  message?: string;
  applied?: boolean;
  status?: RemoteNodeStatus;
  hostnames?: Partial<Record<"localHostname" | "tailscaleHostname", {
    requested?: string;
    applied?: boolean;
    message?: string;
  }>>;
}

export interface RemoteNodeConfig {
  displayName: string;
  nodeSlug: string;
  tailscaleHostname?: string;
  localHostname?: string;
  wifiSsid?: string;
  wifiPassword?: string;
  wifiPasswordSet?: boolean;
  wifiNetworks?: RemoteNodeWifi[];
  mqttHost: string;
  mqttPort: number;
  mqttTls: boolean;
  mqttInsecure: boolean;
  mqttUser?: string;
  mqttPass?: string;
  mqttPassSet?: boolean;
  dockerImage?: string;
  encoding?: string;
  codepage?: string;
  feedLines?: number;
  pollSeconds?: number;
  timezone?: string;
  supportPhone?: string;
  supportWhatsapp?: string;
  supportUrl?: string;
  notes?: string;
  lastConfigAck?: RemoteNodeConfigAck;
  printers: RemoteNodePrinter[];
}

export interface RemoteNode {
  id: string;
  storeId: string;
  slug: string;
  displayName: string;
  desiredConfigVersion: number;
  lastAppliedVersion?: number | null;
  lastSeenAt?: string | null;
  status: RemoteNodeStatus;
  statusMessage?: string | null;
  lastLog?: string | null;
  createdAt?: string;
  updatedAt?: string;
  config: Partial<RemoteNodeConfig>;
}

export interface PendingNodeAgent {
  id: string;
  nodeKey: string;
  displayName: string;
  localHostname?: string;
  tailscaleHostname?: string;
  macAddresses: string[];
  ipAddresses: string[];
  status: 'PENDING' | 'CLAIMED' | string;
  storeId?: string | null;
  claimedNodeId?: string | null;
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type RemoteNodeStatus = 'PENDING' | 'ONLINE' | 'APPLYING' | 'DEGRADED' | 'ERROR' | 'OFFLINE';
export type RemotePrinterType = '58' | '80';

export interface RemoteNodePrinter {
  id?: string;
  type: RemotePrinterType;
  ordinal: number;
  mac: string;
  topicSuffix: string;
  interface?: string;
  label?: string;
}

export interface RemoteNodeConfig {
  displayName: string;
  nodeSlug: string;
  tailscaleHostname?: string;
  localHostname?: string;
  wifiSsid?: string;
  wifiPassword?: string;
  wifiPasswordSet?: boolean;
  mqttHost: string;
  mqttPort: number;
  mqttTls: boolean;
  mqttInsecure: boolean;
  mqttUser?: string;
  mqttPass?: string;
  mqttPassSet?: boolean;
  dockerImage?: string;
  encoding?: string;
  codepage?: string;
  feedLines?: number;
  pollSeconds?: number;
  timezone?: string;
  supportPhone?: string;
  supportWhatsapp?: string;
  supportUrl?: string;
  notes?: string;
  printers: RemoteNodePrinter[];
}

export interface RemoteNode {
  id: string;
  storeId: string;
  slug: string;
  displayName: string;
  desiredConfigVersion: number;
  lastAppliedVersion?: number | null;
  lastSeenAt?: string | null;
  status: RemoteNodeStatus;
  statusMessage?: string | null;
  lastLog?: string | null;
  createdAt?: string;
  updatedAt?: string;
  config: Partial<RemoteNodeConfig>;
}

export interface StoreOverview {
  id: string;
  name: string;
  slug?: string;
  usersCount: number;
  tilesCount: number;
  ordersCount: number;
}

export interface StoreOnboardPayload {
  slug: string;
  name: string;
  defaultPassword: string;
  currencyCode?: string;
  locale?: string;
  printerTopic?: string;
  tableCount?: number;
  managerEmail?: string;
  waiterEmail?: string;
  cookEmail?: string;
}

export interface StoreOnboardResponse {
  store: StoreInfo;
  profiles: {
    manager: string;
    waiter: string;
    cook: string;
  };
  tableCount: number;
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
  role?: UserRole | Uppercase<UserRole>;
  printerTopic?: string | null;
}

export interface CookSummary {
  id: string;
  email: string;
  displayName: string;
  role?: UserRole | Uppercase<UserRole>;
  printerTopic?: string | null;
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
  subcategory?: string | null;
  subcategoryEn?: string | null;
  subcategoryEl?: string | null;
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
  subcategoryEn?: string | null;
  subcategoryEl?: string | null;
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
  imageUrl?: string | null;
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
  localityApprovalToken?: string;
  localitySessionId?: string;
  paymentSessionId?: string;
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
