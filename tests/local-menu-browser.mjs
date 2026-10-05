// Run with VITE_LOCAL_ONLY=true and VITE_API_URL=/api. All records are fixtures.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin = new URL(process.env.LOCAL_MENU_TEST_URL || 'http://127.0.0.1:18182').origin;
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const store = { id: '11111111-1111-4111-8111-111111111111', slug: 'menu-fixture', name: 'Local venue', settings: { printers: [] } };
const category = { id: '22222222-2222-4222-8222-222222222222', title: 'Coffee', titleEn: 'Coffee', titleEl: 'Coffee' };
let item = { id: '33333333-3333-4333-8333-333333333333', title: 'Fixture coffee', titleEn: 'Fixture coffee', titleEl: 'Fixture coffee',
  categoryId: category.id, category: category.title, priceCents: 220, isAvailable: true, imageUrl: '/offline-assets/coffee.jpg', printerTopic: 'kitchen' };
const writes = [], errors = [], external = [];
let failSave = false;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript(store => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('OFFLINE', '1'); // A stale demo flag must never swallow Pi writes.
    localStorage.setItem('STORE_SLUG', store.slug);
    sessionStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'fixture-manager', role: 'manager', storeId: store.id, storeSlug: store.slug }, token: 'FIXTURE_ONLY' }, version: 0 }));
  }, store);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (page.routeWebSocket) await page.routeWebSocket('**/events/ws*', ws => ws.close());
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.slice(4);
    let json = {};
    if (path === `/manager/items/${item.id}` && request.method() === 'PATCH') {
      assert.equal(request.headers().authorization, 'Bearer FIXTURE_ONLY');
      const body = request.postDataJSON();
      if (failSave) return route.fulfill({ status: 503, json: { error: 'Venue temporarily unavailable' } });
      writes.push(body); item = { ...item, ...body, title: body.titleEn || item.title };
      json = { item };
    } else if (path === '/manager/items') json = { items: [item] };
    else if (path.endsWith('/detail')) json = { item, links: [], modifiers: [] };
    else if (path === '/store') json = { store };
    else if (path === '/menu') json = { categories: [category], items: [item] };
    else if (path === '/manager/categories') json = { categories: [category] };
    else if (path === '/orders' || path === '/manager/orders') json = { orders: [] };
    else if (path.endsWith('/waiters')) json = { waiters: [] };
    else if (path.endsWith('/cooks')) json = { cooks: [] };
    else if (path.endsWith('/tables')) json = { tables: [] };
    else if (path.endsWith('/qr-tiles')) json = { tiles: [] };
    return route.fulfill({ json });
  });
  await page.goto(origin + '/manager');
  const expand = page.getByRole('button', { name: 'Expand navigation', exact: true });
  await expand.click();
  await page.getByRole('tab', { name: /^Menu/ }).first().click();
  const panel = page.locator('#manager-menu-panel');
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Price', { exact: true }).fill('3.75');
  await dialog.getByLabel('Description (EN)', { exact: true }).fill('Freshly ground');
  await dialog.getByLabel('Available', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: /Save/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].priceCents, 375);
  assert.equal(writes[0].isAvailable, false);
  assert.equal(writes[0].descriptionEn, 'Freshly ground');
  assert.equal(writes[0].imageUrl, '/offline-assets/coffee.jpg');
  assert.equal(Object.hasOwn(writes[0], 'printerTopic'), false, 'Unchanged legacy routing is preserved');
  await panel.getByLabel('Show disabled items', { exact: true }).check();
  await panel.getByRole('button', { name: 'Enable', exact: true }).click();
  await panel.getByRole('button', { name: 'Disable', exact: true }).waitFor();
  assert.equal(writes.at(-1).isAvailable, true);
  // Imported items without routing must also permit detail edits.
  item.printerTopic = null;
  await page.reload();
  await expand.click();
  await page.getByRole('tab', { name: /^Menu/ }).first().click();
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Price', { exact: true }).fill('4.10');
  failSave = true;
  await dialog.getByRole('button', { name: /Save/ }).click();
  await page.getByText('Save failed', { exact: true }).waitFor();
  assert(await dialog.isVisible());
  assert.equal(await dialog.getByLabel('Price', { exact: true }).inputValue(), '4.10');
  failSave = false;
  await dialog.getByRole('button', { name: /Save/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).priceCents, 410);
  assert.equal(Object.hasOwn(writes.at(-1), 'printerTopic'), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('PASS: Pi menu edits use the local API, preserve existing routing, toggle availability and retain drafts on failed saves');
} finally { await browser.close(); }
