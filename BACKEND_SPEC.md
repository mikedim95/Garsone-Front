# Backend API Specification

## Tech Stack
- **Framework**: Fastify + TypeScript
- **Database**: PostgreSQL (Neon/Supabase/Render)
- **ORM**: Drizzle ORM
- **Auth**: JWT + bcrypt
- **Messaging**: EMQX (MQTT over WebSocket)

## Database Schema

```sql
-- Store configuration
CREATE TABLE store_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  currency TEXT DEFAULT 'EUR',
  default_language TEXT DEFAULT 'en',
  allowed_ips TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('waiter', 'manager')),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tables
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Waiter-table assignments
CREATE TABLE waiter_tables (
  waiter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
  PRIMARY KEY (waiter_id, table_id)
);

-- Menu categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menu items
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  image_url TEXT,
  available BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modifiers
CREATE TABLE modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modifier options
CREATE TABLE modifier_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id UUID REFERENCES modifiers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_delta_cents INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (modifier_id, label)
);

-- Item-modifier links
CREATE TABLE item_modifiers (
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  modifier_id UUID REFERENCES modifiers(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, modifier_id)
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES tables(id),
  status TEXT NOT NULL DEFAULT 'PLACED' CHECK (status IN ('PLACED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED')),
  total_cents INT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  quantity INT NOT NULL,
  price_cents INT NOT NULL,
  selected_modifiers JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

### Public (No Auth)

**GET /api/menu**
- Returns: `{ categories, items, modifiers, modifier_options, item_modifiers }`
- Only available items

**POST /api/orders**
- Body: `{ tableId, items[], note? }`
- IP allow-list check
- Creates order, publishes to MQTT printing topic
- Returns: `{ orderId }`

**POST /api/call-waiter**
- Body: `{ tableId }`
- IP allow-list check
- Publishes to MQTT call-waiter topic

### Auth

**POST /api/auth/signin**
- Body: `{ email, password }`
- Returns: `{ accessToken, refreshToken, user }`

**POST /api/auth/refresh**
- Body: `{ refreshToken }`
- Returns: `{ accessToken }`

### Protected (Waiter/Manager)

**GET /api/orders**
- Query: `status?, tableId?, limit?, offset?`
- Returns: `{ orders[], total }`

**PATCH /api/orders/:id/status**
- Body: `{ status }`
- On READY: publishes to MQTT ready topic
- Returns: `{ order }`

### Protected (Manager Only)

**Menu Management**
- GET /api/categories
- POST /api/categories
- PATCH /api/categories/:id
- DELETE /api/categories/:id

**Items**
- GET /api/items
- POST /api/items
- PATCH /api/items/:id
- DELETE /api/items/:id

**Tables**
- GET /api/tables
- POST /api/tables
- PATCH /api/tables/:id
- DELETE /api/tables/:id

**Staff Assignments**
- GET /api/waiter-tables
- POST /api/waiter-tables
- DELETE /api/waiter-tables

## MQTT Topics

- `stores/{slug}/printing` - Order JSON for printer
- `stores/{slug}/tables/{tableId}/ready` - Order ready notification
- `stores/{slug}/tables/{tableId}/call` - Call waiter alert

## Environment Variables

```
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
MQTT_BROKER_URL=mqtt://...
MQTT_USERNAME=...
MQTT_PASSWORD=...
CORS_ORIGINS=http://localhost:5173,https://app.domain.com
ALLOWED_IPS=192.168.1.0/24
PORT=8787
```

## Deployment (Render)

1. Create Web Service
2. Build: `npm run build`
3. Start: `npm run start`
4. Set environment variables
5. Enable "Trust Proxy" for IP checks
