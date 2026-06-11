// API service with auth + robust JSON/error handling
import { useAuthStore } from "@/store/authStore";
import type {
  AuthResponse,
  ArchitectStoreUser,
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
  OrderPublicSummary,
  OrderResponse,
  OrdersResponse,
  OrderItemStatus,
  OrderStatus,
  LandingStoreLink,
  StoreInfo,
  StoreOnboardPayload,
  StoreOnboardResponse,
  Table,
  CookSummary,
  CookType,
  WaiterSummary,
  WaiterType,
  WaiterTableOverview,
  OrderingMode,
  StoreOverview,
  RemoteNode,
  RemoteNodeConfig,
  RemoteNodePrinterTestResponse,
  PendingNodeAgent,
} from "@/types";
import { devMocks } from "./devMocks";
import { isOfflineModeEnabled } from "./offlineMode";
import { getStoredStoreSlug } from "./storeSlug";

export type MenuBootstrapResponse = {
  store: StoreInfo;
  table: { id: string; label: string } | null;
  menu: MenuData & {
    modifiers?: Modifier[];
    itemModifiers?: Array<{
      itemId: string;
      modifierId: string;
      isRequired?: boolean;
    }>;
  };
};

const ENV_API: string | undefined = import.meta.env.VITE_API_URL;
const isFallbackSlug = (slug?: string | null) =>
  !slug || !slug.trim() || slug.trim().toLowerCase() === "default-store";
export const API_BASE = (() => {
  // Use env only if it isn't pointing to localhost (which breaks on phones)
  if (
    ENV_API &&
    ENV_API.trim().length > 0 &&
    !/^https?:\/\/(localhost|127\.)/i.test(ENV_API.trim())
  ) {
    return ENV_API.trim();
  }
  // Otherwise derive from current host (works for LAN devices)
  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;
    const port = 8787;
    return `${protocol}//${hostname}:${port}`;
  }
  return "http://localhost:8787";
})();

export function isOffline() {
  return isOfflineModeEnabled();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const MENU_IMAGE_WIDTH = 1200;
const MENU_IMAGE_HEIGHT = 900;
const MENU_IMAGE_MIME_TYPE = "image/webp";
const MENU_IMAGE_QUALITY = 0.82;

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not optimize image"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });

const loadImageForCanvas = async (
  file: File
): Promise<ImageBitmap | HTMLImageElement> => {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as any);
    } catch {
      // Fall through to HTMLImageElement decoding for older/stricter browsers.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    image.src = url;
  });
};

