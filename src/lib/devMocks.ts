// Lightweight in-browser mock backend for offline testing.
// Persists to localStorage under key "devMocks" so state survives reloads.

import type { CreateOrderPayload, CreateOrderPayloadItem, OrderingMode } from "@/types";

type Id = string;

type Category = {
  id: Id;
  title: string;
  titleEn?: string;
  titleEl?: string;
  sortOrder: number;
  printerTopic?: string | null;
};
type Item = { id: Id; title: string; titleEn?: string; titleEl?: string; description?: string; descriptionEn?: string; descriptionEl?: string; priceCents: number; categoryId: Id; isAvailable?: boolean; imageUrl?: string; printerTopic?: string | null };
type ModifierOption = { id: Id; title: string; titleEn?: string; titleEl?: string; label: string; priceDeltaCents: number; sortOrder: number };
type Modifier = { id: Id; title: string; titleEn?: string; titleEl?: string; name: string; minSelect: number; maxSelect: number | null; isAvailable?: boolean; options: ModifierOption[] };
type ItemModifier = { itemId: Id; modifierId: Id; isRequired: boolean };
type Table = { id: Id; label: string; isActive: boolean };
type StaffType = { id: Id; slug: string; title: string; printerTopic?: string | null };
type Waiter = { id: Id; email: string; displayName: string; password?: string; waiterTypeId?: Id | null };
type Cook = { id: Id; email: string; displayName: string; password?: string; cookTypeId?: Id | null };
type WaiterAssignment = { waiterId: Id; tableId: Id };
type OrderItemStatus = 'PLACED' | 'ACCEPTED' | 'SERVED';
type OrderItem = {
  id: Id;
  itemId: Id;
  qty: number;
  status: OrderItemStatus;
  acceptedAt?: number | null;
  servedAt?: number | null;
  modifiers?: Array<{ modifierId: Id; optionIds: Id[] }>;
};
type Order = { id: Id; tableId: Id; status: 'PLACED'|'ACCEPTED'|'PREPARING'|'READY'|'SERVED'|'PAID'|'CANCELLED'; createdAt: number; items: OrderItem[]; note?: string };

type QRTileRecord = {
  id: Id;
  storeId: Id;
  publicCode: string;
  label?: string | null;
  tableId?: Id | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

type Db = {
  store: { id: string; name: string; slug?: string; orderingMode?: OrderingMode; printers?: string[] };
  cookTypes: StaffType[];
  waiterTypes: StaffType[];
  categories: Category[];
  items: Item[];
  modifiers: Modifier[];
  itemModifiers: ItemModifier[];
  tables: Table[];
  orders: Order[];
  waiters: Waiter[];
  cooks: Cook[];
  waiterAssignments: WaiterAssignment[];
  qrTiles: QRTileRecord[];
};

const LS_KEY = 'devMocks';

const normalizePrinterTopic = (value?: string | null, fallback?: string) => {
  const raw = (value ?? fallback ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  const sanitized = raw
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeTableRecord = (table: unknown): Table => {
  if (!isRecord(table)) {
    return { id: uid('table'), label: 'Table', isActive: true };
  }
  const id = typeof table.id === 'string' ? table.id : uid('table');
  const label =
    typeof table.label === 'string'
      ? table.label
      : typeof table.title === 'string'
        ? table.title
        : typeof table.code === 'string'
          ? table.code
          : 'Table';
  const isActive =
    typeof table.isActive === 'boolean'
      ? table.isActive
      : typeof table.active === 'boolean'
        ? table.active
        : true;
  return { id, label, isActive };
};

const normalizeWaiterRecord = (waiter: unknown): Waiter => {
  if (!isRecord(waiter)) {
    const id = uid('waiter');
    return { id, email: `${id}@demo.local`, displayName: 'Waiter', waiterTypeId: null };
  }
  const id = typeof waiter.id === 'string' ? waiter.id : uid('waiter');
  const email = typeof waiter.email === 'string' ? waiter.email : `${id}@demo.local`;
  const displayName =
    typeof waiter.displayName === 'string'
      ? waiter.displayName
      : email || 'Waiter';
  const password = typeof waiter.password === 'string' ? waiter.password : undefined;
  const waiterTypeId =
    typeof waiter.waiterTypeId === 'string' ? waiter.waiterTypeId : null;
  return { id, email, displayName, password, waiterTypeId };
};

const normalizeCookRecord = (cook: unknown): Cook => {
  if (!isRecord(cook)) {
    const id = uid('cook');
    return { id, email: `${id}@demo.local`, displayName: 'Cook', cookTypeId: null };
  }
  const id = typeof cook.id === 'string' ? cook.id : uid('cook');
  const email = typeof cook.email === 'string' ? cook.email : `${id}@demo.local`;
  const displayName =
    typeof cook.displayName === 'string'
      ? cook.displayName
      : email || 'Cook';
  const password = typeof cook.password === 'string' ? cook.password : undefined;
  const cookTypeId =
    typeof cook.cookTypeId === 'string' ? cook.cookTypeId : null;
  return { id, email, displayName, password, cookTypeId };
};

const normalizeStaffTypeRecord = (type: unknown): StaffType => {
  if (!isRecord(type)) {
    const id = uid('type');
    return { id, slug: id, title: 'Type', printerTopic: null };
  }
  const id = typeof type.id === 'string' ? type.id : uid('type');
  const title =
    typeof type.title === 'string' ? type.title : 'Type';
  const slug =
    typeof type.slug === 'string'
      ? type.slug
      : normalizePrinterTopic(title) || id;
  const printerTopic =
    typeof type.printerTopic === 'string' ? type.printerTopic : null;
  return { id, slug, title, printerTopic };
};

const isWaiterAssignment = (assignment: unknown): assignment is WaiterAssignment =>
  isRecord(assignment) &&
  typeof assignment.waiterId === 'string' &&
  typeof assignment.tableId === 'string';

const normalizeOrderingMode = (mode: unknown): OrderingMode => {
  if (mode === 'waiter' || mode === 'hybrid') return mode;
  return 'qr';
};

const normalizeModifierMap = (value: unknown): Record<string, string> => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return normalizeModifierMap(JSON.parse(value));
    } catch (error) {
      console.warn('Failed to parse modifier payload', error);
      return {};
    }
  }
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((acc, [modifierId, option]) => {
    if (typeof option === 'string') acc[modifierId] = option;
    return acc;
  }, {});
};

const mapToSelections = (source: CreateOrderPayloadItem['modifiers']): NonNullable<OrderItem['modifiers']> => {
  const modifierMap = normalizeModifierMap(source);
  return Object.entries(modifierMap).map(([modifierId, optionId]) => ({
    modifierId,
    optionIds: [optionId],
  }));
};

