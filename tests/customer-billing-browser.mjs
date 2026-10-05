// Guest visit privacy/lifecycle tests against synthetic API fixtures only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { customerVisitFixture, installMobileFixture, mobileFixture, mobileTableId, mobileVisitId, mobileVisitToken, mobileStore } from './fixtures/mobile-menu.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.BILLING_TEST_URL || 'http://127.0.0.1:18182';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local fixture server');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const visitKey = `garsone:customer-visit:${mobileStore.slug}:${mobileTableId}`;
const destination = '11111111-1111-4111-8111-222222222222';

async function setup(language = 'en') {
  const fixture = mobileFixture(language);
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await context.addInitScript(language => {
    localStorage.setItem('language', language); localStorage.setItem('OFFLINE', 'false');
    Object.defineProperty(navigator, 'onLine', { get: () => false });
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
  }, language);
  const page = await context.newPage();
  const errors = [], unexpected = [], requests = [], sockets = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => sockets.push(socket.url()));
  await installMobileFixture(page, origin, fixture, unexpected);
  let snapshot = customerVisitFixture(fixture), closed = false, joins = 0, dropBill = true, visitReads = 0, pendingOutcome = null;
  const orderAttempts = [];
  const pendingKey = `garsone:order-submission:${mobileStore.slug}:${mobileTableId}`;
  // Two rounds, with one partial payment, and realistic long item titles.
  snapshot.items = snapshot.items.map((item, index) => ({ ...item, orderId: index > 3 ? 'round-two' : item.orderId }));
  snapshot.orderCount = 2;
  snapshot.paidCents = 250; snapshot.outstandingCents -= 250;
  snapshot.items[0].paidCents = 250; snapshot.items[0].outstandingCents -= 250;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url()), path = url.pathname.replace(/^\/api/, '');
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.startsWith('/orders/submissions/') && pendingOutcome) {
      assert.equal(request.headers()['x-table-visit'], mobileVisitToken);
      if (closed) return json(410, { error: 'VISIT_CLOSED' });
      if (pendingOutcome === 'late-commit' && orderAttempts.length) return json(200, { order: { ...fixture.order, tableId: destination, diningVisitId: mobileVisitId }, replayed: true });
      return json(404, { error: 'ORDER_SUBMISSION_NOT_FOUND' });
    }
    if (path === '/orders' && request.method() === 'POST' && pendingOutcome) {
      orderAttempts.push(request.postDataJSON());
      return json(409, { error: 'VISIT_MOVED' });
    }
    if (path === `/public/table/${mobileTableId}/visit` || path === `/public/table/${destination}/visit`) {
      joins++;
      assert.equal(request.method(), 'POST');
      assert.equal(request.headers()['x-table-visit'], undefined, 'new joins never reuse an ended capability');
      if (closed) {
        closed = false;
        snapshot = { ...snapshot, id: '66666666-6666-4666-8666-777777777777', status: 'OPEN', billRequestedAt: null, items: [], orders: [], totalCents: 0, paidCents: 0, outstandingCents: 0 };
      }
      return json(200, { visit: snapshot, visitToken: mobileVisitToken });
    }
    if (path.startsWith('/public/visits/')) {
      visitReads++;
      assert.equal(request.headers()['x-table-visit'], mobileVisitToken, 'private visit reads require the stored capability');
      if (closed) return json(410, { error: 'VISIT_CLOSED' });
      if (path.endsWith('/bill-request')) {
        requests.push(request.postDataJSON());
        if (dropBill) { dropBill = false; return route.abort('connectionreset'); }
        snapshot = { ...snapshot, revision: snapshot.revision + 1, status: 'BILL_REQUESTED', billRequestedAt: new Date().toISOString() };
      }
      return json(200, { visit: snapshot });
    }
    if (/^\/public\/table\/[^/]+\/orders$/.test(path)) {
      assert.equal(request.headers()['x-table-visit'], mobileVisitToken, 'table history cannot load without the visit capability');
      if (closed) return json(410, { error: 'VISIT_CLOSED' });
      return json(200, { orders: snapshot.orders });
    }
    if (path === '/public/menu-bootstrap' && url.searchParams.get('tableCode') === destination) {
      return json(200, { ...fixture.bootstrap, table: { id: destination, label: 'Transferred table' } });
    }
    return route.fallback();
  });
  await page.goto(`${origin}/table/${mobileTableId}?storeSlug=${mobileStore.slug}`);
  await page.waitForFunction(key => Boolean(localStorage.getItem(key)), visitKey);
  return { page, context, fixture, errors, unexpected, requests, sockets, orderAttempts, pendingKey,
    preparePending: async outcome => {
      pendingOutcome = outcome;
      const pending = { version: 1, storeSlug: mobileStore.slug, createdAt: new Date().toISOString(), cart: [fixture.cart[0]],
        payload: { tableId: mobileTableId, visit: mobileVisitToken, submissionId: '77777777-7777-4777-8777-777777777777',
          items: [{ itemId: fixture.cart[0].item.id, quantity: fixture.cart[0].quantity, modifiers: '{}' }] } };
      await page.evaluate(async ({ pendingKey, pending }) => {
        localStorage.setItem(pendingKey, JSON.stringify(pending));
        const { useCartStore } = await import('/src/store/cartStore.ts');
        useCartStore.getState().setItems(pending.cart);
      }, { pendingKey, pending });
    },
    joins: () => joins, reads: () => visitReads, close: () => { closed = true; }, transfer: () => { snapshot = { ...snapshot, revision: snapshot.revision + 1, tableId: destination, tableLabel: 'Transferred table' }; },
    snapshot: () => snapshot };
}

