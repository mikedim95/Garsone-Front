# Frontend Integration Brief for Restaurant Ordering Backend

This document is meant to be pasted directly into the prompt for the frontend AI agent that will finish the UI work. It summarizes the currently available backend APIs, auth rules, event streams, and the expectations for each page that already exists in the codebase (landingpage-demo, menu show, waiter dashboard, manager dashboard).

## Environment & Global Expectations

- **API base URL:** `http://localhost:8787` in local development. The backend enables CORS for `http://localhost:5173` by default. 【F:backend/src/server.ts†L13-L37】
- **Store scoping:** All read/write operations target a single store determined by the `STORE_SLUG` environment variable. The backend throws if the slug is missing, so always include store-aware context in the UI. 【F:backend/src/lib/store.ts†L3-L14】
- **Authentication:** JWT access tokens are issued via `POST /auth/signin`. Tokens encode `userId`, `email`, and `role` (`manager` or `waiter`). Store the token client-side (memory or secure storage) and send it in an `Authorization: Bearer <token>` header for protected routes. 【F:backend/src/routes/auth.ts†L8-L63】【F:backend/src/lib/jwt.ts†L3-L17】【F:backend/src/middleware/auth.ts†L5-L24】
- **Role guard:** Manager-only endpoints require the JWT role claim to be `manager`. Waiter dashboards should gracefully handle `403` responses by hiding controls that require elevated permissions. 【F:backend/src/middleware/auth.ts†L18-L24】【F:backend/src/routes/waiterTables.ts†L34-L150】
- **Public device endpoints:** `POST /orders` and `POST /call-waiter` skip JWT auth but enforce an IP allow-list (`ALLOWED_IPS`, defaults to localhost variants). Frontend tests that emulate customer tablets must run from an allowed origin or provide override instructions. Handle `403` responses by prompting the integrator to adjust `ALLOWED_IPS`. 【F:backend/src/middleware/ipWhitelist.ts†L3-L14】【F:backend/src/routes/orders.ts†L96-L259】【F:backend/src/routes/orders.ts†L390-L425】
- **Realtime messaging:** The backend publishes MQTT messages for printers, order-ready updates, and waiter calls. Use the MQTT broker credentials from env (default `mqtt://localhost:1883`). Subscribe to:
  - `stores/{slug}/printing` – payload emitted when an order is created (mirrors the order print ticket). 【F:backend/src/routes/orders.ts†L234-L248】
  - `stores/{slug}/tables/{tableId}/ready` – payload fired when status transitions to READY. 【F:backend/src/routes/orders.ts†L333-L388】
  - `stores/{slug}/tables/{tableId}/call` – payload fired when a customer calls a waiter. 【F:backend/src/routes/orders.ts†L390-L414】
  Use QoS 1 to match the server and surface toast/notification updates in dashboards. 【F:backend/src/lib/mqtt.ts†L1-L39】

## Endpoint Reference & Expected Usage Patterns

### Health Check
- **GET `/health`** → `{ status: "ok", timestamp }`.
- Use for readiness pings or a simple “Backend online” indicator in developer tooling. 【F:backend/src/server.ts†L27-L37】

### Store Metadata & Tables
- **GET `/store`** → `{ store: { id, slug, name, settings }, meta: { currencyCode, locale } | null }`.
  - Landing page should pull store name, hero copy (from `settings` JSON), and locale defaults.
- **GET `/tables`** → `{ tables: [{ id, label, active, waiters: [{ id, displayName, email }] }] }`.
  - Menu page: display active tables to let guests confirm their table (if required).
  - Waiter & manager dashboards: show assignment badges per table. 【F:backend/src/routes/store.ts†L6-L64】

### Menu Catalog
- **GET `/menu`** → `{ store, categories[], items[], modifiers[] }` where:
  - `categories`: ordered by `sortOrder`.
  - `items`: available items only, include `categoryId`, `category`, `price`, `priceCents`, placeholder `image`, and expanded modifier definitions per item.
  - `modifiers`: full catalog with `minSelect`, `maxSelect`, `required`, and option pricing deltas (both decimal and cents for precision UI).
- Menu show page should hydrate category tabs, item cards, and modifier pickers from this payload. Cache or memoize to avoid extra requests. 【F:backend/src/routes/menu.ts†L5-L119】

### Authentication
- **POST `/auth/signin`** body `{ email, password }` → `{ accessToken, user }`.
  - Landing page (demo) should offer sign-in for staff using seeded credentials (manager: `manager@demo.local`, waiter: `waiter1@demo.local`, password `changeme` unless overridden).
  - Store token and role in global auth state; expose hooks/contexts so dashboards know the current user role. 【F:backend/src/routes/auth.ts†L8-L53】