const normalizeOrderItems = (items: CreateOrderPayload['items']): OrderItem[] =>
  items.map((item) => {
    const qty =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
        ? item.quantity
        : 1;
    const selections = mapToSelections(item.modifiers);
    return {
      id: uid('orderItem'),
      itemId: item.itemId,
      qty,
      status: 'PLACED',
      acceptedAt: null,
      servedAt: null,
      modifiers: selections.length ? selections : undefined,
    };
  });

const normalizeQrTileRecord = (tile: unknown, storeId: string): QRTileRecord => {
  if (!isRecord(tile)) {
    const now = Date.now();
    return {
      id: uid('qr'),
      storeId,
      publicCode: uid('qr').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase(),
      label: null,
      tableId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }
  const id = typeof tile.id === 'string' ? tile.id : uid('qr');
  const publicCode =
    typeof (tile as any).publicCode === 'string' && (tile as any).publicCode.trim().length > 0
      ? (tile as any).publicCode
      : id.slice(-8).toUpperCase();
  const label = typeof (tile as any).label === 'string' ? (tile as any).label : null;
  const tableId = typeof (tile as any).tableId === 'string' ? (tile as any).tableId : null;
  const isActive = typeof (tile as any).isActive === 'boolean' ? (tile as any).isActive : true;
  const createdAt =
    typeof (tile as any).createdAt === 'number' ? (tile as any).createdAt : Date.now();
  const updatedAt =
    typeof (tile as any).updatedAt === 'number' ? (tile as any).updatedAt : createdAt;
  return {
    id,
    storeId: typeof (tile as any).storeId === 'string' ? (tile as any).storeId : storeId,
    publicCode,
    label,
    tableId,
    isActive,
    createdAt,
    updatedAt,
  };
};

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function save(db: Db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

type StoredDb = Partial<Db> & {
  tables?: unknown;
  waiters?: unknown;
  cooks?: unknown;
  cookTypes?: unknown;
  waiterTypes?: unknown;
  waiterAssignments?: unknown;
  qrTiles?: unknown;
};

function load(): Db {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredDb;
      const tables = Array.isArray(parsed.tables) ? parsed.tables.map(normalizeTableRecord) : [];
      const waiters = Array.isArray(parsed.waiters) ? parsed.waiters.map(normalizeWaiterRecord) : [];
      const cooks = Array.isArray(parsed.cooks) ? parsed.cooks.map(normalizeCookRecord) : [];
      const assignments = Array.isArray(parsed.waiterAssignments)
        ? parsed.waiterAssignments.filter(isWaiterAssignment)
        : [];
      const cookTypes = Array.isArray(parsed.cookTypes)
        ? parsed.cookTypes.map(normalizeStaffTypeRecord)
        : [];
      const waiterTypes = Array.isArray(parsed.waiterTypes)
        ? parsed.waiterTypes.map(normalizeStaffTypeRecord)
        : [];
      const storeId = (parsed.store as any)?.id || 'store_1';
      const qrTiles = Array.isArray(parsed.qrTiles)
        ? parsed.qrTiles.map((tile) => normalizeQrTileRecord(tile, storeId))
        : [];
      const storePrintersRaw = (parsed.store as any)?.printers;
      const storePrinters = Array.isArray(storePrintersRaw)
        ? storePrintersRaw
            .map((printer) => (typeof printer === 'string' ? printer.trim() : ''))
            .filter(Boolean)
        : ['printer_1', 'printer_2'];
      const store =
        parsed.store && isRecord(parsed.store)
        ? {
            id: storeId,
            name: (parsed.store as any).name || 'Garsone Offline Demo',
            slug: (parsed.store as any).slug || 'local-store',
            orderingMode: normalizeOrderingMode((parsed.store as any).orderingMode),
            printers: storePrinters,
          }
        : {
            id: storeId,
            name: 'Garsone Offline Demo',
            slug: 'local-store',
            orderingMode: 'qr' as OrderingMode,
            printers: storePrinters,
          };
      const db: Db = {
        store,
        cookTypes,
        waiterTypes,
        categories: parsed.categories ?? [],
        items: parsed.items ?? [],
        modifiers: parsed.modifiers ?? [],
        itemModifiers: parsed.itemModifiers ?? [],
        tables,
        orders: parsed.orders ?? [],
        waiters,
        cooks,
        waiterAssignments: assignments,
        qrTiles,
      };
      seedStaffTypesIfEmpty(db);
      seedQrTilesIfEmpty(db);
      ensureOrderItemMeta(db);
      return db;
    } catch (error) {
      console.warn('Failed to parse devMocks snapshot', error);
    }
  }
  // Seed with demo data
  const catCoffee: Category = {
    id: uid('cat'),
    title: 'Coffee',
    sortOrder: 0,
    printerTopic: 'printer_1',
  };
  const catPastry: Category = {
    id: uid('cat'),
    title: 'Pastries',
    sortOrder: 1,
    printerTopic: 'printer_2',
  };
  const cookTypeBar: StaffType = {
    id: uid('cooktype'),
    slug: 'bar',
    title: 'Bar Station',
    printerTopic: 'printer_1',
  };
  const cookTypeKitchen: StaffType = {
    id: uid('cooktype'),
    slug: 'kitchen',
    title: 'Kitchen',
    printerTopic: 'printer_2',
  };
  const waiterTypeFloor: StaffType = {
    id: uid('waitertype'),
    slug: 'floor',
    title: 'Floor',
    printerTopic: 'printer_2',
  };
  const waiterTypeBar: StaffType = {
    id: uid('waitertype'),
    slug: 'bar',
    title: 'Bar Service',
    printerTopic: 'printer_1',
  };
  const modMilk: Modifier = { id: uid('mod'), title: 'Milk', name: 'Milk', minSelect: 0, maxSelect: 1, options: [
    { id: uid('opt'), title: 'Whole', label: 'Whole', priceDeltaCents: 0, sortOrder: 0 },
    { id: uid('opt'), title: 'Oat', label: 'Oat', priceDeltaCents: 50, sortOrder: 1 },
    { id: uid('opt'), title: 'Almond', label: 'Almond', priceDeltaCents: 70, sortOrder: 2 },
  ]};
  const modSugar: Modifier = { id: uid('mod'), title: 'Sugar', name: 'Sugar', minSelect: 0, maxSelect: 1, options: [
    { id: uid('opt'), title: 'No sugar', label: 'No sugar', priceDeltaCents: 0, sortOrder: 0 },
    { id: uid('opt'), title: '1 tsp', label: '1 tsp', priceDeltaCents: 0, sortOrder: 1 },
    { id: uid('opt'), title: '2 tsp', label: '2 tsp', priceDeltaCents: 0, sortOrder: 2 },
  ]};
  const itemEsp: Item = { id: uid('item'), title: 'Espresso', description: 'Rich and bold', priceCents: 250, categoryId: catCoffee.id, isAvailable: true, printerTopic: catCoffee.printerTopic ?? null };
  const itemCap: Item = {
    id: uid('item'),
    title: 'Cappuccino',
    description: 'Classic foam',
    priceCents: 350,
    categoryId: catCoffee.id,
    isAvailable: true,
    imageUrl: 'https://oupwquepcjydgevdfnlm.supabase.co/storage/v1/object/public/assets/local-store/Cup-Of-Creamy-Coffee.png',
    printerTopic: catCoffee.printerTopic ?? null,
  };
  const itemCro: Item = { id: uid('item'), title: 'Croissant', description: 'Buttery & flaky', priceCents: 300, categoryId: catPastry.id, isAvailable: true, printerTopic: catPastry.printerTopic ?? null };
  const db: Db = {
    store: {
      id: 'store_1',
      name: 'Garsone Offline Demo',
      slug: 'local-store',
      orderingMode: 'qr',
      printers: ['printer_1', 'printer_2'],
    },
    cookTypes: [cookTypeBar, cookTypeKitchen],
    waiterTypes: [waiterTypeFloor, waiterTypeBar],
    categories: [catCoffee, catPastry],
    items: [itemEsp, itemCap, itemCro],
    modifiers: [modMilk, modSugar],
    itemModifiers: [
      { itemId: itemCap.id, modifierId: modMilk.id, isRequired: false },
      { itemId: itemCap.id, modifierId: modSugar.id, isRequired: false },
      { itemId: itemEsp.id, modifierId: modSugar.id, isRequired: false },
    ],
    tables: [
      { id: 'T1', label: 'Table 1', isActive: true },
      { id: 'T2', label: 'Table 2', isActive: true },
      { id: 'T3', label: 'Table 3', isActive: true },
    ],
    orders: [],
    waiters: [
      {
        id: 'w1',
        email: 'waiter1@demo.local',
        displayName: 'Waiter 1',
        password: 'password',
        waiterTypeId: waiterTypeFloor.id,
      },
    ],
    cooks: [
      {
        id: 'c1',
        email: 'cook1@demo.local',
        displayName: 'Cook 1',
        password: 'password',
        cookTypeId: cookTypeKitchen.id,
      },
    ],
    waiterAssignments: [{ waiterId: 'w1', tableId: 'T1' }],
    qrTiles: [],
  };
  seedStaffTypesIfEmpty(db);
  seedQrTilesIfEmpty(db);
  ensureOrderItemMeta(db);
  save(db);
  return db;
}

