// Real phone browser, synthetic API only. No production orders or printing.
// VITE_LOCAL_ONLY=true VITE_API_URL=/api npm run dev -- --host127.0.0.1 --port18182
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mobileFixture, mobileTableId, mobileStore, installMobileFixture } from './fixtures/mobile-menu.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.RECOVERY_TEST_URL || 'http://127.0.0.1:18182';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local fixture server');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const fixture = mobileFixture('en');
const savedCart = [fixture.cart[0]];
const pendingKey = `garsone:order-submission:${mobileStore.slug}:${mobileTableId}`;
const url = `${origin}/table/${mobileTableId}?storeSlug=${mobileStore.slug}`;

async function setup() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [], unexpected = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ cart, pendingKey, slug, tableId }) => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('OFFLINE', 'false');
    // Reloads must preserve the real recovery journal and cart changes.
    if (!sessionStorage.getItem('recovery-fixture-initialized')) {
      sessionStorage.setItem('recovery-fixture-initialized', 'true');
      localStorage.removeItem(pendingKey);
      localStorage.setItem('cart-storage', JSON.stringify({ state: { items: cart }, version: 0 }));
      localStorage.setItem('cart-table-context', `${slug}:${tableId}`);
    }
    // Simulate HTTP LAN: randomUUID is unavailable but getRandomValues is present.
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
    // A venue can have working Wi-Fi/Pi while OS internet detection reports no WAN.
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  }, { cart: savedCart, pendingKey, slug: mobileStore.slug, tableId: mobileTableId });
  await installMobileFixture(page, origin, fixture, unexpected);
  let committed = false, requests = [], recoveries = 0, menuReads = 0, orderReads = 0, recoveryStatus = 0;
  let rejectFirst = true;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/orders' && request.method() === 'POST') {
      requests.push(request.postDataJSON());
      if (rejectFirst) { rejectFirst = false; return route.abort('connectionreset'); }
      committed = true;
      return json(201, { order: fixture.order, replayed: false });
    }
    if (path.startsWith('/orders/submissions/')) {
      recoveries++;
      assert.equal(request.method(), 'GET');
      assert.equal(new URL(request.url()).searchParams.get('tableId'), mobileTableId);
      assert.equal(request.headers()['x-store-slug'], mobileStore.slug);
      if (recoveryStatus) return json(recoveryStatus, { error: 'FORBIDDEN' });
      return committed ? json(200, { order: fixture.order, replayed: true }) : json(404, { error: 'ORDER_SUBMISSION_NOT_FOUND' });
    }
    if (path === '/public/menu-bootstrap') menuReads++;
    if (path === `/public/table/${mobileTableId}/orders`) { orderReads++; return json(200, { orders: committed ? [fixture.order] : [] }); }
    return route.fallback();
  });
  return { page, context, errors, unexpected, requests, commit: () => { committed = true; }, denyRecovery: status => { recoveryStatus = status; }, counts: () => ({ recoveries, menuReads, orderReads }) };
}
async function submit(page) {
  await page.goto(url);
  await page.getByRole('button', { name: /Coffee and handmade seasonal drinks/ }).click();
  await page.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).first().click();
  const dialog = page.getByRole('dialog');
  const button = dialog.getByRole('button', { name: 'Place order', exact: true });
  await button.click();
  await page.getByTestId('order-recovery').waitFor();
  await page.waitForFunction(key => Boolean(localStorage.getItem(key)), pendingKey);
}
const journal = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), pendingKey);
const cart = page => page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage')).state.items);
try {
  // The request never reached the server: reload and wake do GET only; explicit retry keeps the key and payload.
  const test = await setup();
  await submit(test.page);
  const original = await journal(test.page);
  assert.match(original.payload.submissionId, /^[0-9a-f-]{36}$/);
  assert.equal(test.requests.length, 1);
  await test.page.reload();
  await test.page.getByRole('button', { name: 'Retry saved order', exact: true }).waitFor();
  await test.page.evaluate(() => { dispatchEvent(new Event('online')); dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await test.page.waitForTimeout(800);
  assert.equal(test.requests.length, 1, 'reconnection must not automatically create an order');
  assert.deepEqual((await journal(test.page)).payload, original.payload);
  assert.deepEqual(await cart(test.page), savedCart);
  const before = test.counts();
  await test.page.evaluate(() => dispatchEvent(new CustomEvent('realtime-status', { detail: { connected: true } })));
  await test.page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await test.page.waitForTimeout(800);
  assert.ok(test.counts().menuReads > before.menuReads, 'reconnect must refresh the menu');
  assert.ok(test.counts().orderReads > before.orderReads, 'reconnect must refresh order status');
  await test.page.getByRole('button', { name: 'Retry saved order', exact: true }).click();
  await test.page.waitForFunction(key => localStorage.getItem(key) === null, pendingKey);
  assert.equal(test.requests.length, 2);
  assert.deepEqual(test.requests[1], test.requests[0]);
  assert.deepEqual(await cart(test.page), []);
  assert.deepEqual(test.errors, []); assert.deepEqual(test.unexpected, []);
  await test.context.close();

  // The server committed, but the response was lost: read-only recovery after reload, preserving later cart additions.
  const accepted = await setup();
  await submit(accepted.page);
  const acceptedAttempt = await journal(accepted.page);
  accepted.commit();
  // A failed lookup does not prove the original POST failed. Never clear its key on revoked/expired access.
  accepted.denyRecovery(401);
  await accepted.page.reload();
  await accepted.page.getByRole('button', { name: 'Retry saved order', exact: true }).click();
  await accepted.page.waitForTimeout(300);
  assert.equal((await journal(accepted.page)).payload.submissionId, acceptedAttempt.payload.submissionId);
  assert.equal(accepted.requests.length, 1);
  accepted.denyRecovery(403);
  await accepted.page.getByRole('button', { name: 'Retry saved order', exact: true }).click();
  await accepted.page.waitForTimeout(300);
  assert.equal((await journal(accepted.page)).payload.submissionId, acceptedAttempt.payload.submissionId);
  assert.equal(accepted.requests.length, 1);
  accepted.denyRecovery(0);
  const extraCart = [{ ...savedCart[0], quantity: savedCart[0].quantity + 2 }, fixture.cart[1]];
  await accepted.page.evaluate(items => localStorage.setItem('cart-storage', JSON.stringify({ state: { items }, version: 0 })), extraCart);
  await accepted.page.reload();
  await accepted.page.waitForFunction(key => localStorage.getItem(key) === null, pendingKey);
  assert.equal(accepted.requests.length, 1, 'accepted order must never be posted again by recovery');
  assert.equal(accepted.requests[0].submissionId, acceptedAttempt.payload.submissionId);
  assert.deepEqual(await cart(accepted.page), [{ ...extraCart[0], quantity: 2 }, extraCart[1]]);
  assert.deepEqual(accepted.errors, []); assert.deepEqual(accepted.unexpected, []);
  await accepted.context.close();

  // Hybrid mounts cook and waiter together. Their independently filtered snapshots must both heal after missed events.
  const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await staffContext.addInitScript(({ slug, cart }) => {
    Object.defineProperty(navigator, 'onLine', { get: () => false });
    localStorage.setItem('language', 'en'); localStorage.setItem('OFFLINE', 'false');
    localStorage.setItem('cart-storage', JSON.stringify({ state: { items: cart }, version: 0 }));
    sessionStorage.setItem('STORE_SLUG', slug);
    sessionStorage.setItem('auth-storage', JSON.stringify({ state: { token: 'fixture-token', user: { id: 'staff-fixture', role: 'hybrid', storeSlug: slug, printerTopic: 'printer_2' } }, version: 0 }));
  }, { slug: mobileStore.slug, cart: savedCart });
  const staff = await staffContext.newPage();
  const staffErrors = [], staffUnexpected = [];
  staff.on('pageerror', error => staffErrors.push(error.message));
  await staff.routeWebSocket('**/events/ws*', socket => socket.close());
  const otherTable = '11111111-1111-4111-8111-222222222222';
  const kitchenId = '44444444-4444-4444-8444-222222222222';
  let staffReads = 0, staffStatus = 'PLACED';
  await staff.route('**/api/**', async route => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname.replace(/^\/api/, '');
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/store') return json({ store: mobileStore });
    if (path === '/billing/visits') return json({ visits: [] });
    if (path === '/waiter/my-tables') return json({ tables: [{ id: mobileTableId, label: '12', active: true }], assignments: [{ waiterId: 'staff-fixture', tableId: mobileTableId, table: { label: '12', active: true } }] });
    if (path === '/orders') {
      staffReads++;
      const orders = [
        { ...fixture.order, status: staffStatus, items: fixture.order.items.map(item => ({ ...item, printerTopic: 'printer_1' })) },
        { ...fixture.order, id: kitchenId, tableId: otherTable, status: staffStatus, items: fixture.order.items.map(item => ({ ...item, printerTopic: 'printer_2' })) },
      ];
      return json({ orders: requestUrl.searchParams.has('tableIds') ? orders.slice(0, 1) : orders,
        shift: { start: new Date(Date.now() - 60_000).toISOString() } });
    }
    if (path === '/staff/push/key') return json({ enabled: false, publicKey: null });
    if (path === '/staff/push/diagnostics') return json({ ok: true });
    staffUnexpected.push(path); return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"UNEXPECTED_FIXTURE_REQUEST"}' });
  });
  await staff.goto(`${origin}/hybrid`);
  await staff.waitForFunction(({ waiterId, kitchenId }) => {
    const waiter = JSON.parse(localStorage.getItem('orders-storage') || '{}').state?.orders;
    const cook = JSON.parse(localStorage.getItem('cook-orders-storage') || '{}').state?.orders;
    return waiter?.length === 1 && waiter[0].id === waiterId && cook?.length === 1 && cook[0].id === kitchenId;
  }, { waiterId: fixture.order.id, kitchenId });
  await staff.waitForTimeout(600);
  assert.ok(staffReads < 8, 'shift hydration must not cause a recursive fetch loop');
  staffStatus = 'READY';
  await staff.evaluate(() => { dispatchEvent(new Event('focus')); dispatchEvent(new CustomEvent('realtime-status', { detail: { connected: true } })); });
  await staff.waitForFunction(() => ['orders-storage', 'cook-orders-storage'].every(key => JSON.parse(localStorage.getItem(key) || '{}').state?.orders?.[0]?.status === 'READY'));
  assert.deepEqual(await cart(staff), savedCart, 'refreshing staff snapshots must preserve the current draft');
  assert.deepEqual(staffErrors, []); assert.deepEqual(staffUnexpected, []);
  await staffContext.close();
  console.log('PASS: lost response, stable explicit retry, reload recovery, GET-only reconnect, lookup authorization failure, cart preservation and mobile layout');
} finally { await browser.close(); }
