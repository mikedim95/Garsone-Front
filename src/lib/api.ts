// API service with auth + robust JSON/error handling
import { useAuthStore } from "@/store/authStore";
import type {
  AuthResponse,
  CategoryPayload,
  CreateOrderPayload,
  ImageUploadPayload,
  ImageUploadResponse,
  ManagerItemPayload,
  ManagerItemSummary,
  ManagerTableSummary,
  MenuCategory,
  MenuData,
  Modifier,
  ModifierOption,
  ModifierInput,
  ModifierOptionPayload,
  ModifierOptionUpdatePayload,
  QRTile,
  OkResponse,
  OrderQueueSummary,
  OrderResponse,
  OrdersResponse,
  OrderStatus,
  LandingStoreLink,
  StoreInfo,
  Table,
  WaiterSummary,
  WaiterTableOverview,
} from "@/types";
import { devMocks } from "./devMocks";
import { getStoredStoreSlug } from "./storeSlug";

const ENV_API: string | undefined = import.meta.env.VITE_API_URL;
export const API_BASE = (() => {
  // Use env only if it isn't pointing to localhost (which breaks on phones)
  if (ENV_API && ENV_API.trim().length > 0 && !/^https?:\/\/(localhost|127\.)/i.test(ENV_API.trim())) {
    return ENV_API.trim();
  }
  // Otherwise derive from current host (works for LAN devices)
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    const port = 8787;
    return `${protocol}//${hostname}:${port}`;
  }
  return 'http://localhost:8787';
})();

export function isOffline() {
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage?.getItem('OFFLINE') : null;
    if (ls === '1' || ls === 'true') return true;
  } catch (error) {
    console.warn('Failed to read OFFLINE flag', error);
  }
  const v = import.meta.env.VITE_OFFLINE;
  return String(v ?? '').toLowerCase() === '1' || String(v ?? '').toLowerCase() === 'true';
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const withVisit = <T extends Record<string, any>>(payload: T): T => payload;

type ManagerTableCreateInput = { label: string; isActive?: boolean };
type ManagerTableUpdateInput = Partial<ManagerTableCreateInput>;
type OrderStatusUpdateOptions = { cancelReason?: string; skipMqtt?: boolean };
type CreateWaiterPayload = { email: string; password: string; displayName: string };
type UpdateWaiterPayload = Partial<CreateWaiterPayload>;
type ManagerItemUpdatePayload = Partial<ManagerItemPayload>;
type ModifierUpdatePayload = Partial<Modifier>;
type EditOrderPayload = CreateOrderPayload;
type QRTileUpdatePayload = { tableId?: string | null; isActive?: boolean; label?: string };
type BulkTilePayload = { count: number; labelPrefix?: string };

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const getStoreSlug = () => {
    return getStoredStoreSlug() || undefined;
  };
  try {
    const token = useAuthStore.getState().token;
    const storeSlug = getStoreSlug();
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(storeSlug ? { "x-store-slug": storeSlug } : {}),
        ...options?.headers,
      },
    });

    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      throw new ApiError(response.status, "Server returned non-JSON response");
    }

    if (!response.ok) {
      const error = await response.json();
      const message = error.error || error.message || "Request failed";
      throw new ApiError(response.status, message);
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, "Network error or invalid response");
  }
}