function snapshot() { return load(); }

function ensureOrderItemMeta(db: Db) {
  let changed = false;
  db.orders = db.orders.map((order) => {
    const nextItems = (order.items || []).map((item) => {
      let next = item as OrderItem;
      if (!next.id) {
        next = { ...next, id: uid('orderItem') };
        changed = true;
      }
      if (!next.status) {
        next = { ...next, status: 'PLACED', acceptedAt: null, servedAt: null };
        changed = true;
      }
      if (next.acceptedAt === undefined) {
        next = { ...next, acceptedAt: null };
        changed = true;
      }
      if (next.servedAt === undefined) {
        next = { ...next, servedAt: null };
        changed = true;
      }
      return next;
    });
    return { ...order, items: nextItems };
  });
  if (changed) save(db);
}

function summarizeTable(db: Db, table: Table) {
  return {
    id: table.id,
    label: table.label,
    isActive: table.isActive,
    active: table.isActive,
    waiterCount: db.waiterAssignments.filter((a) => a.tableId === table.id).length,
    orderCount: db.orders.filter((o) => o.tableId === table.id).length,
    openOrders: db.orders.filter((o) => o.tableId === table.id && o.status !== 'SERVED' && o.status !== 'CANCELLED').length,
  };
}

// Enrich order with required fields
function enrichOrder(db: Db, order: Order): any {
  const table = db.tables.find(t => t.id === order.tableId);
  const items = db.items;
  let totalCents = 0;
  const enrichedItems = order.items.map((orderItem) => {
    const item = items.find(i => i.id === orderItem.itemId);
    const category = item ? db.categories.find((c) => c.id === item.categoryId) : undefined;
    const unitPriceCents = item?.priceCents || 0;
    const quantity = orderItem.qty || 1;
    totalCents += unitPriceCents * quantity;
    const acceptedAt =
      typeof orderItem.acceptedAt === 'number'
        ? new Date(orderItem.acceptedAt).toISOString()
        : orderItem.acceptedAt ?? null;
    const servedAt =
      typeof orderItem.servedAt === 'number'
        ? new Date(orderItem.servedAt).toISOString()
        : orderItem.servedAt ?? null;
    return {
      id: orderItem.id || uid('orderItem'),
      itemId: orderItem.itemId,
      status: orderItem.status || 'PLACED',
      acceptedAt,
      servedAt,
      title: item?.title || 'Item',
      unitPriceCents,
      quantity,
      categoryId: item?.categoryId,
      categoryTitle: category?.title,
      printerTopic: item?.printerTopic ?? null,
      modifiers: orderItem.modifiers || [],
    };
  });
  
  return {
    ...order,
    tableLabel: table?.label || 'Unknown Table',
    total: totalCents / 100,
    totalCents,
    createdAt: new Date(order.createdAt).toISOString(),
    items: enrichedItems,
  };
}

// Compose menu payload like backend
function composeMenu() {
  const db = snapshot();
  const items = db.items.map(it => ({
    ...it,
    modifiers: db.itemModifiers
      .filter(im => im.itemId === it.id)
      .map(im => {
        const m = db.modifiers.find(mm => mm.id === im.modifierId)!;
        return { id: m.id, name: m.title, title: m.title, minSelect: m.minSelect, maxSelect: m.maxSelect, required: im.isRequired, options: m.options.map(opt => ({ ...opt, label: opt.title })) };
      })
  }));
  return { categories: db.categories, items };
}

function seedStaffTypesIfEmpty(db: Db) {
  if (!db.cookTypes || db.cookTypes.length === 0) {
    db.cookTypes = [
      { id: uid('cooktype'), slug: 'kitchen', title: 'Kitchen', printerTopic: 'printer_2' },
      { id: uid('cooktype'), slug: 'bar', title: 'Bar Station', printerTopic: 'printer_1' },
    ];
  }
  if (!db.waiterTypes || db.waiterTypes.length === 0) {
    db.waiterTypes = [
      { id: uid('waitertype'), slug: 'floor', title: 'Floor', printerTopic: 'printer_2' },
      { id: uid('waitertype'), slug: 'bar', title: 'Bar Service', printerTopic: 'printer_1' },
    ];
  }
  const defaultCookTypeId = db.cookTypes[0]?.id ?? null;
  const defaultWaiterTypeId = db.waiterTypes[0]?.id ?? null;
  if (defaultCookTypeId) {
    db.cooks = db.cooks.map((cook) =>
      cook.cookTypeId ? cook : { ...cook, cookTypeId: defaultCookTypeId }
    );
  }
  if (defaultWaiterTypeId) {
    db.waiters = db.waiters.map((waiter) =>
      waiter.waiterTypeId ? waiter : { ...waiter, waiterTypeId: defaultWaiterTypeId }
    );
  }
}

