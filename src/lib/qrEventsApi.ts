import { fetchApi } from "@/lib/api";

export interface QrEventAssignment {
  publicCode: string;
  // Issued by Core when saved; never supplied by the editor as an input.
  publicToken?: string | null;
  tableId: string | null;
  label: string | null;
  isActive: boolean;
}

export interface QrEventConfig {
  name: string;
  publicAppUrl: string;
  publicApiUrl: string;
  isActive: boolean;
  assignments: QrEventAssignment[];
}

export interface QrEvent extends QrEventConfig {
  id: string;
  storeId: string;
  storeSlug: string;
  storeName?: string;
  revision: number;
  lastAppliedRevision: number;
  lastAppliedAt: string | null;
  paired: boolean;
  isImported: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QrEventBundle {
  schemaVersion: 1 | 2;
  event: QrEventConfig &
    Pick<QrEvent, "id" | "storeId" | "storeSlug" | "revision">;
  exportedAt: string;
}

const eventPath = (id: string) => `/admin/qr-events/${encodeURIComponent(id)}`;

// Always use this installation's authenticated API. Event LAN URLs are QR
// destinations only: a cloud architect token must never be sent to a Pi.
export const qrEventsApi = {
  list: (storeId: string) =>
    fetchApi<{ events: QrEvent[] }>(
      `/admin/stores/${encodeURIComponent(storeId)}/qr-events`,
    ),
  get: (id: string) => fetchApi<{ event: QrEvent }>(eventPath(id)),
  create: (storeId: string, config: QrEventConfig) =>
    fetchApi<{ event: QrEvent }>(
      `/admin/stores/${encodeURIComponent(storeId)}/qr-events`,
      {
        method: "POST",
        body: JSON.stringify(config),
      },
    ),
  update: (id: string, expectedRevision: number, config: QrEventConfig) =>
    fetchApi<{ event: QrEvent }>(eventPath(id), {
      method: "PATCH",
      body: JSON.stringify({ ...config, expectedRevision }),
    }),
  export: (id: string) =>
    fetchApi<{ bundle: QrEventBundle }>(`${eventPath(id)}/export`),
  import: (bundle: unknown) =>
    fetchApi<{ event: QrEvent; unchanged: boolean }>(
      "/admin/qr-events/import",
      {
        method: "POST",
        body: JSON.stringify({ bundle }),
      },
    ),
  pair: (id: string) =>
    fetchApi<{ token: string }>(`${eventPath(id)}/pairing`, { method: "POST" }),
  revoke: (id: string) =>
    fetchApi<{ ok: boolean }>(`${eventPath(id)}/pairing`, { method: "DELETE" }),
};

export function eventQrUrl(
  event: Pick<QrEvent, "publicApiUrl">,
  assignment: Pick<QrEventAssignment, "publicToken">,
): string {
  const token = assignment.publicToken;
  // A missing token must never fall back to a URL exposing the event ID.
  if (!token || !/^QT-[0-9A-F]{32}$/.test(token)) return "";
  return `${event.publicApiUrl.replace(/\/+$/, "")}/q/${token}`;
}
