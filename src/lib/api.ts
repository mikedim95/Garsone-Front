// API service with auth + robust JSON/error handling
import { useAuthStore } from "@/store/authStore";
import { devMocks } from "./devMocks";

const ENV_API: string | undefined = (import.meta as any).env?.VITE_API_URL;
const API_BASE = (() => {
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

function isOffline() {
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage?.getItem('OFFLINE') : null;
    if (ls === '1' || ls === 'true') return true;
  } catch {}
  const v = (import.meta as any).env?.VITE_OFFLINE;
  return String(v ?? '').toLowerCase() === '1' || String(v ?? '').toLowerCase() === 'true';
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  try {
    const token = useAuthStore.getState().token;
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  // Store & tables
  getStore: () => isOffline() ? devMocks.getStore() : fetchApi("/store"),
  getTables: () => isOffline() ? devMocks.getTables() : fetchApi("/tables"),

  // Manager: table management
  managerListTables: () => isOffline() ? devMocks.managerListTables() as any : fetchApi("/manager/tables"),
  managerCreateTable: (data: { label: string; isActive?: boolean }) => isOffline()
    ? devMocks.managerCreateTable(data) as any
    : fetchApi("/manager/tables", { method: "POST", body: JSON.stringify(data) }),
  managerUpdateTable: (id: string, data: { label?: string; isActive?: boolean }) => isOffline()
    ? devMocks.managerUpdateTable(id, data) as any
    : fetchApi(`/manager/tables/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  managerDeleteTable: (id: string) => isOffline()
    ? devMocks.managerDeleteTable(id) as any
    : fetchApi(`/manager/tables/${id}`, { method: "DELETE" }),
  managerUploadImage: async (file: File, opts?: { storeSlug?: string; itemId?: string }) => {
    const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Failed to read file'));
      r.readAsDataURL(f);
    });
    const base64 = await toBase64(file);
    const payload = {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64,
      itemId: opts?.itemId || undefined,
    } as any;
    return fetchApi<{ publicUrl: string; path: string }>(`/manager/uploads/image`, { method: 'POST', body: JSON.stringify(payload) });
  },

  // Auth
  signIn: (email: string, password: string) => {
    if (isOffline()) return devMocks.signIn(email, password) as any;
    return fetchApi<{ accessToken: string; user: any }>("/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  // Menu & orders (public device endpoints for create + call waiter)
  getMenu: () => isOffline() ? devMocks.getMenu() : fetchApi("/menu"),
  createOrder: (data: any) => isOffline()
    ? devMocks.createOrder(data) as any
    : fetchApi("/orders", { method: "POST", body: JSON.stringify(data) }),
  editOrder: (orderId: string, data: any) => isOffline()
    ? (devMocks as any).editOrder?.(orderId, data) as any ?? devMocks.createOrder(data) as any
    : fetchApi(`/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(data) }),
  callWaiter: (tableId: string) => isOffline() ? devMocks.callWaiter(tableId) as any :
    fetchApi("/call-waiter", {
      method: "POST",
      body: JSON.stringify({ tableId }),
    }),
  getOrderQueueSummary: () => isOffline()
    ? devMocks.getOrderQueueSummary() as any
    : fetchApi("/orders/queue"),
  // Authenticated orders API
  getOrders: (params?: { status?: string; take?: number }) => {
    const q: string[] = [];
    if (params?.status) q.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.take) q.push(`take=${params.take}`);
    const query = q.length ? `?${q.join('&')}` : "";
    if (isOffline()) return devMocks.getOrders(params) as any;
    return fetchApi(`/orders${query}`);
  },
  getOrder: (orderId: string) => isOffline() ? devMocks.getOrder(orderId) as any : fetchApi(`/orders/${orderId}`),
  updateOrderStatus: (orderId: string, status: string) => isOffline() ?
    devMocks.updateOrderStatus(orderId, status as any) as any :
    fetchApi(`/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // Manager: waiter-table assignments
  getWaiterTables: () => isOffline() ? devMocks.getWaiterTables() as any : fetchApi("/waiter-tables"),
  assignWaiterTable: (waiterId: string, tableId: string) => isOffline() ? devMocks.assignWaiterTable(waiterId, tableId) as any :
    fetchApi("/waiter-tables", {
      method: "POST",
      body: JSON.stringify({ waiterId, tableId }),
    }),
  removeWaiterTable: (waiterId: string, tableId: string) => isOffline() ? devMocks.removeWaiterTable(waiterId, tableId) as any :
    fetchApi("/waiter-tables", {
      method: "DELETE",
      body: JSON.stringify({ waiterId, tableId }),
    }),

  // Manager: waiters CRUD
  listWaiters: () => isOffline() ? devMocks.listWaiters() as any : fetchApi("/manager/waiters"),
  createWaiter: (email: string, password: string, displayName: string) => isOffline() ? devMocks.createWaiter(email, password, displayName) as any :
    fetchApi("/manager/waiters", { method: "POST", body: JSON.stringify({ email, password, displayName }) }),
  updateWaiter: (id: string, data: Partial<{ email: string; password: string; displayName: string }>) => isOffline() ? devMocks.updateWaiter(id, data) as any :
    fetchApi(`/manager/waiters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWaiter: (id: string) => isOffline() ? devMocks.deleteWaiter(id) as any : fetchApi(`/manager/waiters/${id}`, { method: "DELETE" }),

  // Manager: items CRUD
  listItems: () => isOffline() ? devMocks.listItems() as any : fetchApi("/manager/items"),
  createItem: (data: any) => isOffline() ? devMocks.createItem(data) as any : fetchApi("/manager/items", { method: "POST", body: JSON.stringify(data) }),
  updateItem: (id: string, data: any) => isOffline() ? devMocks.updateItem(id, data) as any : fetchApi(`/manager/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteItem: (id: string) => isOffline() ? devMocks.deleteItem(id) as any : fetchApi(`/manager/items/${id}`, { method: "DELETE" }),

  // Manager: modifiers CRUD
  listModifiers: () => isOffline() ? devMocks.listModifiers() as any : fetchApi("/manager/modifiers"),
  createModifier: (data: any) => isOffline() ? devMocks.createModifier(data) as any : fetchApi("/manager/modifiers", { method: "POST", body: JSON.stringify(data) }),
  updateModifier: (id: string, data: any) => isOffline() ? devMocks.updateModifier(id, data) as any : fetchApi(`/manager/modifiers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteModifier: (id: string) => isOffline() ? devMocks.deleteModifier(id) as any : fetchApi(`/manager/modifiers/${id}`, { method: "DELETE" }),
  createModifierOption: (data: any) => isOffline() ? devMocks.createModifierOption(data) as any : fetchApi("/manager/modifier-options", { method: "POST", body: JSON.stringify(data) }),
  updateModifierOption: (id: string, data: any) => isOffline() ? devMocks.updateModifierOption(id, data) as any : fetchApi(`/manager/modifier-options/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteModifierOption: (id: string) => isOffline() ? devMocks.deleteModifierOption(id) as any : fetchApi(`/manager/modifier-options/${id}`, { method: "DELETE" }),
  linkItemModifier: (itemId: string, modifierId: string, isRequired: boolean) => isOffline() ? devMocks.linkItemModifier(itemId, modifierId, isRequired) as any :
    fetchApi("/manager/item-modifiers", { method: "POST", body: JSON.stringify({ itemId, modifierId, isRequired }) }),
  unlinkItemModifier: (itemId: string, modifierId: string) => isOffline() ? devMocks.unlinkItemModifier(itemId, modifierId) as any :
    fetchApi("/manager/item-modifiers", { method: "DELETE", body: JSON.stringify({ itemId, modifierId }) }),

  // Manager: orders admin
  managerDeleteOrder: (orderId: string) => isOffline() ? devMocks.managerDeleteOrder(orderId) as any : fetchApi(`/manager/orders/${orderId}`, { method: 'DELETE' }),
  managerCancelOrder: (orderId: string) => isOffline() ? devMocks.managerCancelOrder(orderId) as any : fetchApi(`/manager/orders/${orderId}/cancel`, { method: 'PATCH' }),

  // Manager: categories
  listCategories: () => isOffline() ? devMocks.listCategories() as any : fetchApi('/manager/categories'),
  createCategory: (title: string, sortOrder?: number) => isOffline() ? devMocks.createCategory(title, sortOrder) as any : fetchApi('/manager/categories', { method: 'POST', body: JSON.stringify({ title, sortOrder }) }),
  updateCategory: (id: string, data: any) => isOffline() ? devMocks.updateCategory(id, data) as any : fetchApi(`/manager/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => isOffline() ? devMocks.deleteCategory(id) as any : fetchApi(`/manager/categories/${id}`, { method: 'DELETE' }),
};
