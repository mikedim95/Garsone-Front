// Run against VITE_LOCAL_ONLY=true VITE_API_URL=/api (e.g. Vite on 18181).
// All API data is synthetic and all API requests are mocked, including writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = new URL(process.env.GUEST_TEST_URL || 'http://127.0.0.1:18181').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a local test server');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const tableId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';
const orderId = '44444444-4444-4444-8444-444444444444';
const store = { id: '55555555-5555-4555-8555-555555555555', slug: 'test-venue', name: 'Test Venue', orderingMode: 'qr', customerOrderRecallEnabled: true };
const modifier = { id: 'flavours', name: 'Flavours', titleEn: 'Flavours', required: true, minSelect: 2, maxSelect: 2,
  options: ['Mint', 'Apple', 'Lemon'].map(name => ({ id: name.toLowerCase(), label: name, titleEn: name, priceDeltaCents: 0 })) };
const item = { id: itemId, title: 'Tea', titleEn: 'Tea', priceCents: 500, categoryId, isAvailable: true, available: true, modifiers: [modifier] };
const bootstrap = { store, table: { id: tableId, label: '1' }, menu: {
  categories: [{ id: categoryId, title: 'Drinks', titleEn: 'Drinks' }], items: [item], modifiers: [modifier], itemModifiers: [],
} };

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => { localStorage.setItem('language', 'en'); localStorage.setItem('OFFLINE', 'false'); });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const unexpected = [];
  page.on('pageerror', error => errors.push(error.message));
  if (page.routeWebSocket) await page.routeWebSocket('**/events/ws*', ws => ws.close());
  let failBootstrap = true;
  let nullTable = false;
  let bootstrapCalls = 0;
  let orderPosts = 0;
  let postedPayload;
  let releaseFirstOrder;
  const firstOrderGate = new Promise(resolve => { releaseFirstOrder = resolve; });
  let firstOrderStarted;
  const firstOrderRequest = new Promise(resolve => { firstOrderStarted = resolve; });
  let createdOrder = null;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin !== origin) { unexpected.push(request.url()); return route.abort(); }
    const path = url.pathname.replace(/^\/api/, '');
    requests.push({ path, method: request.method() });
    let status = 200;
    let body = {};
    if (path === '/public/menu-bootstrap') {
      bootstrapCalls++;
      status = failBootstrap ? 503 : 200;
      body = failBootstrap ? { error: 'MENU_UNAVAILABLE', message: 'Please reconnect to the venue Wi-Fi and try again.' }
        : { ...bootstrap, table: nullTable ? null : bootstrap.table };
    } else if (path === '/store') body = { store, meta: { currencyCode: 'EUR', locale: 'en' } };
    else if (path === `/public/table/${tableId}`) body = { tableId, tableLabel: '1', storeSlug: store.slug, storeName: store.name };
    else if (path === `/public/table/${tableId}/orders`) body = { orders: createdOrder ? [createdOrder] : [] };
    else if (path === '/orders/queue') body = { ahead: 0 };
    else if (path === `/public/orders/${orderId}/summary`) body = { queuePosition: 1, estimatedMinutes: 5 };
    else if (path === '/orders' && request.method() === 'POST') {
      orderPosts++;
      postedPayload = request.postDataJSON();
      if (orderPosts === 1) {
        firstOrderStarted();
        await firstOrderGate;
        status = 503;
        body = { error: 'ORDER_UNAVAILABLE', message: 'The venue is busy. Please try again.' };
      } else {
        createdOrder = { id: orderId, tableId, tableLabel: '1', status: 'PLACED', totalCents: 500,
          createdAt: new Date().toISOString(), note: postedPayload.note,
          items: [{ id: 'line-test', itemId, title: 'Tea', quantity: 1, unitPriceCents: 500, modifiers: [] }] };
        body = { order: createdOrder };
      }
    } else if (path === '/public/push/key') body = { enabled: false, publicKey: null };
    else if (path === '/public/events') body = { ok: true };
    else { unexpected.push(request.method() + ' ' + path); status = 500; body = { error: 'UNEXPECTED_MOCK_REQUEST' }; }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`${origin}/table/${tableId}?storeSlug=${store.slug}`);
  await page.getByRole('heading', { name: 'Menu unavailable', exact: true }).waitFor();
  assert.ok(bootstrapCalls >= 1);
  failBootstrap = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'Drinks', exact: true }).click();
  await page.getByRole('button', { name: /Tea/ }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: 'Mint', exact: true }).check();
  await dialog.getByRole('button', { name: /Add to cart/i }).click();
  await dialog.getByRole('alert').getByText('Check the number of selected options').waitFor();
  await dialog.getByRole('checkbox', { name: 'Apple', exact: true }).check();
  assert.equal(await dialog.getByRole('checkbox', { name: 'Lemon', exact: true }).isDisabled(), true);
  await dialog.getByRole('button', { name: /Add to cart/i }).click();
  await dialog.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: /Open cart/i }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Please bring two cups.');
  await dialog.getByText('Mint, Apple', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Close cart', exact: true }).last().click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Drinks', exact: true }).click();
  await page.getByRole('button', { name: /Open cart/i }).click();
  dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('textbox').inputValue(), 'Please bring two cups.');
  if (process.env.GUEST_SCREENSHOT_FILE) {
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role=dialog]')).every(element => getComputedStyle(element).opacity === '1'));
    await page.screenshot({ path: process.env.GUEST_SCREENSHOT_FILE, fullPage: true, animations: 'disabled' });
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Guest checkout should fit a mobile viewport');
  await dialog.getByRole('button', { name: 'Place order', exact: true }).evaluate(button => { button.click(); button.click(); });
  await firstOrderRequest;
  assert.equal(orderPosts, 1, 'Rapid clicks must produce exactly one order request');
  assert.equal(await dialog.getByRole('button', { name: 'Increase quantity', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('textbox').isDisabled(), true);
  assert.equal(requests.some(request => request.path === '/public/push/key'), false, 'Local ordering must not wait on push permission or cloud push');
  releaseFirstOrder();
  await dialog.getByRole('button', { name: 'Place order', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('The venue is busy. Please try again.', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('textbox').inputValue(), 'Please bring two cups.');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage')).state.items.length), 1);
  await dialog.getByRole('button', { name: 'Place order', exact: true }).click();
  await page.waitForURL(`**/order/${orderId}/thanks?**`);
  assert.equal(orderPosts, 2);
  assert.equal(postedPayload.note, 'Please bring two cups.');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage')).state.items.length), 0);

  nullTable = true;
  await page.goto(`${origin}/table/${tableId}?storeSlug=${store.slug}`);
  await page.getByRole('heading', { name: 'Menu unavailable', exact: true }).waitFor();
  await page.getByText('This table is unavailable. Please scan its QR code again or ask a member of staff.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log('Guest menu browser checks passed: error/retry, table validity, modifier bounds, note persistence, duplicate prevention, frozen checkout, draft recovery, local submit.');
} finally { await browser.close(); }
