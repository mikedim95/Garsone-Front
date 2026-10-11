// Synthetic API only: no customer orders, printer messages, or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const origin = new URL(process.env.COOK_TEST_URL || 'http://127.0.0.1:18186').origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname));
const artifacts = process.env.COOK_ARTIFACTS || path.join(os.tmpdir(), 'garsone-cook-cancel');
const store = { id: '11111111-1111-4111-8111-111111111111', slug: 'fixture-noor', name: 'Fixture Noor', orderingMode: 'hybrid' };
const original = {
  id: '22222222-2222-4222-8222-222222222222', tableId: '33333333-3333-4333-8333-333333333333', tableLabel: 'T1',
  status: 'PLACED', paymentStatus: 'PENDING', totalCents: 350, createdAt: new Date().toISOString(),
  items: [{ id: '44444444-4444-4444-8444-444444444444', itemId: '55555555-5555-4555-8555-555555555555', title: 'Fixture coffee', quantity: 1, unitPriceCents: 350, printerTopic: 'printer_1', status: 'PLACED', modifiers: [] }],
};
const copy = {
  en: { cancel: 'Cancel', failed: 'Update failed', cancelled: 'Cancelled', network: 'Could not confirm cancellation. Refresh the orders and check the order status before trying again.', payment: 'This order has recorded payments and cannot be cancelled.', closed: 'This table visit is closed. Refresh the orders to see the current status.' },
  el: { cancel: 'Άκυρο', failed: 'Αποτυχία ενημέρωσης', cancelled: 'Ακυρωμένες', network: 'Δεν επιβεβαιώθηκε η ακύρωση. Ανανεώστε τις παραγγελίες και ελέγξτε την κατάσταση πριν δοκιμάσετε ξανά.', payment: 'Η παραγγελία έχει καταχωρημένες πληρωμές και δεν μπορεί να ακυρωθεί.', closed: 'Η επίσκεψη στο τραπέζι έχει κλείσει. Ανανεώστε τις παραγγελίες για να δείτε την τρέχουσα κατάσταση.' },
};
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
let currentPage;

async function fixture(language) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ language, store }) => {
    localStorage.setItem('language', language);
    localStorage.setItem('OFFLINE', 'false');
    localStorage.setItem('COOK_VIEW_MODE', 'classic');
    sessionStorage.setItem('STORE_SLUG', store.slug);
    sessionStorage.setItem('auth-storage', JSON.stringify({ state: { token: 'FIXTURE_ONLY', user: { id: 'fixture-cook', role: 'cook', storeId: store.id, storeSlug: store.slug, printerTopic: 'printer_1' } }, version: 0 }));
  }, { language, store });
  const page = await context.newPage();
  currentPage = page;
  const state = { errors: [], unexpected: [], patches: [], pending: [], order: { ...original } };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { state.unexpected.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const apiPath = url.pathname.replace(/^\/api/, '');
    assert.equal(request.headers().authorization, 'Bearer FIXTURE_ONLY');
    if (request.method() === 'PATCH' && apiPath === `/orders/${original.id}/status`) {
      assert.equal(request.headers()['x-store-slug'], store.slug);
      assert.deepEqual(request.postDataJSON(), { status: 'CANCELLED' });
      state.patches.push(request.postDataJSON());
      await new Promise(resolve => state.pending.push(async result => {
        if (result === 'network') await route.abort('connectionreset');
        else if (result === 'payment') await route.fulfill({ status: 409, json: { error: 'PAYMENT_RECORDED_ORDER_LOCKED' } });
        else if (result === 'closed') await route.fulfill({ status: 410, json: { error: 'VISIT_CLOSED' } });
        else { state.order = { ...state.order, status: 'CANCELLED' }; await route.fulfill({ json: { order: state.order } }); }
        resolve();
      }));
      return;
    }
    if (apiPath === '/staff/push/diagnostics') return route.fulfill({ json: { ok: true } });
    if (request.method() !== 'GET') { state.unexpected.push(`${request.method()} ${apiPath}`); return route.abort(); }
    if (apiPath === '/store') return route.fulfill({ json: { store } });
    if (apiPath === '/orders') return route.fulfill({ json: { orders: [state.order] } });
    if (apiPath === '/staff/push/key') return route.fulfill({ json: { enabled: false, publicKey: null } });
    state.unexpected.push(`${request.method()} ${apiPath}`);
    return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
  });
  await page.goto(origin + '/cook');
  await page.getByRole('button', { name: copy[language].cancel, exact: true }).waitFor();
  return { page, context, state };
}
const localOrder = page => page.evaluate(id => JSON.parse(localStorage.getItem('cook-orders-storage')).state.orders.find(order => order.id === id), original.id);
async function cancel(page, state, language, result) {
  const button = page.getByRole('button', { name: copy[language].cancel, exact: true });
  const previousCount = state.patches.length;
  await button.click();
  const deadline = Date.now() + 5000;
  while (!state.pending.length && Date.now() < deadline) await page.waitForTimeout(25);
  assert.equal(state.pending.length, 1, 'Cancellation has one pending request');
  assert.equal(await button.isDisabled(), true, 'Disable cancellation while waiting');
  assert.equal(state.patches.length, previousCount + 1);
  await state.pending.shift()(result);
}

try {
  for (const language of ['en', 'el']) {
    const { page, context, state } = await fixture(language);
    for (const result of ['network', 'payment', 'closed']) {
      await cancel(page, state, language, result);
      await page.getByText(copy[language][result], { exact: true }).waitFor();
      assert.equal(await page.getByText(copy[language].failed, { exact: true }).count(), 1);
      assert.equal((await localOrder(page)).status, 'PLACED', 'Rejected or unknown cancellation must preserve the displayed order');
      assert.equal(await page.getByRole('button', { name: copy[language].cancel, exact: true }).isEnabled(), true, 'Failure restores the action');
      assert.deepEqual(state.errors, [], 'Failure is handled without an unhandled rejection');
    }
    await cancel(page, state, language, 'success');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('cook-orders-storage')).state.orders.find(order => order.id === id)?.status === 'CANCELLED', original.id);
    assert.equal(await page.getByRole('button', { name: copy[language].cancel, exact: true }).count(), 0, 'Successful cancellation removes active order actions');
    assert.equal(state.patches.length, 4, 'Only explicit cancellation clicks submit requests');
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.unexpected, [], 'No external or unexpected mutation requests');
    await context.close();
  }
  console.log('PASS: Cook cancellation network failure, payment lock, closed visit, successful retry and action recovery in English and Greek');
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await fs.mkdir(artifacts, { recursive: true });
    await currentPage.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(artifacts, 'failure.txt'), await currentPage.locator('body').innerText()).catch(() => {});
    console.error(`Failure artifacts: ${artifacts}`);
  }
  throw error;
} finally {
  await browser.close();
}
