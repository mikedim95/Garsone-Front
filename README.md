# OrderFlow Frontend (Garsone-Front)

Customer ordering experience and staff dashboards for the OrderFlow restaurant
system. Real-time updates are delivered via the backend WebSocket gateway; the
backend also publishes the same topics to MQTT for non-browser clients.

## Features

- QR/table ordering and menu browsing
- Staff dashboards: waiter, cook, manager, architect (QR tiles)
- Real-time order status and call-waiter alerts via WebSocket topics
- Viva Smart Checkout redirect flow
- Multi-language UI (English, Greek)
- Optional offline/demo mode (VITE_OFFLINE or localStorage OFFLINE=1)
- Web app manifest and icons included (no service worker/offline caching yet)

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite + React SWC
- Tailwind CSS v3
- Radix UI primitives
- React Router
- TanStack Query
- Zustand
- React Hook Form
- i18next (react-i18next)
- qrcode.react
- Recharts
- Framer Motion

### Backend (separate service)
- Fastify + TypeScript
- Prisma ORM
- PostgreSQL
- MQTT broker + WebSocket gateway for realtime
- Viva Smart Checkout integration

## Installation

```bash
npm install
npm run dev
```

Dev server defaults to `http://localhost:8080` (see `vite.config.ts`).

## Routes

- `/` - Landing page
- `/login` - Staff authentication
- `/:tableId` - Customer menu
- `/order/:orderId/thanks` - Order confirmation
- `/payment-complete` - Payment redirect landing
- `/payment-success` - Payment success
- `/payment-failed` - Payment failure
- `/q/:publicCode` - Public QR redirect
- `/waiter` - Waiter dashboard
- `/cook` - Cook dashboard
- `/manager` - Manager dashboard
- `/GarsoneAdmin` - Architect QR tiles
- `/architect` - Redirect to architect QR tiles

## Environment Variables

```env
# API base. If set to localhost/127.*, the app falls back to the current host.
VITE_API_URL=https://api.yourapp.com

# Optional UI-only offline mode and demo data.
# Ignored on production hosts unless VITE_ENABLE_OFFLINE_MODE=true.
VITE_OFFLINE=true

# Explicitly allow OFFLINE/demo mode on non-local hosts (debug only).
# Keep unset/false in production.
VITE_ENABLE_OFFLINE_MODE=true

# Public origin used to build table URLs and QR links (supports {storeSlug}).
VITE_PUBLIC_BASE_ORIGIN=https://{storeSlug}.yourapp.com

# Override QR code base URL (defaults to /q on the current origin).
VITE_PUBLIC_CODE_BASE=https://qr.yourapp.com/q

# Login helpers
VITE_DEFAULT_EMAIL_DOMAIN=demo.local
VITE_ENABLE_DEBUG_LOGIN=true
```

## Realtime Topics (WebSocket/MQTT)

- `{storeSlug}/orders/placed`
- `{storeSlug}/orders/preparing`
- `{storeSlug}/orders/ready`
- `{storeSlug}/orders/served`
- `{storeSlug}/orders/paid`
- `{storeSlug}/orders/canceled` (legacy: `cancelled`)
- `{storeSlug}/waiter/call`

No MQTT credentials are required in the browser; the backend publishes the
same topics over WebSocket for UI clients.
