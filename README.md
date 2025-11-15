# OrderFlow - Modern Restaurant Ordering System

A production-quality restaurant ordering system with real-time MQTT alerts, multi-role dashboards, and PWA support.

## 🚀 Features

- **Customer Experience**: Scan QR → Browse menu → Order → Get notified when ready
- **Waiter Dashboard**: Real-time order management, call-waiter alerts, table assignments
- **Manager Dashboard**: KPIs, order history, CSV export, menu editor
- **Multi-language**: English & Greek (i18n)
- **PWA Ready**: Works offline, installable
- **Real-time**: Backend-bridged MQTT for instant notifications

## 🏗️ Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS v4
- React Router
- TanStack Query
- Zustand (state)
- react-i18next
- qrcode.react

### Backend (Separate Service - Not Included)
- Fastify + TypeScript
- Drizzle ORM
- PostgreSQL
- EMQX (MQTT broker)
- JWT auth

## 📦 Installation

```bash
npm install
npm run dev
```

## 🔐 Demo Credentials

- **Waiter**: waiter1@demo.local / changeme
- **Manager**: manager@demo.local / changeme

## 🎯 Routes

- `/` - Landing page with demo QR codes
- `/login` - Staff authentication
- `/table/:tableId` - Customer menu (production)
- `/waiter` - Waiter dashboard
- `/manager` - Manager dashboard
- `/order/:orderId/thanks` - Order confirmation

## 🌐 Deployment

### Frontend (Static Site)
```bash
npm run build
# Deploy dist/ to Render/Vercel/Netlify
```

### Environment Variables
```
VITE_API_URL=https://api.yourapp.com
```
The frontend now proxies all realtime traffic through the backend, so no MQTT credentials are required in browser builds.

## 📱 PWA Setup

The app is PWA-ready with offline caching. Users can install it to their home screen for an app-like experience.

## 🔔 MQTT Topics (handled by backend)

- `{storeSlug}/orders/*` - Order lifecycle events (placed, preparing, ready, cancelled, served)
- `{storeSlug}/waiter/call` - Call waiter alerts + acknowledgements
- `stores/{slug}/menu/updated` - Manager-driven menu changes

## 📄 License

MIT