const optimizedImageFileName = (fileName: string) => {
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${baseName || "menu-image"}.webp`;
};

async function optimizeMenuImage(file: File): Promise<File> {
  const image = await loadImageForCanvas(file);
  const sourceWidth =
    image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const sourceHeight =
    image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read image dimensions");
  }

  const targetRatio = MENU_IMAGE_WIDTH / MENU_IMAGE_HEIGHT;
  const sourceRatio = sourceWidth / sourceHeight;
  let cropX = 0;
  let cropY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = MENU_IMAGE_WIDTH;
  canvas.height = MENU_IMAGE_HEIGHT;
  const context = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });

  if (!context) {
    throw new Error("Could not prepare image optimizer");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    MENU_IMAGE_WIDTH,
    MENU_IMAGE_HEIGHT
  );

  if ("close" in image && typeof image.close === "function") {
    image.close();
  }

  const blob = await canvasToBlob(
    canvas,
    MENU_IMAGE_MIME_TYPE,
    MENU_IMAGE_QUALITY
  );

  return new File([blob], optimizedImageFileName(file.name), {
    type: MENU_IMAGE_MIME_TYPE,
    lastModified: Date.now(),
  });
}

const withVisit = <T extends Record<string, any>>(payload: T): T => payload;

type ManagerTableCreateInput = { label: string; isActive?: boolean };
type ManagerTableUpdateInput = Partial<ManagerTableCreateInput>;
type OrderStatusUpdateOptions = { cancelReason?: string; skipMqtt?: boolean };
type CreateWaiterPayload = {
  email: string;
  password: string;
  displayName: string;
  waiterTypeId?: string | null;
};
type UpdateWaiterPayload = Partial<CreateWaiterPayload>;
type CreateCookPayload = {
  email: string;
  password: string;
  displayName: string;
  cookTypeId?: string | null;
};
type UpdateCookPayload = Partial<CreateCookPayload>;
type StaffTypePayload = {
  title: string;
  printerTopic?: string | null;
};
type ManagerItemUpdatePayload = Partial<ManagerItemPayload>;
type ModifierUpdatePayload = Partial<Modifier>;
type EditOrderPayload = CreateOrderPayload;
type EditPendingTableOrdersPayload = Omit<CreateOrderPayload, "tableId"> & {
  orderIds?: string[];
};
type QRTileUpdatePayload = {
  storeId?: string | null;
  tableId?: string | null;
  isActive?: boolean;
  label?: string | null;
};
type GenerateTilePayload = { count: number };
type PurgeStoreHistoryResponse = {
  success: boolean;
  store: StoreInfo;
  deleted: Record<string, number>;
};
type RemoteNodeSaveResponse = {
  node: RemoteNode;
  token?: string | null;
  tokenOnlyShownOnce?: boolean;
};
type LocalityApprovalPayload = {
  publicCode: string;
  tableId: string;
  purpose?: "ORDER_SUBMIT";
  sessionId: string;
  method?: "nfc" | "qr" | "link";
};
type LocalityApprovalResponse = {
  approvalToken: string;
  expiresAt: string;
  purpose: string;
  method?: string;
  storeSlug?: string | null;
  tableId?: string | null;
};
type PublicEventPayload = {
  event:
    | "locality_gate_opened"
    | "locality_scan_started"
    | "locality_scan_succeeded"
    | "locality_scan_failed"
    | "locality_approved"
    | "order_submit_attempted"
    | "order_submit_succeeded"
    | "order_submit_failed";
  storeSlug?: string;
  tableId?: string;
  sessionId?: string;
  deviceType?: string;
  platform?: string;
  method?: string;
  ts?: string;
  meta?: Record<string, unknown>;
};

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const getStoreSlug = () => {
    const slug = getStoredStoreSlug();
    return isFallbackSlug(slug) ? undefined : slug || undefined;
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
      console.error("[api] request failed", {
        endpoint,
        status: response.status,
        message,
        error,
      });
      throw new ApiError(response.status, message);
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[api] network/parse failure", {
      endpoint,
      error,
    });
    throw new ApiError(0, "Network error or invalid response");
  }
}

export const api = {
  getLandingStores: async (): Promise<{ stores: LandingStoreLink[] }> => {
    if (isOffline()) {
      const [storeRes, tablesRes] = await Promise.all([
        devMocks.getStore(),
        devMocks.getTables(),
      ]);
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
    isOffline()
      ? devMocks.getStore()
      : fetchApi<{ store: StoreInfo }>("/store"),
  getTables: (): Promise<{ tables: Table[] }> =>
    isOffline()
      ? devMocks.getTables()
      : fetchApi<{ tables: Table[] }>("/tables"),

  // Manager: table management
  managerListTables: (): Promise<{ tables: ManagerTableSummary[] }> =>
    isOffline()
      ? devMocks.managerListTables()
      : fetchApi<{ tables: ManagerTableSummary[] }>("/manager/tables"),
  managerCreateTable: (
    data: ManagerTableCreateInput
  ): Promise<{ table: ManagerTableSummary }> =>
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
  managerUploadImage: async (
    file: File,
    opts?: { storeSlug?: string; itemId?: string }
  ) => {
    const uploadFile = await optimizeMenuImage(file);
    console.info("[api:image-upload] optimized menu image", {
      originalName: file.name,
      originalSize: file.size,
      uploadName: uploadFile.name,
      uploadSize: uploadFile.size,
      mimeType: uploadFile.type || MENU_IMAGE_MIME_TYPE,
    });
    const base64 = await readBlobAsDataUrl(uploadFile);
    const payload: ImageUploadPayload = {
      fileName: uploadFile.name,
      mimeType: uploadFile.type || MENU_IMAGE_MIME_TYPE,
      base64,
      itemId: opts?.itemId || undefined,
      storeSlug: opts?.storeSlug || undefined,
    };
    return fetchApi<ImageUploadResponse>(`/manager/uploads/image`, {
      method: "POST",
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
  changePassword: (
    currentPassword: string,
    newPassword: string
  ): Promise<OkResponse> =>
    isOffline()
      ? Promise.resolve({ ok: true })
      : fetchApi<OkResponse>("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
        }),

  // Menu & orders (public device endpoints for create + call waiter)
  getMenu: (): Promise<MenuData> =>
    isOffline() ? devMocks.getMenu() : fetchApi<MenuData>("/menu"),
  getMenuBootstrap: (
    tableCode: string,
    opts?: { storeSlug?: string; lang?: string }
  ): Promise<MenuBootstrapResponse> => {
    if (!tableCode) {
      return Promise.reject(new Error("tableCode is required"));
    }
    if (isOffline()) {
      return Promise.all([
        devMocks.getStore(),
        devMocks.getTables(),
        devMocks.getMenu(),
      ]).then(([storeRes, tablesRes, menu]) => {
        const table =
          (tablesRes?.tables || []).find(
            (t) =>
              t.id === tableCode ||
              t.label?.toLowerCase() === tableCode.toLowerCase()
          ) || (tablesRes?.tables || [])[0];
        return {
          store: storeRes?.store || { id: "offline", name: "Offline Demo", slug: "local-store" },
          table: table ? { id: table.id, label: table.label } : null,
          menu,
        };
      });
    }
    const params = new URLSearchParams();
    params.set("tableCode", tableCode);
    if (opts?.storeSlug) params.set("storeSlug", opts.storeSlug);
    const normalizedLang = (opts?.lang || "").toLowerCase().startsWith("el")
      ? "el"
      : (opts?.lang || "").toLowerCase().startsWith("en")
      ? "en"
      : "";
    if (normalizedLang) params.set("lang", normalizedLang);
    const qs = params.toString();
    return fetchApi<MenuBootstrapResponse>(`/public/menu-bootstrap?${qs}`);
  },
  createOrder: (data: CreateOrderPayload): Promise<OrderResponse> => {
    const visitHeaders = data.visit
      ? { "x-table-visit": data.visit }
      : undefined;
    return isOffline()
      ? devMocks.createOrder(data)
      : fetchApi<OrderResponse>("/orders", {
          method: "POST",
          body: JSON.stringify(withVisit(data)),
          ...(visitHeaders ? { headers: visitHeaders } : {}),
        });
  },
  editOrder: (
    orderId: string,
    data: EditOrderPayload
  ): Promise<OrderResponse> => {
    const visitHeaders = (data as any)?.visit
      ? { "x-table-visit": (data as any).visit }
      : undefined;
    return isOffline()
      ? devMocks.createOrder(data)
      : fetchApi<OrderResponse>(`/orders/${orderId}`, {
          method: "PATCH",
          body: JSON.stringify(withVisit(data)),
          ...(visitHeaders ? { headers: visitHeaders } : {}),
        });
  },
  editPendingTableOrders: (
    tableId: string,
    data: EditPendingTableOrdersPayload
  ): Promise<OrderResponse & { supersededOrderIds?: string[] }> => {
    const visitHeaders = (data as any)?.visit
      ? { "x-table-visit": (data as any).visit }
      : undefined;
    return isOffline()
      ? devMocks.createOrder({ ...data, tableId } as CreateOrderPayload)
      : fetchApi<OrderResponse & { supersededOrderIds?: string[] }>(
          `/public/table/${tableId}/orders/pending`,
          {
            method: "PATCH",
            body: JSON.stringify(withVisit(data as CreateOrderPayload)),
            ...(visitHeaders ? { headers: visitHeaders } : {}),
          }
        );
  },
  printOrder: (orderId: string) =>
    fetchApi(`/orders/${orderId}/print`, { method: "POST" }),
  callWaiter: (tableId: string, visit?: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.callWaiter(tableId)
      : fetchApi<OkResponse>("/call-waiter", {
          method: "POST",
          body: JSON.stringify(
            withVisit({ tableId, ...(visit ? { visit } : {}) })
          ),
          ...(visit ? { headers: { "x-table-visit": visit } } : {}),
        }),
  getOrderQueueSummary: (): Promise<OrderQueueSummary> =>
    isOffline()
      ? devMocks.getOrderQueueSummary()
      : fetchApi<OrderQueueSummary>("/orders/queue"),
  getPublicOrderSummary: (
    orderId: string,
    opts?: { storeSlug?: string }
  ): Promise<OrderPublicSummary> =>
    isOffline()
      ? devMocks.getPublicOrderSummary(orderId)
      : fetchApi<OrderPublicSummary>(
          `/public/orders/${encodeURIComponent(orderId)}/summary`,
          opts?.storeSlug
            ? {
                headers: {
                  "x-store-slug": opts.storeSlug,
                },
              }
            : undefined
        ),
  getPublicTableOrders: (
    tableId: string,
    opts?: {
      status?: string;
      unpaid?: boolean;
      take?: number;
      storeSlug?: string;
    }
  ): Promise<OrdersResponse> => {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.unpaid) params.set("unpaid", "1");
    if (opts?.take) params.set("take", String(opts.take));
    const qs = params.toString();
    return fetchApi<OrdersResponse>(
      `/public/table/${encodeURIComponent(tableId)}/orders${
        qs ? `?${qs}` : ""
      }`,
      opts?.storeSlug
        ? {
            headers: {
              "x-store-slug": opts.storeSlug,
            },
          }
        : undefined
    );
  },
  // Authenticated orders API
  getOrders: (params?: {
    status?: string;
    take?: number;
    tableIds?: string[];
  }): Promise<OrdersResponse> => {
    const q: string[] = [];
    if (params?.status) q.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.take) q.push(`take=${params.take}`);
    if (params?.tableIds?.length) {
      const ids = params.tableIds.map((id) => encodeURIComponent(id)).join(",");
      q.push(`tableIds=${ids}`);
    }
    const query = q.length ? `?${q.join("&")}` : "";
    if (isOffline()) return devMocks.getOrders(params);
    return fetchApi<OrdersResponse>(`/orders${query}`);
  },
  getOrder: (orderId: string): Promise<OrderResponse> =>
    isOffline()
      ? devMocks.getOrder(orderId)
      : fetchApi<OrderResponse>(`/orders/${orderId}`),
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
            ...(options?.cancelReason
              ? { cancelReason: options.cancelReason }
              : {}),
            ...(options?.skipMqtt ? { skipMqtt: true } : {}),
          }),
        }),
  updateOrderItemStatus: (
    orderId: string,
    orderItemId: string,
    status: OrderItemStatus
  ): Promise<OrderResponse> =>
    isOffline()
      ? devMocks.updateOrderItemStatus(orderId, orderItemId, status)
      : fetchApi<OrderResponse>(
          `/orders/${orderId}/items/${orderItemId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          }
        ),

  // Manager: waiter-table assignments
  getWaiterTables: (): Promise<WaiterTableOverview> =>
    isOffline()
      ? devMocks.getWaiterTables()
      : fetchApi<WaiterTableOverview>("/waiter-tables"),
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
  // Waiter-scoped: get my assigned tables
  waiterMyTables: (): Promise<WaiterTableOverview> =>
    isOffline()
      ? devMocks.getWaiterTables()
      : fetchApi<WaiterTableOverview>("/waiter/my-tables"),

  // Manager: waiters CRUD
  listWaiters: (): Promise<{ waiters: WaiterSummary[] }> =>
    isOffline()
      ? devMocks.listWaiters()
      : fetchApi<{ waiters: WaiterSummary[] }>("/manager/waiters"),
  createWaiter: (
    email: string,
    password: string,
    displayName: string,
    waiterTypeId?: string | null
  ): Promise<{ waiter: WaiterSummary }> =>
    isOffline()
      ? devMocks.createWaiter(email, password, displayName, waiterTypeId)
      : fetchApi<{ waiter: WaiterSummary }>("/manager/waiters", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            displayName,
            ...(waiterTypeId !== undefined ? { waiterTypeId } : {}),
          }),
        }),
  updateWaiter: (
    id: string,
    data: UpdateWaiterPayload
  ): Promise<{ waiter: WaiterSummary }> =>
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

  // Manager: cook types CRUD
  listCookTypes: (): Promise<{ types: CookType[] }> =>
    isOffline()
      ? devMocks.listCookTypes()
      : fetchApi<{ types: CookType[] }>("/manager/cook-types"),
  createCookType: (
    data: StaffTypePayload
  ): Promise<{ type: CookType }> =>
    isOffline()
      ? devMocks.createCookType(data)
      : fetchApi<{ type: CookType }>("/manager/cook-types", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  updateCookType: (
    id: string,
    data: Partial<StaffTypePayload>
  ): Promise<{ type: CookType }> =>
    isOffline()
      ? devMocks.updateCookType(id, data)
      : fetchApi<{ type: CookType }>(`/manager/cook-types/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteCookType: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteCookType(id)
      : fetchApi<OkResponse>(`/manager/cook-types/${id}`, {
          method: "DELETE",
        }),

  // Manager: waiter types CRUD
  listWaiterTypes: (): Promise<{ types: WaiterType[] }> =>
    isOffline()
      ? devMocks.listWaiterTypes()
      : fetchApi<{ types: WaiterType[] }>("/manager/waiter-types"),
  createWaiterType: (
    data: StaffTypePayload
  ): Promise<{ type: WaiterType }> =>
    isOffline()
      ? devMocks.createWaiterType(data)
      : fetchApi<{ type: WaiterType }>("/manager/waiter-types", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  updateWaiterType: (
    id: string,
    data: Partial<StaffTypePayload>
  ): Promise<{ type: WaiterType }> =>
    isOffline()
      ? devMocks.updateWaiterType(id, data)
      : fetchApi<{ type: WaiterType }>(`/manager/waiter-types/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteWaiterType: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteWaiterType(id)
      : fetchApi<OkResponse>(`/manager/waiter-types/${id}`, {
          method: "DELETE",
        }),

  // Manager: cooks CRUD
  listCooks: (): Promise<{ cooks: CookSummary[] }> =>
    isOffline()
      ? devMocks.listCooks()
      : fetchApi<{ cooks: CookSummary[] }>("/manager/cooks"),
  createCook: (
    email: string,
    password: string,
    displayName: string,
    cookTypeId?: string | null
  ): Promise<{ cook: CookSummary }> =>
    isOffline()
      ? devMocks.createCook(email, password, displayName, cookTypeId)
      : fetchApi<{ cook: CookSummary }>("/manager/cooks", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            displayName,
            ...(cookTypeId !== undefined ? { cookTypeId } : {}),
          }),
        }),
  updateCook: (
    id: string,
    data: UpdateCookPayload
  ): Promise<{ cook: CookSummary }> =>
    isOffline()
      ? devMocks.updateCook(id, data)
      : fetchApi<{ cook: CookSummary }>(`/manager/cooks/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteCook: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteCook(id)
      : fetchApi<OkResponse>(`/manager/cooks/${id}`, { method: "DELETE" }),

  // Manager: items CRUD
  listItems: (): Promise<{ items: ManagerItemSummary[] }> =>
    isOffline()
      ? devMocks.listItems()
      : fetchApi<{ items: ManagerItemSummary[] }>("/manager/items"),
  createItem: (
    data: ManagerItemPayload
  ): Promise<{ item: ManagerItemSummary }> =>
    isOffline()
      ? devMocks.createItem(data)
      : fetchApi<{ item: ManagerItemSummary }>("/manager/items", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  getItemDetail: (
    id: string
  ): Promise<{
    item?: ManagerItemSummary;
    modifiers: Modifier[];
    links: Array<{ modifierId: string; isRequired: boolean }>;
  }> => fetchApi(`/manager/items/${id}/detail`),
  updateItem: (
    id: string,
    data: ManagerItemUpdatePayload
  ): Promise<{ item: ManagerItemSummary | undefined }> =>
    isOffline()
      ? devMocks.updateItem(id, data)
      : fetchApi<{ item: ManagerItemSummary | undefined }>(
          `/manager/items/${id}`,
          {
            method: "PATCH",
            body: JSON.stringify(data),
          }
        ),
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
  updateModifier: (
    id: string,
    data: ModifierUpdatePayload
  ): Promise<{ modifier?: Modifier }> =>
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
  createModifierOption: (
    data: ModifierOptionPayload
  ): Promise<{ option: ModifierOption }> =>
    isOffline()
      ? devMocks.createModifierOption(data)
      : fetchApi<{ option: ModifierOption }>("/manager/modifier-options", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  updateModifierOption: (
    id: string,
    data: ModifierOptionUpdatePayload
  ): Promise<OkResponse> =>
    isOffline()
      ? devMocks.updateModifierOption(id, data)
      : fetchApi<OkResponse>(`/manager/modifier-options/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteModifierOption: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteModifierOption(id)
      : fetchApi<OkResponse>(`/manager/modifier-options/${id}`, {
          method: "DELETE",
        }),
  linkItemModifier: (
    itemId: string,
    modifierId: string,
    isRequired: boolean
  ): Promise<OkResponse> =>
    isOffline()
      ? devMocks.linkItemModifier(itemId, modifierId, isRequired)
      : fetchApi<OkResponse>("/manager/item-modifiers", {
          method: "POST",
          body: JSON.stringify({ itemId, modifierId, isRequired }),
        }),
  unlinkItemModifier: (
    itemId: string,
    modifierId: string
  ): Promise<OkResponse> =>
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
      : fetchApi<OkResponse>(`/manager/orders/${orderId}`, {
          method: "DELETE",
        }),
  managerCancelOrder: (orderId: string): Promise<OrderResponse> =>
    isOffline()
      ? devMocks.managerCancelOrder(orderId)
      : fetchApi<OrderResponse>(`/manager/orders/${orderId}/cancel`, {
          method: "PATCH",
        }),

  // Manager: categories
  listCategories: (): Promise<{ categories: MenuCategory[] }> =>
    isOffline()
      ? devMocks.listCategories()
      : fetchApi<{ categories: MenuCategory[] }>("/manager/categories"),
  createCategory: (
    titleEn: string,
    titleEl: string,
    sortOrder?: number,
    printerTopic?: string | null,
    imageUrl?: string | null
  ): Promise<{ category: MenuCategory }> =>
    isOffline()
      ? devMocks.createCategory(titleEn, sortOrder, titleEl, printerTopic, imageUrl)
      : fetchApi<{ category: MenuCategory }>("/manager/categories", {
          method: "POST",
          body: JSON.stringify({
            titleEn,
            titleEl,
            ...(sortOrder !== undefined ? { sortOrder } : {}),
            ...(printerTopic !== undefined ? { printerTopic } : {}),
            ...(imageUrl !== undefined ? { imageUrl } : {}),
          }),
        }),
  updateCategory: (
    id: string,
    data: Partial<CategoryPayload>
  ): Promise<{ category?: MenuCategory }> =>
    isOffline()
      ? devMocks.updateCategory(id, data)
      : fetchApi<{ category?: MenuCategory }>(`/manager/categories/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  deleteCategory: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.deleteCategory(id)
      : fetchApi<OkResponse>(`/manager/categories/${id}`, { method: "DELETE" }),

  // Architect / admin: QR tiles + stores
  adminListStores: (): Promise<{ stores: StoreInfo[] }> =>
    isOffline()
      ? devMocks.adminListStores()
      : fetchApi<{ stores: StoreInfo[] }>("/admin/stores"),
  adminCreateStore: (
    data: StoreOnboardPayload
  ): Promise<StoreOnboardResponse> =>
    isOffline()
      ? Promise.resolve({
          store: {
            id: `offline-${data.slug}`,
            name: data.name,
            slug: data.slug,
            orderingMode: "hybrid",
            printers: [data.printerTopic || "printer_1"],
          },
          profiles: {
            manager: data.managerEmail || `manager@${data.slug}.local`,
            waiter: data.waiterEmail || `waiter@${data.slug}.local`,
            cook: data.cookEmail || `cook@${data.slug}.local`,
          },
          tableCount: data.tableCount || 10,
        })
      : fetchApi<StoreOnboardResponse>("/admin/stores", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  adminListStoreUsers: (
    storeId: string
  ): Promise<{ users: ArchitectStoreUser[] }> =>
    isOffline()
      ? Promise.resolve({ users: [] })
      : fetchApi<{ users: ArchitectStoreUser[] }>(`/admin/stores/${storeId}/users`),
  adminCreateStoreUser: (
    storeId: string,
    data: {
      email: string;
      password: string;
      displayName: string;
      role: "MANAGER" | "WAITER" | "COOK";
    }
  ): Promise<{ user: ArchitectStoreUser }> =>
    isOffline()
      ? Promise.resolve({
          user: {
            id: `offline-user-${Date.now()}`,
            storeId,
            email: data.email,
            displayName: data.displayName,
            role: data.role.toLowerCase() as ArchitectStoreUser["role"],
          },
        })
      : fetchApi<{ user: ArchitectStoreUser }>(`/admin/stores/${storeId}/users`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
  adminUpdateStoreUser: (
    storeId: string,
    userId: string,
    data: Partial<{
      email: string;
      password: string;
      displayName: string;
      role: "MANAGER" | "WAITER" | "COOK";
    }>
  ): Promise<{ user: ArchitectStoreUser }> =>
    isOffline()
      ? Promise.resolve({
          user: {
            id: userId,
            storeId,
            email: data.email || "offline@example.local",
            displayName: data.displayName || "Offline user",
            role: (data.role?.toLowerCase() as ArchitectStoreUser["role"]) || "waiter",
          },
        })
      : fetchApi<{ user: ArchitectStoreUser }>(`/admin/stores/${storeId}/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  adminDeleteStoreUser: (storeId: string, userId: string): Promise<OkResponse> =>
    isOffline()
      ? Promise.resolve({ success: true })
      : fetchApi<OkResponse>(`/admin/stores/${storeId}/users/${userId}`, {
          method: "DELETE",
        }),
  adminPurgeStoreHistory: (
    storeId: string,
    confirmation: string
  ): Promise<PurgeStoreHistoryResponse> =>
    isOffline()
      ? devMocks.adminPurgeStoreHistory(storeId)
      : fetchApi<PurgeStoreHistoryResponse>(`/admin/stores/${storeId}/history`, {
          method: "DELETE",
          body: JSON.stringify({ confirmation }),
        }),
  adminListStoreOverview: (): Promise<{ stores: StoreOverview[] }> =>
    isOffline()
      ? devMocks.adminListStoreOverview()
      : fetchApi<{ stores: StoreOverview[] }>("/admin/stores/overview"),
  adminListAllQrTiles: (): Promise<{ tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminListAllQrTiles()
      : fetchApi<{ tiles: QRTile[] }>("/admin/qr-tiles"),
  adminListStoreTables: (
    storeId: string
  ): Promise<{ tables: ManagerTableSummary[] }> =>
    isOffline()
      ? devMocks.adminListStoreTables(storeId)
      : fetchApi<{ tables: ManagerTableSummary[] }>(
          `/admin/stores/${storeId}/tables`
        ),
  adminListQrTiles: (
    storeId: string
  ): Promise<{ store?: StoreInfo; tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminListQrTiles(storeId)
      : fetchApi<{ store?: StoreInfo; tiles: QRTile[] }>(
          `/admin/stores/${storeId}/qr-tiles`
        ),
  adminGenerateQrTiles: (
    storeId: string,
    data: GenerateTilePayload
  ): Promise<{ tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminGenerateQrTiles(storeId, data)
      : fetchApi<{ tiles: QRTile[] }>(
          `/admin/stores/${storeId}/qr-tiles/bulk`,
          {
            method: "POST",
            body: JSON.stringify(data),
          }
        ),
  adminGenerateGlobalQrTiles: (
    data: GenerateTilePayload
  ): Promise<{ tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminGenerateGlobalQrTiles(data)
      : fetchApi<{ tiles: QRTile[] }>("/admin/qr-tiles/bulk", {
          method: "POST",
          body: JSON.stringify(data),
        }),
  adminUpdateQrTile: (
    id: string,
    data: QRTileUpdatePayload
  ): Promise<{ tile: QRTile }> =>
    isOffline()
      ? devMocks.adminUpdateQrTile(id, data)
      : fetchApi<{ tile: QRTile }>(`/admin/qr-tiles/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  adminDeleteQrTile: (id: string): Promise<OkResponse> =>
    isOffline()
      ? devMocks.adminDeleteQrTile(id)
      : fetchApi<OkResponse>(`/admin/qr-tiles/${id}`, { method: "DELETE" }),
  resolveQrTile: (publicCode: string): Promise<any> =>
    isOffline()
      ? devMocks.resolveQrTile(publicCode)
      : fetchApi(`/q/${encodeURIComponent(publicCode)}`),

  // Manager: QR tiles binding for own store (uses admin endpoints with storeId)
  managerListQrTiles: (storeId: string): Promise<{ tiles: QRTile[] }> =>
    isOffline()
      ? devMocks.adminListQrTiles(storeId)
      : fetchApi<{ tiles: QRTile[] }>(`/admin/stores/${storeId}/qr-tiles`),
  managerUpdateQrTile: (
    id: string,
    data: QRTileUpdatePayload
  ): Promise<{ tile: QRTile }> =>
    isOffline()
      ? devMocks.adminUpdateQrTile(id, data)
      : fetchApi<{ tile: QRTile }>(`/admin/qr-tiles/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
  adminUpdateStoreOrderingMode: (
    storeId: string,
    orderingMode: OrderingMode
  ): Promise<{ store: StoreInfo }> =>
    isOffline()
      ? devMocks.adminUpdateStoreOrderingMode(storeId, orderingMode)
      : fetchApi<{ store: StoreInfo }>(
          `/admin/stores/${storeId}/ordering-mode`,
          {
            method: "PATCH",
            body: JSON.stringify({ orderingMode }),
          }
        ),
  adminUpdateStorePrinters: (
    storeId: string,
    printers: string[]
  ): Promise<{ store: StoreInfo }> =>
    isOffline()
      ? devMocks.adminUpdateStorePrinters(storeId, printers)
      : fetchApi<{ store: StoreInfo }>(`/admin/stores/${storeId}/printers`, {
          method: "PATCH",
          body: JSON.stringify({ printers }),
        }),
  adminListStoreNodes: (
    storeId: string
  ): Promise<{ nodes: RemoteNode[] }> =>
    isOffline()
      ? Promise.resolve({ nodes: [] })
      : fetchApi<{ nodes: RemoteNode[] }>(`/admin/stores/${storeId}/nodes`),
  adminListPendingNodes: (): Promise<{ pendingNodes: PendingNodeAgent[] }> =>
    isOffline()
      ? Promise.resolve({ pendingNodes: [] })
      : fetchApi<{ pendingNodes: PendingNodeAgent[] }>("/admin/pending-nodes"),
  adminClaimPendingNode: (
    pendingNodeId: string,
    storeId: string,
    config?: Partial<RemoteNodeConfig>
  ): Promise<RemoteNodeSaveResponse> =>
    isOffline()
      ? Promise.resolve({
          node: {
            id: "offline-claimed-node",
            storeId,
            slug: config.nodeSlug || "main",
            displayName: config.displayName,
            desiredConfigVersion: 1,
            status: "PENDING",
            config,
          },
          token: "offline-token",
          tokenOnlyShownOnce: true,
        })
      : fetchApi<RemoteNodeSaveResponse>(`/admin/pending-nodes/${pendingNodeId}/claim`, {
          method: "POST",
          body: JSON.stringify({ storeId, ...(config ? { config } : {}) }),
        }),
  adminSaveStoreMainNode: (
    storeId: string,
    data: RemoteNodeConfig
  ): Promise<RemoteNodeSaveResponse> =>
    isOffline()
      ? Promise.resolve({
          node: {
            id: "offline-node",
            storeId,
            slug: data.nodeSlug || "main",
            displayName: data.displayName,
            desiredConfigVersion: 1,
            status: "PENDING",
            config: data,
          },
          token: "offline-token",
          tokenOnlyShownOnce: true,
        })
      : fetchApi<RemoteNodeSaveResponse>(`/admin/stores/${storeId}/nodes/main`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
  adminRotateNodeToken: (nodeId: string): Promise<RemoteNodeSaveResponse> =>
    isOffline()
      ? Promise.resolve({
          node: {
            id: nodeId,
            storeId: "offline-store",
            slug: "main",
            displayName: "Offline node",
            desiredConfigVersion: 1,
            status: "PENDING",
            config: {},
          },
          token: "offline-token",
          tokenOnlyShownOnce: true,
        })
      : fetchApi<RemoteNodeSaveResponse>(`/admin/nodes/${nodeId}/rotate-token`, {
          method: "POST",
        }),
  adminTestStorePrinter: (
    storeId: string,
    printer: { topicSuffix: string; mac?: string; label?: string; type?: "58" | "80" }
  ): Promise<RemoteNodePrinterTestResponse> =>
    isOffline()
      ? Promise.resolve({
          ok: true,
          topic: `offline-store/orders/preparing/${printer.topicSuffix || "printer_1"}`,
        })
      : fetchApi<RemoteNodePrinterTestResponse>(
          `/admin/stores/${storeId}/nodes/main/printers/test`,
          {
            method: "POST",
            body: JSON.stringify(printer),
          }
        ),

  // Payment: Viva payment
  getVivaCheckoutUrl: (
    tableId: string,
    amount: number,
    description?: string
  ): Promise<{
    checkoutUrl: string;
    sessionId: string;
    amount: number;
    tableId: string;
  }> =>
    isOffline()
      ? Promise.resolve({
          checkoutUrl: "https://demo.vivapayments.com/web/checkout?demo=true",
          sessionId: `demo_${tableId}_${Date.now()}`,
          amount,
          tableId,
        })
      : fetchApi(`/payment/viva/checkout-url`, {
          method: "POST",
          body: JSON.stringify({
            tableId,
            amount,
            amountCents: Math.round(amount * 100),
            description,
          }),
        }),

  createLocalityApproval: (
    data: LocalityApprovalPayload
  ): Promise<LocalityApprovalResponse> =>
    isOffline()
      ? devMocks.createLocalityApproval(data)
      : fetchApi<LocalityApprovalResponse>("/locality/approve", {
          method: "POST",
          body: JSON.stringify(data),
        }),

  trackPublicEvent: (data: PublicEventPayload): Promise<{ ok: boolean }> =>
    isOffline()
      ? Promise.resolve({ ok: true })
      : fetchApi<{ ok: boolean }>("/public/events", {
          method: "POST",
          body: JSON.stringify(data),
        }),
};