export const api = {
  getLandingStores: async (): Promise<{ stores: LandingStoreLink[] }> => {
    if (isOffline()) {
      const [storeRes, tablesRes] = await Promise.all([devMocks.getStore(), devMocks.getTables()]);
      const table = tablesRes?.tables?.[0];
      const store = (storeRes as any)?.store || (storeRes as any)?.meta || {};
      return Promise.resolve({
        stores: [
          {
            id: store.id || "offline-store",
            name: store.name || "Offline Demo Store",
            slug: store.slug || "local-store",
            tableId: table?.id ?? null,
            tableLabel: table?.label ?? null,
            publicCode: null,
          },
        ],
      });
    }
    return fetchApi<{ stores: LandingStoreLink[] }>("/landing/stores");
  },

  // Store & tables
  getStore: (): Promise<{ store: StoreInfo }> =>
    isOffline() ? devMocks.getStore() : fetchApi<{ store: StoreInfo }>("/store"),
  getTables: (): Promise<{ tables: Table[] }> =>
    isOffline() ? devMocks.getTables() : fetchApi<{ tables: Table[] }>("/tables"),

  // Manager: table management
  managerListTables: (): Promise<{ tables: ManagerTableSummary[] }> =>
    isOffline()
      ? devMocks.managerListTables()
      : fetchApi<{ tables: ManagerTableSummary[] }>("/manager/tables"),
  managerCreateTable: (data: ManagerTableCreateInput): Promise<{ table: ManagerTableSummary }> =>
    isOffline()
      ? devMocks.managerCreateTable(data)
      : fetchApi<{ table: ManagerTableSummary }>("/manager/tables", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  managerUpdateTable: (
    id: string,
    data: ManagerTableUpdateInput
  ): Promise<{ table: ManagerTableSummary }> =>
    isOffline()
      ? devMocks.managerUpdateTable(id, data)
      : fetchApi<{ table: ManagerTableSummary }>(`/manager/tables/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  managerDeleteTable: (id: string): Promise<{ table: ManagerTableSummary }> =>
    isOffline()
      ? devMocks.managerDeleteTable(id)
      : fetchApi<{ table: ManagerTableSummary }>(`/manager/tables/${id}`, {
          method: "DELETE",
        }),
  managerUploadImage: async (file: File, opts?: { storeSlug?: string; itemId?: string }) => {
    const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Failed to read file'));
      r.readAsDataURL(f);
    });
    const base64 = await toBase64(file);
    const payload: ImageUploadPayload = {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64,
      itemId: opts?.itemId || undefined,
      storeSlug: opts?.storeSlug || undefined,
    };
    return fetchApi<ImageUploadResponse>(`/manager/uploads/image`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Auth
  signIn: (email: string, password: string): Promise<AuthResponse> =>
    isOffline()
      ? devMocks.signIn(email, password)
      : fetchApi<AuthResponse>("/auth/signin", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),

  // Menu & orders (public device endpoints for create + call waiter)
  getMenu: (): Promise<MenuData> =>
    isOffline() ? devMocks.getMenu() : fetchApi<MenuData>("/menu"),
  createOrder: (data: CreateOrderPayload): Promise<OrderResponse> => {
    const visitHeaders = data.visit ? { "x-table-visit": data.visit } : undefined;
    return isOffline()
      ? devMocks.createOrder(data)
      : fetchApi<OrderResponse>("/orders", {
          method: "POST",
          body: JSON.stringify(withVisit(data)),
          ...(visitHeaders ? { headers: visitHeaders } : {}),
        });
  },
  editOrder: (orderId: string, data: EditOrderPayload): Promise<OrderResponse> => {
    const visitHeaders = (data as any)?.visit ? { "x-table-visit": (data as any).visit } : undefined;
    return isOffline()
      ? devMocks.createOrder(data)
      : fetchApi<OrderResponse>(`/orders/${orderId}`, {
          method: "PATCH",
          body: JSON.stringify(withVisit(data)),
          ...(visitHeaders ? { headers: visitHeaders } : {}),
        });
  },
  printOrder: (orderId: string) => fetchApi(`/orders/${orderId}/print`, { method: "POST" }),
  callWaiter: (tableId: string, visit?: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.callWaiter(tableId)
      : fetchApi<OkResponse>("/call-waiter", {
          method: "POST",
          body: JSON.stringify(withVisit({ tableId, ...(visit ? { visit } : {}) })),
          ...(visit ? { headers: { "x-table-visit": visit } } : {}),
        }),
  getOrderQueueSummary: (): Promise<OrderQueueSummary> =>
    isOffline()
      ? devMocks.getOrderQueueSummary()
      : fetchApi<OrderQueueSummary>("/orders/queue"),
  // Authenticated orders API
  getOrders: (params?: { status?: string; take?: number; tableIds?: string[] }): Promise<OrdersResponse> => {
    const q: string[] = [];
    if (params?.status) q.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.take) q.push(`take=${params.take}`);
    if (params?.tableIds?.length) {
      const ids = params.tableIds.map((id) => encodeURIComponent(id)).join(',');
      q.push(`tableIds=${ids}`);
    }
    const query = q.length ? `?${q.join('&')}` : "";
    if (isOffline()) return devMocks.getOrders(params);
    return fetchApi<OrdersResponse>(`/orders${query}`);
  },
  getOrder: (orderId: string): Promise<OrderResponse> =>
    isOffline() ? devMocks.getOrder(orderId) : fetchApi<OrderResponse>(`/orders/${orderId}`),
  updateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    options?: OrderStatusUpdateOptions
  ): Promise<OrderResponse> =>
    isOffline()
      ? devMocks.updateOrderStatus(orderId, status)
      : fetchApi<OrderResponse>(`/orders/${orderId}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status,
            ...(options?.cancelReason ? { cancelReason: options.cancelReason } : {}),
            ...(options?.skipMqtt ? { skipMqtt: true } : {}),
          }),
        }),

  // Manager: waiter-table assignments
  getWaiterTables: (): Promise<WaiterTableOverview> =>
    isOffline() ? devMocks.getWaiterTables() : fetchApi<WaiterTableOverview>("/waiter-tables"),
  assignWaiterTable: (waiterId: string, tableId: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.assignWaiterTable(waiterId, tableId)
      : fetchApi<OkResponse>("/waiter-tables", {
          method: "POST",
          body: JSON.stringify({ waiterId, tableId }),
        }),
  removeWaiterTable: (waiterId: string, tableId: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.removeWaiterTable(waiterId, tableId)
      : fetchApi<OkResponse>("/waiter-tables", {
          method: "DELETE",
          body: JSON.stringify({ waiterId, tableId }),
        }),

  // Manager: waiters CRUD
  listWaiters: (): Promise<{ waiters: WaiterSummary[] }> =>
    isOffline()
      ? devMocks.listWaiters()
      : fetchApi<{ waiters: WaiterSummary[] }>("/manager/waiters"),
  createWaiter: (email: string, password: string, displayName: string): Promise<{ waiter: WaiterSummary }> =>
    isOffline()
      ? devMocks.createWaiter(email, password, displayName)
      : fetchApi<{ waiter: WaiterSummary }>("/manager/waiters", {
          method: "POST",
          body: JSON.stringify({ email, password, displayName }),
        }),
  updateWaiter: (id: string, data: UpdateWaiterPayload): Promise<{ waiter: WaiterSummary }> =>
    isOffline()
      ? devMocks.updateWaiter(id, data)
      : fetchApi<{ waiter: WaiterSummary }>(`/manager/waiters/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteWaiter: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteWaiter(id)
      : fetchApi<OkResponse>(`/manager/waiters/${id}`, { method: "DELETE" }),

  // Manager: items CRUD
  listItems: (): Promise<{ items: ManagerItemSummary[] }> => isOffline()
    ? devMocks.listItems()
    : fetchApi<{ items: ManagerItemSummary[] }>("/manager/items"),
  createItem: (data: ManagerItemPayload): Promise<{ item: ManagerItemSummary }> =>
    isOffline()
      ? devMocks.createItem(data)
      : fetchApi<{ item: ManagerItemSummary }>("/manager/items", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  getItemDetail: (id: string): Promise<{ item?: ManagerItemSummary; modifiers: Modifier[]; links: Array<{ modifierId: string; isRequired: boolean }> }> =>
    fetchApi(`/manager/items/${id}/detail`),
  updateItem: (id: string, data: ManagerItemUpdatePayload): Promise<{ item: ManagerItemSummary | undefined }> =>
    isOffline()
      ? devMocks.updateItem(id, data)
      : fetchApi<{ item: ManagerItemSummary | undefined }>(`/manager/items/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteItem: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteItem(id)
      : fetchApi<OkResponse>(`/manager/items/${id}`, { method: "DELETE" }),

  // Manager: modifiers CRUD
  listModifiers: (): Promise<{ modifiers: Modifier[] }> =>
    isOffline()
      ? devMocks.listModifiers()
      : fetchApi<{ modifiers: Modifier[] }>("/manager/modifiers"),
  createModifier: (data: ModifierInput): Promise<{ modifier: Modifier }> =>
    isOffline()
      ? devMocks.createModifier(data)
      : fetchApi<{ modifier: Modifier }>("/manager/modifiers", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  updateModifier: (id: string, data: ModifierUpdatePayload): Promise<{ modifier?: Modifier }> =>
    isOffline()
      ? devMocks.updateModifier(id, data as any)
      : fetchApi<{ modifier?: Modifier }>(`/manager/modifiers/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteModifier: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteModifier(id)
      : fetchApi<OkResponse>(`/manager/modifiers/${id}`, { method: "DELETE" }),
  createModifierOption: (data: ModifierOptionPayload): Promise<{ option: ModifierOption }> =>
    isOffline()
      ? devMocks.createModifierOption(data)
      : fetchApi<{ option: ModifierOption }>("/manager/modifier-options", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  updateModifierOption: (id: string, data: ModifierOptionUpdatePayload): Promise<OkResponse> =>
    isOffline()
      ? devMocks.updateModifierOption(id, data)
      : fetchApi<OkResponse>(`/manager/modifier-options/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteModifierOption: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteModifierOption(id)
      : fetchApi<OkResponse>(`/manager/modifier-options/${id}`, { method: "DELETE" }),
  linkItemModifier: (itemId: string, modifierId: string, isRequired: boolean): Promise<OkResponse> =>
    isOffline()
      ? devMocks.linkItemModifier(itemId, modifierId, isRequired)
      : fetchApi<OkResponse>("/manager/item-modifiers", {
          method: "POST",
          body: JSON.stringify({ itemId, modifierId, isRequired }),
        }),
  unlinkItemModifier: (itemId: string, modifierId: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.unlinkItemModifier(itemId, modifierId)
      : fetchApi<OkResponse>("/manager/item-modifiers", {
          method: "DELETE",
          body: JSON.stringify({ itemId, modifierId }),
        }),

  // Manager: orders admin
  managerDeleteOrder: (orderId: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.managerDeleteOrder(orderId)
      : fetchApi<OkResponse>(`/manager/orders/${orderId}`, { method: 'DELETE' }),
  managerCancelOrder: (orderId: string): Promise<OrderResponse> =>
    isOffline()
      ? devMocks.managerCancelOrder(orderId)
      : fetchApi<OrderResponse>(`/manager/orders/${orderId}/cancel`, { method: 'PATCH' }),

  // Manager: categories
  listCategories: (): Promise<{ categories: MenuCategory[] }> =>
    isOffline()
      ? devMocks.listCategories()
      : fetchApi<{ categories: MenuCategory[] }>('/manager/categories'),
  createCategory: (titleEn: string, titleEl: string, sortOrder?: number): Promise<{ category: MenuCategory }> =>
    isOffline()
      ? devMocks.createCategory(titleEn, sortOrder)
      : fetchApi<{ category: MenuCategory }>('/manager/categories', {
          method: 'POST',
          body: JSON.stringify({ titleEn, titleEl, sortOrder }),
        }),
  updateCategory: (id: string, data: Partial<CategoryPayload>): Promise<{ category?: MenuCategory }> =>
    isOffline()
      ? devMocks.updateCategory(id, data)
      : fetchApi<{ category?: MenuCategory }>(`/manager/categories/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
  deleteCategory: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteCategory(id)
      : fetchApi<OkResponse>(`/manager/categories/${id}`, { method: 'DELETE' }),

  // Architect / admin: QR tiles + stores
  adminListStores: (): Promise<{ stores: StoreInfo[] }> =>
    isOffline()
      ? devMocks.adminListStores()
      : fetchApi<{ stores: StoreInfo[] }>('/admin/stores'),
  adminListStoreTables: (storeId: string): Promise<{ tables: ManagerTableSummary[] }> =>
    isOffline()
      ? devMocks.adminListStoreTables(storeId)
      : fetchApi<{ tables: ManagerTableSummary[] }>(`/admin/stores/${storeId}/tables`),
  adminListQrTiles: (storeId: string): Promise<{ store?: StoreInfo; tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminListQrTiles(storeId)
      : fetchApi<{ store?: StoreInfo; tiles: QRTile[] }>(`/admin/stores/${storeId}/qr-tiles`),
  adminBulkCreateQrTiles: (storeId: string, data: BulkTilePayload): Promise<{ tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminBulkCreateQrTiles(storeId, data)
      : fetchApi<{ tiles: QRTile[] }>(`/admin/stores/${storeId}/qr-tiles/bulk`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
  adminUpdateQrTile: (id: string, data: QRTileUpdatePayload): Promise<{ tile: QRTile }> =>
    isOffline()
      ? devMocks.adminUpdateQrTile(id, data)
      : fetchApi<{ tile: QRTile }>(`/admin/qr-tiles/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
  adminDeleteQrTile: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.adminDeleteQrTile(id)
      : fetchApi<OkResponse>(`/admin/qr-tiles/${id}`, { method: 'DELETE' }),
  resolveQrTile: (publicCode: string): Promise<any> =>
    isOffline()
      ? devMocks.resolveQrTile(publicCode)
      : fetchApi(`/q/${encodeURIComponent(publicCode)}`),

  // Manager: QR tiles binding for own store (uses admin endpoints with storeId)
  managerListQrTiles: (storeId: string): Promise<{ tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminListQrTiles(storeId)
      : fetchApi<{ tiles: QRTile[] }>(`/admin/stores/${storeId}/qr-tiles`),
  managerUpdateQrTile: (id: string, data: QRTileUpdatePayload): Promise<{ tile: QRTile }> =>
    isOffline()
      ? devMocks.adminUpdateQrTile(id, data)
      : fetchApi<{ tile: QRTile }>(`/admin/qr-tiles/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
};