async function assertLayout(page) {
  const layout = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="customer-bill"]');
    const box = dialog.getBoundingClientRect();
    const buttons = [...dialog.querySelectorAll('button')].filter(button => button.getBoundingClientRect().height > 0).map(button => {
      const rect = button.getBoundingClientRect(); return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom };
    });
    return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1, buttons,
      contentsFit: dialog.scrollWidth <= dialog.clientWidth + 1 };
  });
  assert.equal(layout.overflow, false); assert.equal(layout.contentsFit, true);
  assert.ok(layout.x >= -1 && layout.right <= layout.width + 1 && layout.y >= -1 && layout.bottom <= layout.height + 1);
  for (const button of layout.buttons) assert.ok(button.x >= -1 && button.right <= layout.width + 1 && button.y >= -1 && button.bottom <= layout.height + 1);
}

try {
  for (const language of ['en', 'el']) {
    const test = await setup(language);
    await test.page.getByRole('button', { name: language === 'el' ? 'Ο λογαριασμός σας' : 'Your bill', exact: true }).click();
    const dialog = test.page.getByTestId('customer-bill');
    await dialog.getByTestId('customer-bill-due').waitFor();
    assert.equal(await dialog.getByTestId('customer-bill-due').innerText(), new Intl.NumberFormat(language === 'el' ? 'el-GR' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(test.snapshot().outstandingCents / 100));
    await assertLayout(test.page);
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await test.page.setViewportSize(viewport);
      await test.page.waitForTimeout(100);
      await assertLayout(test.page);
    }
    await test.page.setViewportSize({ width: 320, height: 568 });
    await test.page.waitForTimeout(100);
    const billButton = dialog.getByRole('button', { name: language === 'el' ? 'Ζητήστε λογαριασμό' : 'Request bill', exact: true });
    await billButton.click();
    await billButton.waitFor({ state: 'visible' });
    await test.page.waitForTimeout(200);
    await billButton.click();
    await dialog.getByRole('button', { name: language === 'el' ? 'Το προσωπικό ειδοποιήθηκε' : 'Staff notified', exact: true }).waitFor();
    assert.equal(test.requests.length, 2); assert.deepEqual(test.requests[1], test.requests[0]);
    assert.match(test.requests[0].requestId, /^[a-f0-9-]{36}$/);
    await assertLayout(test.page);
    // Closing a party's visit hides private lines and cannot autojoin the next party on refresh/reload.
    await test.preparePending('closed');
    test.close();
    await test.page.evaluate(() => dispatchEvent(new Event('focus')));
    await dialog.getByRole('button', { name: language === 'el' ? 'Νέα επίσκεψη' : 'Start a new visit', exact: true }).waitFor();
    assert.equal(await dialog.locator('[data-testid="customer-bill-lines"]').count(), 0);
    assert.equal(test.joins(), 1);
    assert.equal(await test.page.evaluate(key => localStorage.getItem(key), test.pendingKey), null, 'a trusted closed visit retires only its own pending order');
    await test.page.reload();
    const start = test.page.getByRole('button', { name: language === 'el' ? 'Νέα επίσκεψη' : 'Start a new visit', exact: true });
    await start.waitFor();
    await test.page.evaluate(() => { dispatchEvent(new Event('online')); dispatchEvent(new Event('focus')); });
    await test.page.waitForTimeout(400);
    assert.equal(test.joins(), 1, 'old capability must not autojoin the next party');
    assert.equal(await test.page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, visitKey), 'ended');
    await start.click();
    await test.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).visitId.endsWith('777777777777'), visitKey);
    assert.equal(test.joins(), 2, 'explicit new visit should join once');
    assert.deepEqual(test.errors, []); assert.deepEqual(test.unexpected, []);
    await test.context.close();
  }
  const moved = await setup();
  const originalRecord = await moved.page.evaluate(key => JSON.parse(localStorage.getItem(key)), visitKey);
  moved.transfer();
  await moved.page.evaluate(() => dispatchEvent(new Event('focus')));
  await moved.page.waitForURL(`**/table/${destination}?*`);
  assert.equal(moved.joins(), 1, 'a transfer retains the existing party, never joins the destination separately');
  const transferred = await moved.page.evaluate(key => JSON.parse(localStorage.getItem(key)), `garsone:customer-visit:${mobileStore.slug}:${destination}`);
  assert.equal(transferred.token, originalRecord.token); assert.equal(transferred.visitId, mobileVisitId);
  assert.deepEqual(moved.errors, []); assert.deepEqual(moved.unexpected, []);
  await moved.context.close();
  for (const outcome of ['not-committed', 'late-commit']) {
    const pending = await setup();
    await pending.preparePending(outcome);
    pending.transfer();
    await pending.page.evaluate(() => dispatchEvent(new Event('focus')));
    await pending.page.waitForURL(`**/table/${destination}?*`);
    await pending.page.getByRole('button', { name: 'Retry saved order', exact: true }).click();
    await pending.page.waitForFunction(key => localStorage.getItem(key) === null, pending.pendingKey);
    assert.equal(pending.orderAttempts.length, 1);
    assert.equal(pending.orderAttempts[0].tableId, mobileTableId, 'a transfer never rewrites a durable business payload');
    assert.equal(pending.orderAttempts[0].visit, mobileVisitToken);
    assert.equal(pending.joins(), 1);
    const cartItems = await pending.page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage')).state.items);
    assert.deepEqual(cartItems, outcome === 'not-committed' ? [pending.fixture.cart[0]] : [], 'a post-transfer lookup decides whether the original draft was accepted');
    assert.deepEqual(pending.errors, []); assert.deepEqual(pending.unexpected, []);
    await pending.context.close();
  }
  console.log('PASS: English/Greek small-phone bills, multiple rounds/partial totals, durable bill request retry, closed-visit privacy, explicit new visit and capability-preserving transfer');
} finally { await browser.close(); }