### Orders
- **POST `/orders`** (IP-restricted) body `{ tableId, items: [{ itemId, quantity, modifiers? }], note? }`.
  - Menu show page should build this payload based on guest selections. The backend accepts modifiers as an object or JSON string keyed by modifier IDs.
  - Handle 400 errors for unavailable items, missing required modifiers, or invalid options with inline validation messages.
  - Response `{ order }` includes totals, table label, and line items with modifier snapshots—use to show confirmation screens. 【F:backend/src/routes/orders.ts†L96-L259】
- **GET `/orders`** (JWT) → `{ orders: […] }` sorted by `placedAt` desc, optional `status` query.
  - Waiter dashboard: filter by active statuses (`PLACED`, `PREPARING`, etc.). Poll or combine with MQTT `printing` topic.
- **GET `/orders/:id`** (JWT) → `{ order }`.
  - Detail drawers/modals should reuse the same serializer as the list.
- **PATCH `/orders/:id/status`** (JWT) body `{ status }`.
  - Waiters/managers update orders; when status becomes `READY` the MQTT ready topic fires. Update UI optimistically but reconcile with response.
- Implement consistent error handling for `401` (token missing/expired) and `403` (role mismatch). 【F:backend/src/routes/orders.ts†L261-L388】

### Waiter Call Button
- **POST `/call-waiter`** (IP-restricted) body `{ tableId }` → `{ success: true }`.
  - Menu or table tablet UI should trigger this when guests request service. Dashboards subscribe to the corresponding MQTT topic for alerts. 【F:backend/src/routes/orders.ts†L390-L414】

### Waiter/Table Assignments (Manager Only)
- **GET `/waiter-tables`** (manager JWT) → `{ assignments, waiters, tables }`.
  - Manager dashboard should show current pairings and provide dropdowns populated from `waiters`/`tables` arrays.
- **POST `/waiter-tables`** (manager JWT) body `{ waiterId, tableId }` → `{ assignment }`.
  - Upsert behavior: same waiter-table pair just returns existing row. Show success toast.
- **DELETE `/waiter-tables`** (manager JWT) body `{ waiterId, tableId }` → `{ success: true }`.
  - Remove assignment; handle 404 if pair wasn’t present.
  - All responses include nested waiter/table info so UI can update without refetching entire list. 【F:backend/src/routes/waiterTables.ts†L34-L188】

## Page-Specific Guidance

### landingpage-demo
- Goal: Introduce the store and allow staff login.
- Fetch `/store` on load for brand name/settings.
- Present quick links/buttons to Menu, Waiter Dashboard, Manager Dashboard.
- Include login form that calls `/auth/signin`. Store JWT + role globally, then navigate to the right dashboard.
- Provide test credentials inline for demo convenience.

### Menu Show Page
- Fetch `/menu` and `/tables` (if guests must choose table).
- Build browsing UX with category filters and item detail modals that list modifiers (respect `minSelect`/`maxSelect`).
- Collect selections into cart state. On submission, call `POST /orders` and handle validation errors from the response body.
- After success, show confirmation with order summary and instructions (optionally display order ID).
- Provide “Call Waiter” button that hits `POST /call-waiter` using the active table.

### Waiter Dashboard
- Requires authenticated waiter or manager token.
- On mount, fetch `/orders?status=PLACED` (or no filter for all) and subscribe to MQTT `printing` and `ready` topics to receive live updates.
- Offer filters by status/table. When selecting an order, use `/orders/:id` for detail.
- Actions:
  - Update order status via `PATCH /orders/:id/status` (e.g., `PREPARING`, `SERVED`).
  - Display modifier breakdown using the serializer structure (`order.items[].modifiers[]`).
- Handle token expiration gracefully by redirecting to login on 401.

### Manager Dashboard
- Requires manager token.
- Combine waiter dashboard features (order oversight) with assignment management:
  - Fetch `/waiter-tables` to populate assignment tables and selectors.
  - Allow creating/removing assignments using POST/DELETE endpoints, updating local state with returned payloads.
- Surface store metadata from `/store` (e.g., currency/locale) and show table coverage using `/tables`.
- Provide overview cards: total open orders (from `/orders`), tables without assigned waiters, etc.

## Error & Loading States
- Display API errors surfaced in `error` fields (e.g., `Invalid credentials`, `Missing required modifiers`).
- Network errors or 500 responses should show retry actions and optionally log to console for dev builds.
- When IP restrictions block device endpoints, show configuration guidance.

## Testing Checklist for Frontend AI
- Verify login flow with seeded credentials and ensure JWT stored/cleared correctly.
- Create an order from the menu page and confirm it appears on waiter/manager dashboards.
- Transition an order through statuses and observe MQTT-driven UI updates.
- Trigger “Call Waiter” and verify dashboards show an alert.
- Add/remove waiter-table assignments and ensure tables list updates accordingly.

Paste this entire brief into the frontend AI’s prompt so it can wire existing pages to the backend with accurate data flow, permissions, and real-time behavior.