function seedOrdersIfEmpty(db: Db) {
  if (db.orders.length > 0) return;
  const t1 = db.tables.find(t=>t.id==='T1') || db.tables[0];
  const t2 = db.tables.find(t=>t.id==='T2') || db.tables[1] || db.tables[0];
  const t3 = db.tables.find(t=>t.id==='T3') || db.tables[2] || db.tables[0];
  const espresso = db.items.find(i=>i.title==='Espresso') || db.items[0];
  const cappuccino = db.items.find(i=>i.title==='Cappuccino') || db.items[1] || db.items[0];
  const croissant = db.items.find(i=>i.title==='Croissant') || db.items[2] || db.items[0];
  const milk = db.modifiers.find(m=>m.title==='Milk');
  const sugar = db.modifiers.find(m=>m.title==='Sugar');
  const oat = milk?.options.find(o=>o.title==='Oat');
  const sugar1 = sugar?.options.find(o=>o.title==='1 tsp');

  const now = Date.now();
  const cappuccinoModifiers: NonNullable<OrderItem['modifiers']> = [];
  if (milk && oat) cappuccinoModifiers.push({ modifierId: milk.id, optionIds: [oat.id] });
  if (sugar && sugar1) cappuccinoModifiers.push({ modifierId: sugar.id, optionIds: [sugar1.id] });
  db.orders = [
    { id: uid('ord'), tableId: t2.id, status: 'PLACED', createdAt: now - 60_000,
      items: [ { id: uid('orderItem'), itemId: cappuccino.id, qty: 1, status: 'PLACED', acceptedAt: null, servedAt: null, modifiers: cappuccinoModifiers } ], note: 'No cocoa on top' },
    { id: uid('ord'), tableId: t1.id, status: 'PREPARING', createdAt: now - 5*60_000,
      items: [ { id: uid('orderItem'), itemId: espresso.id, qty: 2, status: 'ACCEPTED', acceptedAt: now - 5*60_000, servedAt: null, modifiers: [] } ], note: '' },
    { id: uid('ord'), tableId: t3.id, status: 'READY', createdAt: now - 12*60_000,
      items: [ { id: uid('orderItem'), itemId: croissant.id, qty: 1, status: 'ACCEPTED', acceptedAt: now - 12*60_000, servedAt: null, modifiers: [] } ], note: '' },
    { id: uid('ord'), tableId: t1.id, status: 'CANCELLED', createdAt: now - 30*60_000,
      items: [ { id: uid('orderItem'), itemId: cappuccino.id, qty: 1, status: 'PLACED', acceptedAt: null, servedAt: null, modifiers: [] } ], note: 'Changed mind' },
    { id: uid('ord'), tableId: t2.id, status: 'SERVED', createdAt: now - 55*60_000,
      items: [ { id: uid('orderItem'), itemId: espresso.id, qty: 1, status: 'SERVED', acceptedAt: now - 55*60_000, servedAt: now - 50*60_000, modifiers: [] } ], note: '' },
  ];
  save(db);
}

function seedQrTilesIfEmpty(db: Db) {
  if (db.qrTiles.length > 0) return;
  const now = Date.now();
  const tables = db.tables.length ? db.tables : [{ id: 'T1', label: 'Table 1', isActive: true }];
  for (let i = 0; i < 6; i += 1) {
    const table = tables[i % tables.length];
    db.qrTiles.push({
      id: uid('qr'),
      storeId: db.store.id,
      publicCode: `QR${String(i + 1).padStart(2, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      label: `Tile ${String(i + 1).padStart(2, '0')}`,
      tableId: table?.id ?? null,
      isActive: true,
      createdAt: now - i * 120_000,
      updatedAt: now - i * 120_000,
    });
  }
  save(db);
}

function serializeQrTile(db: Db, tile: QRTileRecord) {
  const table = tile.tableId ? db.tables.find((t) => t.id === tile.tableId) : null;
  return {
    id: tile.id,
    storeId: tile.storeId,
    storeSlug: db.store.slug || undefined,
    publicCode: tile.publicCode,
    label: tile.label ?? null,
    isActive: tile.isActive,
    tableId: tile.tableId ?? null,
    tableLabel: table?.label ?? null,
    createdAt: new Date(tile.createdAt).toISOString(),
    updatedAt: new Date(tile.updatedAt).toISOString(),
  };
}

export const devMocks = {
  // Store & tables & menu
  getStore() { const db = snapshot(); return Promise.resolve({ store: db.store }); },
  getTables() {
    const db = snapshot();
    const tables = db.tables
      .filter((table) => table.isActive)
      .map((table) => ({ id: table.id, label: table.label, active: table.isActive }));
    return Promise.resolve({ tables });
  },
  getMenu() { return Promise.resolve(composeMenu()); },
  adminListStores() {
    const db = snapshot();
    return Promise.resolve({
      stores: [
        {
          id: db.store.id,
          name: db.store.name,
          slug: db.store.slug || 'local-store',
          orderingMode: db.store.orderingMode || 'qr',
          printers: db.store.printers || [],
        },
      ],
    });
  },
  adminUpdateStoreOrderingMode(storeId: string, orderingMode: OrderingMode) {
    const db = snapshot();
    if (db.store.id !== storeId) {
      return Promise.reject(new Error('Store not found'));
    }
    db.store.orderingMode = orderingMode;
    save(db);
    return Promise.resolve({
      store: {
        id: db.store.id,
        name: db.store.name,
        slug: db.store.slug || 'local-store',
        orderingMode: db.store.orderingMode,
        printers: db.store.printers || [],
      },
    });
  },
  adminUpdateStorePrinters(storeId: string, printers: string[]) {
    const db = snapshot();
    if (db.store.id !== storeId) return Promise.reject(new Error('Store not found'));
    const cleaned = Array.from(new Set((printers || []).map((p) => p.trim()).filter(Boolean)));
    db.store.printers = cleaned;
    save(db);
    return Promise.resolve({
      store: {
        id: db.store.id,
        name: db.store.name,
        slug: db.store.slug || 'local-store',
        orderingMode: db.store.orderingMode || 'qr',
        printers: db.store.printers || [],
      },
    });
  },
  adminListStoreTables(_storeId: string) {
    const db = snapshot();
    return Promise.resolve({
      tables: db.tables.map((t) => ({
        id: t.id,
        label: t.label,
        isActive: t.isActive,
        waiterCount: db.waiterAssignments.filter((a) => a.tableId === t.id).length,
        orderCount: db.orders.filter((o) => o.tableId === t.id).length,
      })),
    });
  },
  adminListQrTiles(storeId: string) {
    const db = snapshot();
    seedQrTilesIfEmpty(db);
    const tiles = db.qrTiles
      .filter((tile) => tile.storeId === storeId || tile.storeId === db.store.id)
      .map((tile) => serializeQrTile(db, tile));
    return Promise.resolve({
      store: { id: db.store.id, name: db.store.name, slug: db.store.slug },
      tiles,
    });
  },
  adminBulkCreateQrTiles(storeId: string, data: { count: number; labelPrefix?: string }) {
    const db = snapshot();
    const count = Math.max(1, Math.min(500, Number(data.count) || 0));
    const prefix = (data.labelPrefix || '').trim();
    const pad = Math.max(String(count).length, 2);
    const created: QRTileRecord[] = [];
    for (let i = 0; i < count; i += 1) {
      const publicCode = `QR${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      const label = prefix ? `${prefix}${String(i + 1).padStart(pad, '0')}` : null;
      const tile: QRTileRecord = {
        id: uid('qr'),
        storeId: storeId || db.store.id,
        publicCode,
        label,
        tableId: null,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      db.qrTiles.unshift(tile);
      created.push(tile);
    }
    save(db);
    return Promise.resolve({ tiles: created.map((tile) => serializeQrTile(db, tile)) });
  },
  adminUpdateQrTile(id: string, data: { tableId?: string | null; isActive?: boolean; label?: string }) {
    const db = snapshot();
    const tile = db.qrTiles.find((t) => t.id === id);
    if (!tile) return Promise.reject(new Error('QR tile not found'));
    if (typeof data.isActive === 'boolean') tile.isActive = data.isActive;
    if (typeof data.label !== 'undefined') tile.label = null;
    if (typeof data.tableId !== 'undefined') tile.tableId = data.tableId || null;
    tile.updatedAt = Date.now();
    save(db);
    return Promise.resolve({ tile: serializeQrTile(db, tile) });
  },
  adminDeleteQrTile(id: Id) {
    const db = snapshot();
    db.qrTiles = db.qrTiles.filter((t) => t.id !== id);
    save(db);
    return Promise.resolve({ ok: true });
  },
  resolveQrTile(publicCode: string) {
    const db = snapshot();
    const tile = db.qrTiles.find((t) => t.publicCode === publicCode && t.isActive);
    if (!tile) return Promise.reject(new Error('QR_TILE_NOT_FOUND_OR_INACTIVE'));
    const table = tile.tableId ? db.tables.find((t) => t.id === tile.tableId) : null;
    if (!tile.tableId || !table) {
      return Promise.resolve({
        status: 'UNASSIGNED_TILE',
        storeSlug: db.store.slug || 'local-store',
        publicCode,
      });
    }
    return Promise.resolve({
      status: 'OK',
      storeSlug: db.store.slug || 'local-store',
      tableId: tile.tableId,
      tableLabel: table?.label ?? '',
      publicCode,
    });
  },
  
  // Auth (offline)
  signIn(email: string, _password: string) {
    const db = snapshot();
    const e = email.toLowerCase();
    const role: 'waiter' | 'manager' | 'cook' | 'architect' = e.startsWith('manager')
      ? 'manager'
      : e.startsWith('cook')
        ? 'cook'
        : e.startsWith('architect')
          ? 'architect'
          : 'waiter';
    const waiter = role === 'waiter' ? db.waiters.find((w) => w.email === e) : null;
    const cook = role === 'cook' ? db.cooks.find((c) => c.email === e) : null;
    const waiterType =
      waiter?.waiterTypeId
        ? db.waiterTypes.find((t) => t.id === waiter.waiterTypeId) || null
        : null;
    const cookType =
      cook?.cookTypeId
        ? db.cookTypes.find((t) => t.id === cook.cookTypeId) || null
        : null;
    const user = {
      id: uid('user'),
      email,
      role,
      displayName: role.charAt(0).toUpperCase() + role.slice(1),
      storeId: db.store.id,
      storeSlug: db.store.slug,
      waiterTypeId: waiter?.waiterTypeId ?? null,
      cookTypeId: cook?.cookTypeId ?? null,
      waiterType,
      cookType,
    };
    return Promise.resolve({ accessToken: 'offline-token', user });
  },

  // Orders
  getOrders(params?: { status?: string; take?: number; tableIds?: string[] }) {
    const db = snapshot();
    seedOrdersIfEmpty(db);
    let orders = [...db.orders].sort((a,b)=> b.createdAt - a.createdAt);
    if (params?.status) orders = orders.filter(o => o.status === params.status);
    if (params?.tableIds && params.tableIds.length > 0) {
      orders = orders.filter((o) => params.tableIds!.includes(o.tableId));
    }
    if (params?.take) orders = orders.slice(0, params.take);
    return Promise.resolve({ orders: orders.map(o => enrichOrder(db, o)) });
  },
  getOrder(orderId: Id) {
    const db = snapshot();
    const order = db.orders.find(o=>o.id===orderId);
    return Promise.resolve({ order: order ? enrichOrder(db, order) : order });
  },
  getOrderQueueSummary() {
    const db = snapshot();
    seedOrdersIfEmpty(db);
    const ahead = db.orders.filter(
      (o) => o.status === 'PLACED' || o.status === 'PREPARING'
    ).length;
    return Promise.resolve({ ahead });
  },
  createOrder(data: CreateOrderPayload) {
    const db = snapshot();
    const order: Order = {
      id: uid('ord'),
      tableId: data.tableId,
      status: 'PLACED',
      createdAt: Date.now(),
      items: normalizeOrderItems(data.items),
      note: data.note,
    };
    db.orders.unshift(order);
    save(db);
    return Promise.resolve({ order: enrichOrder(db, order) });
  },
  updateOrderStatus(orderId: Id, status: Order['status']) {
    const db = snapshot();
    const o = db.orders.find(x=>x.id===orderId); if (o) o.status = status;
    save(db);
    return Promise.resolve({ order: o ? enrichOrder(db, o) : o });
  },
  updateOrderItemStatus(orderId: Id, orderItemId: Id, status: OrderItemStatus) {
    const db = snapshot();
    const order = db.orders.find((o) => o.id === orderId);
    if (order) {
      const line = order.items.find((item) => item.id === orderItemId);
      if (line) {
        const now = Date.now();
        line.status = status;
        if (status === 'ACCEPTED') {
          line.acceptedAt = now;
          line.servedAt = null;
        } else if (status === 'SERVED') {
          if (!line.acceptedAt) line.acceptedAt = now;
          line.servedAt = now;
        } else {
          line.acceptedAt = null;
          line.servedAt = null;
        }
      }
    }
    save(db);
    return Promise.resolve({ order: order ? enrichOrder(db, order) : order });
  },
  managerDeleteOrder(orderId: Id) {
    const db = snapshot();
    db.orders = db.orders.filter(o=>o.id!==orderId);
    save(db);
    return Promise.resolve({ ok: true });
  },
  managerCancelOrder(orderId: Id) {
    const db = snapshot();
    const o = db.orders.find(x=>x.id===orderId); if (o) o.status = 'CANCELLED';
    save(db);
    return Promise.resolve({ order: o ? enrichOrder(db, o) : o });
  },

  callWaiter(_tableId: Id) { return Promise.resolve({ ok: true }); },

  // Manager: tables & waiters
  managerListTables() {
    const db = snapshot();
    return Promise.resolve({ tables: db.tables.map((table) => summarizeTable(db, table)) });
  },
  managerCreateTable(data: { label: string; isActive?: boolean }) {
    const db = snapshot();
    const label = (data.label ?? '').trim();
    if (!label) return Promise.reject(new Error('Label required'));
    if (db.tables.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      return Promise.reject(new Error('Table label already exists'));
    }
    const table: Table = { id: uid('table'), label, isActive: data.isActive ?? true };
    db.tables.push(table);
    save(db);
    return Promise.resolve({ table: summarizeTable(db, table) });
  },
  managerUpdateTable(id: Id, data: { label?: string; isActive?: boolean }) {
    const db = snapshot();
    const table = db.tables.find((t) => t.id === id);
    if (!table) return Promise.reject(new Error('Table not found'));
    if (typeof data.label !== 'undefined') {
      const next = data.label.trim();
      if (!next) return Promise.reject(new Error('Label required'));
      if (
        next.toLowerCase() !== table.label.toLowerCase() &&
        db.tables.some((t) => t.label.toLowerCase() === next.toLowerCase())
      ) {
        return Promise.reject(new Error('Table label already exists'));
      }
      table.label = next;
    }
    if (typeof data.isActive !== 'undefined') {
      table.isActive = data.isActive;
    }
    save(db);
    return Promise.resolve({ table: summarizeTable(db, table) });
  },
  managerDeleteTable(id: Id) {
    const db = snapshot();
    const table = db.tables.find((t) => t.id === id);
    if (!table) return Promise.reject(new Error('Table not found'));
    table.isActive = false;
    db.waiterAssignments = db.waiterAssignments.filter((a) => a.tableId !== id);
    save(db);
    return Promise.resolve({ table: summarizeTable(db, table) });
  },

  getWaiterTables() {
    const db = snapshot();
    const waiters = db.waiters.map((waiter) => ({
      id: waiter.id,
      email: waiter.email,
      displayName: waiter.displayName,
      waiterTypeId: waiter.waiterTypeId ?? null,
      waiterType: waiter.waiterTypeId
        ? db.waiterTypes.find((t) => t.id === waiter.waiterTypeId) || null
        : null,
    }));
    const tables = db.tables.map((table) => ({
      id: table.id,
      label: table.label,
      active: table.isActive,
    }));
    const assignments = db.waiterAssignments.map((assignment) => {
      const waiter = db.waiters.find((w) => w.id === assignment.waiterId);
      const table = db.tables.find((t) => t.id === assignment.tableId);
      return {
        waiterId: assignment.waiterId,
        tableId: assignment.tableId,
        waiter: waiter
          ? {
              id: waiter.id,
              email: waiter.email,
              displayName: waiter.displayName,
              waiterTypeId: waiter.waiterTypeId ?? null,
              waiterType: waiter.waiterTypeId
                ? db.waiterTypes.find((t) => t.id === waiter.waiterTypeId) || null
                : null,
            }
          : undefined,
        table: table
          ? { id: table.id, label: table.label, active: table.isActive }
          : undefined,
      };
    }).filter((a) => a.waiter && a.table) as Array<{
      waiterId: Id;
      tableId: Id;
      waiter: { id: Id; email: string; displayName: string; waiterTypeId?: Id | null; waiterType?: StaffType | null };
      table: { id: Id; label: string; active: boolean };
    }>;
    return Promise.resolve({ assignments, waiters, tables });
  },
  assignWaiterTable(waiterId: Id, tableId: Id) {
    const db = snapshot();
    if (!db.waiters.find((w) => w.id === waiterId)) {
      return Promise.reject(new Error('Waiter not found'));
    }
    if (!db.tables.find((t) => t.id === tableId)) {
      return Promise.reject(new Error('Table not found'));
    }
    const exists = db.waiterAssignments.some(
      (a) => a.waiterId === waiterId && a.tableId === tableId
    );
    if (!exists) {
      db.waiterAssignments.push({ waiterId, tableId });
      save(db);
    }
    return Promise.resolve({ ok: true });
  },
  removeWaiterTable(waiterId: Id, tableId: Id) {
    const db = snapshot();
    db.waiterAssignments = db.waiterAssignments.filter(
      (a) => !(a.waiterId === waiterId && a.tableId === tableId)
    );
    save(db);
    return Promise.resolve({ ok: true });
  },
  listWaiters() {
    const db = snapshot();
    return Promise.resolve({
      waiters: db.waiters.map((w) => ({
        id: w.id,
        email: w.email,
        displayName: w.displayName,
        waiterTypeId: w.waiterTypeId ?? null,
        waiterType: w.waiterTypeId
          ? db.waiterTypes.find((t) => t.id === w.waiterTypeId) || null
          : null,
      })),
    });
  },
  createWaiter(email: string, password: string, displayName: string, waiterTypeId?: string | null) {
    const db = snapshot();
    if (db.waiters.some((w) => w.email.toLowerCase() === email.toLowerCase())) {
      return Promise.reject(new Error('Waiter email already exists'));
    }
    if (waiterTypeId) {
      const exists = db.waiterTypes.some((t) => t.id === waiterTypeId);
      if (!exists) return Promise.reject(new Error('Waiter type not found'));
    }
    const waiter: Waiter = {
      id: uid('waiter'),
      email: email.toLowerCase(),
      displayName: displayName || email,
      password,
      waiterTypeId: waiterTypeId ?? null,
    };
    db.waiters.push(waiter);
    save(db);
    return Promise.resolve({
      waiter: {
        ...waiter,
        waiterType: waiter.waiterTypeId
          ? db.waiterTypes.find((t) => t.id === waiter.waiterTypeId) || null
          : null,
      },
    });
  },
  updateWaiter(id: Id, data: Partial<{ email: string; password: string; displayName: string; waiterTypeId?: string | null }>) {
    const db = snapshot();
    const waiter = db.waiters.find((w) => w.id === id);
    if (!waiter) return Promise.reject(new Error('Waiter not found'));
    if (data.email) {
      const next = data.email.toLowerCase();
      if (
        next !== waiter.email &&
        db.waiters.some((w) => w.email.toLowerCase() === next)
      ) {
        return Promise.reject(new Error('Waiter email already exists'));
      }
      waiter.email = next;
    }
    if (data.displayName) waiter.displayName = data.displayName;
    if (data.password) waiter.password = data.password;
    if (data.waiterTypeId !== undefined) {
      if (data.waiterTypeId === null) {
        waiter.waiterTypeId = null;
      } else {
        const exists = db.waiterTypes.some((t) => t.id === data.waiterTypeId);
        if (!exists) return Promise.reject(new Error('Waiter type not found'));
        waiter.waiterTypeId = data.waiterTypeId;
      }
    }
    save(db);
    return Promise.resolve({
      waiter: {
        ...waiter,
        waiterType: waiter.waiterTypeId
          ? db.waiterTypes.find((t) => t.id === waiter.waiterTypeId) || null
          : null,
      },
    });
  },
  deleteWaiter(id: Id) {
    const db = snapshot();
    db.waiters = db.waiters.filter((w) => w.id !== id);
    db.waiterAssignments = db.waiterAssignments.filter((a) => a.waiterId !== id);
    save(db);
    return Promise.resolve({ ok: true });
  },

  listCookTypes() {
    const db = snapshot();
    return Promise.resolve({ types: db.cookTypes });
  },
  createCookType(data: { title: string; printerTopic?: string | null }) {
    const db = snapshot();
    const title = (data.title || '').trim();
    if (!title) return Promise.reject(new Error('Title required'));
    const slug = normalizePrinterTopic(title) || uid('cooktype');
    if (db.cookTypes.some((t) => t.slug === slug)) {
      return Promise.reject(new Error('Cook type already exists'));
    }
    const fallbackPrinter = Array.isArray(db.store.printers) ? db.store.printers[0] : undefined;
    const type: StaffType = {
      id: uid('cooktype'),
      slug,
      title,
      printerTopic: normalizePrinterTopic(data.printerTopic || fallbackPrinter || title) || null,
    };
    db.cookTypes.push(type);
    save(db);
    return Promise.resolve({ type });
  },
  updateCookType(id: Id, data: { title?: string; printerTopic?: string | null }) {
    const db = snapshot();
    const type = db.cookTypes.find((t) => t.id === id);
    if (!type) return Promise.reject(new Error('Cook type not found'));
    if (data.title) {
      type.title = data.title.trim();
    }
    if (data.printerTopic !== undefined) {
      type.printerTopic =
        data.printerTopic === null
          ? null
          : normalizePrinterTopic(data.printerTopic) || null;
    }
    save(db);
    return Promise.resolve({ type });
  },
  deleteCookType(id: Id) {
    const db = snapshot();
    db.cookTypes = db.cookTypes.filter((t) => t.id !== id);
    db.cooks = db.cooks.map((c) =>
      c.cookTypeId === id ? { ...c, cookTypeId: null } : c
    );
    save(db);
    return Promise.resolve({ ok: true });
  },

  listWaiterTypes() {
    const db = snapshot();
    return Promise.resolve({ types: db.waiterTypes });
  },
  createWaiterType(data: { title: string; printerTopic?: string | null }) {
    const db = snapshot();
    const title = (data.title || '').trim();
    if (!title) return Promise.reject(new Error('Title required'));
    const slug = normalizePrinterTopic(title) || uid('waitertype');
    if (db.waiterTypes.some((t) => t.slug === slug)) {
      return Promise.reject(new Error('Waiter type already exists'));
    }
    const fallbackPrinter = Array.isArray(db.store.printers) ? db.store.printers[0] : undefined;
    const type: StaffType = {
      id: uid('waitertype'),
      slug,
      title,
      printerTopic: normalizePrinterTopic(data.printerTopic || fallbackPrinter || title) || null,
    };
    db.waiterTypes.push(type);
    save(db);
    return Promise.resolve({ type });
  },
  updateWaiterType(id: Id, data: { title?: string; printerTopic?: string | null }) {
    const db = snapshot();
    const type = db.waiterTypes.find((t) => t.id === id);
    if (!type) return Promise.reject(new Error('Waiter type not found'));
    if (data.title) {
      type.title = data.title.trim();
    }
    if (data.printerTopic !== undefined) {
      type.printerTopic =
        data.printerTopic === null
          ? null
          : normalizePrinterTopic(data.printerTopic) || null;
    }
    save(db);
    return Promise.resolve({ type });
  },
  deleteWaiterType(id: Id) {
    const db = snapshot();
    db.waiterTypes = db.waiterTypes.filter((t) => t.id !== id);
    db.waiters = db.waiters.map((w) =>
      w.waiterTypeId === id ? { ...w, waiterTypeId: null } : w
    );
    save(db);
    return Promise.resolve({ ok: true });
  },

  listCooks() {
    const db = snapshot();
    return Promise.resolve({
      cooks: db.cooks.map((c) => ({
        id: c.id,
        email: c.email,
        displayName: c.displayName,
        cookTypeId: c.cookTypeId ?? null,
        cookType: c.cookTypeId
          ? db.cookTypes.find((t) => t.id === c.cookTypeId) || null
          : null,
      })),
    });
  },
  createCook(email: string, password: string, displayName: string, cookTypeId?: string | null) {
    const db = snapshot();
    if (db.cooks.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      return Promise.reject(new Error('Cook email already exists'));
    }
    if (cookTypeId) {
      const exists = db.cookTypes.some((t) => t.id === cookTypeId);
      if (!exists) return Promise.reject(new Error('Cook type not found'));
    }
    const cook: Cook = {
      id: uid('cook'),
      email: email.toLowerCase(),
      displayName: displayName || email,
      password,
      cookTypeId: cookTypeId ?? null,
    };
    db.cooks.push(cook);
    save(db);
    return Promise.resolve({
      cook: {
        ...cook,
        cookType: cook.cookTypeId
          ? db.cookTypes.find((t) => t.id === cook.cookTypeId) || null
          : null,
      },
    });
  },
  updateCook(id: Id, data: Partial<{ email: string; password: string; displayName: string; cookTypeId?: string | null }>) {
    const db = snapshot();
    const cook = db.cooks.find((c) => c.id === id);
    if (!cook) return Promise.reject(new Error('Cook not found'));
    if (data.email) {
      const next = data.email.toLowerCase();
      if (
        next !== cook.email &&
        db.cooks.some((c) => c.email.toLowerCase() === next)
      ) {
        return Promise.reject(new Error('Cook email already exists'));
      }
      cook.email = next;
    }
    if (data.displayName) cook.displayName = data.displayName;
    if (data.password) cook.password = data.password;
    if (data.cookTypeId !== undefined) {
      if (data.cookTypeId === null) {
        cook.cookTypeId = null;
      } else {
        const exists = db.cookTypes.some((t) => t.id === data.cookTypeId);
        if (!exists) return Promise.reject(new Error('Cook type not found'));
        cook.cookTypeId = data.cookTypeId;
      }
    }
    save(db);
    return Promise.resolve({
      cook: {
        ...cook,
        cookType: cook.cookTypeId
          ? db.cookTypes.find((t) => t.id === cook.cookTypeId) || null
          : null,
      },
    });
  },
  deleteCook(id: Id) {
    const db = snapshot();
    db.cooks = db.cooks.filter((c) => c.id !== id);
    save(db);
    return Promise.resolve({ ok: true });
  },

  // Manager: categories
  listCategories() { const db = snapshot(); return Promise.resolve({ categories: db.categories }); },
  createCategory(titleEn: string, sortOrder?: number, titleEl?: string, printerTopic?: string | null) {
    const db = snapshot();
    const c: Category = {
      id: uid('cat'),
      title: titleEn,
      titleEn,
      titleEl: titleEl ?? titleEn,
      sortOrder: sortOrder ?? db.categories.length,
      printerTopic: normalizePrinterTopic(printerTopic, titleEn) ?? null,
    };
    db.categories.push(c); save(db); return Promise.resolve({ category: c });
  },
  updateCategory(id: Id, data: Partial<Category>) {
    const db = snapshot();
    const c = db.categories.find(x=>x.id===id);
    if (c) {
      const payload: Partial<Category> = { ...data };
      if (data.printerTopic !== undefined) {
        payload.printerTopic =
          data.printerTopic === null
            ? null
            : normalizePrinterTopic(data.printerTopic, c.printerTopic || c.title) ?? null;
      }
      Object.assign(c, payload);
    }
    save(db);
    return Promise.resolve({ category: c });
  },
  deleteCategory(id: Id) {
    const db = snapshot(); db.categories = db.categories.filter(c=>c.id!==id); save(db); return Promise.resolve({ ok: true });
  },

  // Manager: items
  listItems() { const db = snapshot(); return Promise.resolve({ items: db.items }); },
  createItem(data: Partial<Item>) {
    const db = snapshot();
    const rawPrinter = (data as any).printerTopic;
    const fallbackPrinter = Array.isArray(db.store.printers) ? db.store.printers[0] : undefined;
    const printerTopic = normalizePrinterTopic(
      typeof rawPrinter === 'string' && rawPrinter.trim().length > 0 ? rawPrinter : fallbackPrinter
    ) || null;
    const it: Item = { id: uid('item'), title: data.titleEn || data.title || 'Item', titleEn: data.titleEn || data.title || 'Item', titleEl: (data as any).titleEl || data.title || 'Item', description: (data as any).descriptionEn || data.description, descriptionEn: (data as any).descriptionEn, descriptionEl: (data as any).descriptionEl, priceCents: data.priceCents || 0, categoryId: data.categoryId as Id, isAvailable: data.isAvailable !== false, imageUrl: data.imageUrl, printerTopic };
    db.items.push(it); save(db); return Promise.resolve({ item: it });
  },
  updateItem(id: Id, data: Partial<Item>) {
    const db = snapshot();
    const it = db.items.find(x=>x.id===id);
    if (it) {
      const payload: Partial<Item> = { ...data };
      if (data.printerTopic !== undefined) {
        payload.printerTopic =
          data.printerTopic === null
            ? null
            : normalizePrinterTopic(data.printerTopic) || null;
      }
      Object.assign(it, payload);
    }
    save(db);
    return Promise.resolve({ item: it });
  },
  deleteItem(id: Id) { const db = snapshot(); db.items = db.items.filter(i=>i.id!==id); save(db); return Promise.resolve({ ok: true }); },

  // Manager: modifiers per item
  listModifiers() { 
    const db = snapshot(); 
    return Promise.resolve({ 
      modifiers: db.modifiers.map(m => ({ 
        ...m, 
        name: m.title,
        options: m.options.map(opt => ({ ...opt, label: opt.title }))
      })) 
    }); 
  },
  createModifier(data: { titleEn: string; titleEl: string; minSelect: number; maxSelect?: number|null; isAvailable?: boolean }) {
    const maxSelect = typeof data.maxSelect === 'number' ? data.maxSelect : null;
    const db = snapshot(); const m: Modifier = { id: uid('mod'), title: data.titleEn, titleEn: data.titleEn, titleEl: data.titleEl, name: data.titleEn, minSelect: data.minSelect, maxSelect, isAvailable: data.isAvailable ?? true, options: [] };
    db.modifiers.push(m); save(db); 
    return Promise.resolve({ modifier: { ...m, name: m.title, options: m.options.map(opt => ({ ...opt, label: opt.title })) } });
  },
  updateModifier(id: Id, data: Partial<Modifier>) { 
    const db = snapshot(); const m = db.modifiers.find(x=>x.id===id); if (m) Object.assign(m, data); save(db); 
    return Promise.resolve({ modifier: m ? { ...m, name: m.title, options: m.options.map(opt => ({ ...opt, label: opt.title })) } : m }); 
  },
  deleteModifier(id: Id) { const db = snapshot(); db.modifiers = db.modifiers.filter(m=>m.id!==id); db.itemModifiers = db.itemModifiers.filter(im=>im.modifierId!==id); save(db); return Promise.resolve({ ok: true }); },
  createModifierOption(data: { modifierId: Id; titleEn: string; titleEl: string; priceDeltaCents: number; sortOrder: number }) { 
    const db = snapshot(); const m = db.modifiers.find(x=>x.id===data.modifierId); const opt: ModifierOption = { id: uid('opt'), title: data.titleEn, label: data.titleEn, titleEn: data.titleEn, titleEl: data.titleEl, priceDeltaCents: data.priceDeltaCents, sortOrder: data.sortOrder }; if (m) m.options.push(opt); save(db); 
    return Promise.resolve({ option: { ...opt, label: opt.title } }); 
  },
  updateModifierOption(id: Id, data: Partial<ModifierOption>) { const db = snapshot(); for (const m of db.modifiers) { const o = m.options.find(x=>x.id===id); if (o) { Object.assign(o, data); break; } } save(db); return Promise.resolve({ ok: true }); },
  deleteModifierOption(id: Id) { const db = snapshot(); for (const m of db.modifiers) { m.options = m.options.filter(o=>o.id!==id); } save(db); return Promise.resolve({ ok: true }); },
  linkItemModifier(itemId: Id, modifierId: Id, isRequired: boolean) { const db = snapshot(); db.itemModifiers.push({ itemId, modifierId, isRequired }); save(db); return Promise.resolve({ ok: true }); },
  unlinkItemModifier(itemId: Id, modifierId: Id) { const db = snapshot(); db.itemModifiers = db.itemModifiers.filter(im=> !(im.itemId===itemId && im.modifierId===modifierId)); save(db); return Promise.resolve({ ok: true }); },
};

