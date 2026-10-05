// Financial interaction tests use an isolated browser fixture only. Never points
// at production and never records a real payment, moves a real table, or prints.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = new URL(process.env.STAFF_BILLING_TEST_URL || 'http://127.0.0.1:18182').origin;
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Use a local fixture server');
const artifacts = path.resolve(process.env.STAFF_BILLING_ARTIFACTS || '../Garsone-Core/deploy/pi/full-stack/artifacts/staff-billing');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const visitId = id(1), tableId = id(4), teaId = id(11), waterId = id(12);
const timestamp = new Date().toISOString();
const copy = {
  en: { table: 'Table T4', pay: 'Record payment', close: 'Close table', method: 'Card terminal', split: 'Selected items', add: 'Add one', cancel: 'Cancel' },
  el: { table: 'Τραπέζι T4', pay: 'Καταχώριση πληρωμής', close: 'Κλείσιμο τραπεζιού', method: 'Τερματικό κάρτας', split: 'Επιλεγμένα προϊόντα', add: 'Προσθήκη ενός', cancel: 'Ακύρωση' },
};
function fixtureVisit() {
  return { id: visitId, tableId, tableLabel: 'T4', status: 'BILL_REQUESTED', revision: 1, currencyCode: 'EUR', openedAt: timestamp, closedAt: null, billRequestedAt: timestamp,
    totalCents: 2100, paidCents: 200, outstandingCents: 1900, orderCount: 2,
    orders: [{ id: id(21), status: 'SERVED', diningVisitId: visitId }, { id: id(22), status: 'SERVED', diningVisitId: visitId }],
    items: [
      { orderItemId: teaId, orderId: id(21), title: 'Mint tea with a long descriptive product name · Τσάι μέντας με επιλεγμένα αρώματα', quantity: 3, unitPriceCents: 500, totalCents: 1500, paidCents: 200, outstandingCents: 1300, remainingQuantity: 3 },
      { orderItemId: waterId, orderId: id(22), title: 'Sparkling water', quantity: 2, unitPriceCents: 300, totalCents: 600, paidCents: 0, outstandingCents: 600, remainingQuantity: 2 },
    ],
    payments: [{ id: id(31), requestId: id(32), amountCents: 200, method: 'CASH', recordedAt: timestamp, allocations: [{ orderItemId: teaId, amountCents: 200 }] }],
  };
}
const errors = [];
const checks = [];
async function setup(viewport = { width: 390, height: 844 }, language = 'en', role = 'waiter', selected = true, theme = 'dark') {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ language, role, theme }) => {
    localStorage.setItem('language', language);
    localStorage.setItem('theme', theme);
    localStorage.setItem('STORE_SLUG', 'noor');
    sessionStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'staff-fixture', storeSlug: 'noor', role, email: 'staff@fixture.local' }, token: 'fixture-token' }, version: 0 }));
  }, { language, role, theme });
  const state = { visit: fixtureVisit(), posts: [], payments: new Map(), loseBeforeCommit: false, loseResponse: false, hideReceipts: false, conflictNext: false, readFailure: false, reads: 0, transfers: 0, closes: 0, adopts: 0,
    legacy: [{ id: id(60), tableId: id(9), tableLabel: 'T9', status: 'SERVED', totalCents: 500, createdAt: timestamp, paidAt: null, paymentStatus: 'PENDING' },
      { id: id(61), tableId: id(9), tableLabel: 'T9', status: 'PAID', totalCents: 700, createdAt: timestamp, paidAt: timestamp, paymentStatus: 'COMPLETED' }] };
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.routeWebSocket('**/events/ws*', () => {});
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = (value, status = 200) => route.fulfill({ status, json: value });
    if (pathname === '/api/billing/visits' && request.method() === 'GET') {
      state.reads++;
      if (state.readFailure) return route.abort('failed');
      const other = { ...fixtureVisit(), id: id(2), tableId: id(8), tableLabel: 'T8', status: 'OPEN' };
      const visits = [state.visit, other].filter(visit => (url.searchParams.get('status') === 'closed') === (visit.status === 'CLOSED'));
      return json({ currencyCode: 'EUR', visits, legacyOrders: state.legacy });
    }
    if (pathname === `/api/billing/visits/${visitId}` && request.method() === 'GET') {
      if (state.readFailure) return route.abort('failed');
      return json({ visit: state.visit });
    }
    if (pathname.startsWith('/api/billing/payments/') && request.method() === 'GET') {
      if (state.hideReceipts) return route.abort('failed');
      const payment = state.payments.get(pathname.split('/').at(-1));
      return payment ? json({ payment, visit: state.visit }) : json({ error: 'PAYMENT_NOT_FOUND' }, 404);
    }
    if (pathname === '/api/tables') return json({ tables: [4, 5, 8, 9].map(n => ({ id: id(n), label: `T${n}`, active: true })) });
    // Managers retain their dashboard around the same billing panel.
    if (pathname === '/api/store') return json({ store: { id: id(90), slug: 'noor', name: 'Noor', settings: { printers: [] } } });
    if (pathname === '/api/orders' || pathname === '/api/manager/orders') return json({ orders: [] });
    if (pathname === '/api/waiter-tables') return json({ assignments: [], waiters: [], tables: [] });
    if (pathname === '/api/manager/cooks') return json({ cooks: [] });
    if (pathname === '/api/manager/tables') return json({ tables: [] });
    if (pathname === '/api/manager/items') return json({ items: [] });
    if (pathname === '/api/manager/categories') return json({ categories: [] });
    if (pathname === '/api/manager/modifiers') return json({ modifiers: [] });
    if (pathname.endsWith('/qr-tiles')) return json({ tiles: [] });
    if (pathname === '/api/manager/billing/summary') return json({ currencyCode: 'EUR', salesCents: 2100, collectedCents: 200, outstandingCents: 1900, legacyPaidCents: 0, paymentCount: 1, cashCents: 200, cardCents: 0, asOf: timestamp });
    if (pathname === `/api/billing/visits/${visitId}/payments` && request.method() === 'POST') {
      assert.equal(request.headers().authorization, 'Bearer fixture-token');
      const body = request.postDataJSON();
      state.posts.push(body);
      if (state.loseBeforeCommit) { state.loseBeforeCommit = false; return route.abort('failed'); }
      assert.match(body.requestId, /^[0-9a-f-]{36}$/);
      const replay = state.payments.get(body.requestId);
      if (replay) return json({ payment: replay, visit: state.visit, replayed: true });
      if (state.conflictNext) { state.conflictNext = false; state.visit.revision++; return json({ error: 'BILL_CHANGED' }, 409); }
      if (body.expectedRevision !== state.visit.revision) return json({ error: 'BILL_CHANGED' }, 409);
      const amountCents = body.amountCents ?? body.items.reduce((sum, selected) => { const item = state.visit.items.find(item => item.orderItemId === selected.orderItemId); return sum + Math.min(selected.quantity * item.unitPriceCents, item.outstandingCents); }, 0);
      if (amountCents > state.visit.outstandingCents) return json({ error: 'PAYMENT_EXCEEDS_BALANCE' }, 409);
      const allocations = [];
      let remaining = amountCents;
      for (const item of state.visit.items) {
        const selected = body.items?.find(value => value.orderItemId === item.orderItemId);
        const allocated = body.items ? selected ? Math.min(selected.quantity * item.unitPriceCents, item.outstandingCents) : 0 : Math.min(remaining, item.outstandingCents);
        if (!allocated) continue;
        item.paidCents += allocated; item.outstandingCents -= allocated; item.remainingQuantity = Math.ceil(item.outstandingCents / item.unitPriceCents); remaining -= allocated;
        allocations.push({ orderItemId: item.orderItemId, amountCents: allocated });
      }
      const payment = { id: body.requestId, requestId: body.requestId, amountCents, method: body.method, recordedAt: timestamp, allocations };
      state.payments.set(body.requestId, payment); state.visit.payments.push(payment); state.visit.paidCents += amountCents; state.visit.outstandingCents -= amountCents; state.visit.revision++;
      if (state.loseResponse) { state.loseResponse = false; return route.abort('failed'); }
      await new Promise(resolve => setTimeout(resolve, 150));
      return json({ payment, visit: state.visit, replayed: false }, 201);
    }
    if (pathname === `/api/billing/visits/${visitId}/transfer`) {
      const body = request.postDataJSON(); state.transfers++;
      assert.equal(body.expectedRevision, state.visit.revision);
      assert.equal(body.tableId, id(5), 'Only the empty table should be selectable');
      state.visit.tableId = id(5); state.visit.tableLabel = 'T5'; state.visit.revision++;
      return json({ visit: state.visit });
    }
    if (pathname === `/api/billing/visits/${visitId}/close`) {
      state.closes++;
      assert.equal(state.visit.outstandingCents, 0);
      state.visit.status = 'CLOSED'; state.visit.closedAt = timestamp; state.visit.revision++;
      return json({ visit: state.visit });
    }
    if (pathname === '/api/billing/visits' && request.method() === 'POST') return json({ visit: state.visit });
    if (pathname === `/api/billing/visits/${visitId}/adopt`) {
      const body = request.postDataJSON(); state.adopts++;
      assert.deepEqual(body.orderIds, [id(60)], 'A historical paid order cannot be adopted');
      state.legacy = state.legacy.filter(order => !body.orderIds.includes(order.id)); state.visit.revision++;
      return json({ visit: state.visit });
    }
    return json({ stores: [], store: { slug: 'noor', name: 'Noor' } });
  });
  await page.goto(`${origin}/staff/bills${selected ? `?visitId=${visitId}` : ''}`);
  if (['manager', 'architect', 'waiter', 'hybrid'].includes(role)) await page.getByTestId(selected ? 'bill-outstanding' : `bill-table-${tableId}`).waitFor();
  return { page, context, state };
}
async function layout(page, label, screenshot = false) {
  const measurement = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const rect = dialog?.getBoundingClientRect();
    const actions = document.querySelector('[data-testid="bill-payment-actions"]');
    const body = document.querySelector('[data-testid="bill-payment-scroll"]');
    const bounds = element => { const rect = element?.getBoundingClientRect(); return rect ? { y: rect.y, bottom: rect.bottom, x: rect.x, right: rect.right } : null; };
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      actions: bounds(actions), body: bounds(body), actionButtons: actions ? [...actions.querySelectorAll('button')].map(bounds) : [],
      dialog: rect ? { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, width: dialog.clientWidth, scrollWidth: dialog.scrollWidth } : null,
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.x < -1 || box.right > innerWidth + 1); }).map(element => element.textContent) };
  });
  assert(measurement.scrollWidth <= measurement.width + 1, `${label}: page overflow`);
  assert.deepEqual(measurement.headings, [], `${label}: heading overflow`);
  if (measurement.dialog) {
    const d = measurement.dialog;
    assert(d.x >= -1 && d.right <= measurement.width + 1 && d.y >= -1 && d.bottom <= measurement.height + 1, `${label}: dialog exceeds viewport`);
    assert(d.scrollWidth <= d.width + 1, `${label}: dialog content overflow`);
  }
  if (measurement.actions) {
    assert(measurement.actions.y >= measurement.body.bottom - 1, `${label}: fixed footer overlaps scrolling payment fields`);
    for (const button of measurement.actionButtons) assert(button.y >= -1 && button.bottom <= measurement.height + 1 && button.x >= -1 && button.right <= measurement.width + 1, `${label}: payment footer action not fully visible`);
  }
  if (screenshot) await page.screenshot({ path: path.join(artifacts, `${label}.png`) });
  checks.push(label);
}
async function openPayment(page, language = 'en') {
  await page.getByRole('button', { name: copy[language].pay, exact: true }).click();
  await page.getByRole('dialog').waitFor();
}
async function managerTab(page, name) {
  const tab = page.locator(`[role="tab"][id$="-trigger-${name}"]:visible`);
  const expand = page.getByRole('button', { name: 'Expand navigation', exact: true });
  if (await expand.isVisible()) await expand.click();
  await tab.waitFor();
  if (page.viewportSize().width >= 640) await page.waitForFunction(() =>
    document.querySelector('[aria-controls="manager-desktop-navigation"]')?.closest('aside')?.getBoundingClientRect().width >= 223);
  return tab;
}
async function assertManagerBill(page, selectedVisit, label) {
  await page.waitForURL(url => url.pathname === '/manager' && url.searchParams.get('tab') === 'bills' && url.searchParams.get('visitId') === selectedVisit)
    .catch(error => { throw new Error(`${label}: expected embedded bill ${selectedVisit || 'list'}, received ${page.url()}`, { cause: error }); });
  assert.equal(await page.locator('header').count(), 1, `${label}: the bill must share the Manager header`);
  assert.equal(await page.locator('h1').count(), 1, `${label}: no second standalone dashboard title`);
  const billsTab = await managerTab(page, 'bills');
  await page.waitForFunction(() => [...document.querySelectorAll('[role="tab"][id$="-trigger-bills"]')].some(tab => tab.getAttribute('aria-selected') === 'true'));
  assert.equal(await billsTab.getAttribute('aria-selected'), 'true', `${label}: Bills remains the selected Manager tab`);
  // Close the desktop rail after inspecting it so it does not cover bill actions.
  const collapse = page.getByRole('button', { name: 'Collapse navigation', exact: true });
  if (await collapse.isVisible()) {
    await collapse.click();
    await page.locator('#manager-desktop-navigation').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('[aria-controls="manager-desktop-navigation"]')?.closest('aside')?.getBoundingClientRect().width <= 49);
  }
}

try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    for (const language of ['en', 'el']) {
      const { page, context } = await setup(viewport, language);
      const label = `${viewport.width}x${viewport.height}-${language}`;
      await layout(page, `${label}-bill`, true);
      assert.equal(await page.getByRole('button', { name: copy[language].close, exact: true }).isDisabled(), true, 'Unpaid visits cannot close');
      await openPayment(page, language);
      await layout(page, `${label}-payment-opening`);
      await page.getByRole('dialog').getByRole('button', { name: copy[language].method, exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: copy[language].split, exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: `${copy[language].add}: Sparkling water`, exact: true }).click();
      await page.waitForTimeout(350);
      await layout(page, `${label}-split-open`, true);
      await page.getByRole('dialog').getByRole('button', { name: copy[language].cancel, exact: true }).click();
      await page.waitForTimeout(350);
      await layout(page, `${label}-payment-closed`);
      await context.close();
    }
  }

  // Manager bills use the existing phone navigation / desktop rail in both languages.
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
    for (const language of ['en', 'el']) {
      const theme = language === 'en' ? 'dark' : 'light';
      const manager = await setup(viewport, language, 'manager', true, theme);
      const { page } = manager;
      const label = `manager-${viewport.width}-${language}`;
      await assertManagerBill(page, visitId, `${label}: legacy link`);
      assert(await page.locator(`html.${theme}`).count(), `${label}: Manager preserves the selected color mode`);
      const colors = await page.getByTestId('bill-outstanding').evaluate(element => ({
        bill: getComputedStyle(element).getPropertyValue('--background').trim(),
        dashboard: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
      }));
      assert.equal(colors.bill, colors.dashboard, 'Embedded bills inherit the dashboard colors');
      const balance = await page.getByTestId('bill-outstanding').innerText();
      await layout(page, `${label}-embedded-bill`, true);
      await openPayment(page, language);
      await layout(page, `${label}-embedded-payment`, true);
      await page.getByRole('dialog').getByRole('button', { name: copy[language].cancel, exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: language === 'el' ? 'Όλα τα τραπέζια' : 'All tables', exact: true }).click();
      await assertManagerBill(page, null, `${label}: all tables`);
      await page.getByTestId(`bill-table-${tableId}`).click();
      await assertManagerBill(page, visitId, `${label}: choose table`);
      assert.equal(await page.getByTestId('bill-outstanding').innerText(), balance, 'Navigation preserves the bill balance');
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: language === 'el' ? 'Λογαριασμοί τραπεζιών' : 'Table bills', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await assertManagerBill(page, visitId, `${label}: burger action closes even on current tab`);

      const ordersTab = await managerTab(page, 'orders');
      if (viewport.width >= 640 && language === 'en') {
        await ordersTab.focus();
        assert.equal(new URL(page.url()).searchParams.get('tab'), 'bills', 'Focusing a tab must not create navigation history');
        await ordersTab.press('Enter');
      } else await ordersTab.click();
      await page.waitForURL(url => url.pathname === '/manager' && url.searchParams.get('tab') === 'orders');
      await page.goBack();
      await assertManagerBill(page, visitId, `${label}: browser back`);
      await page.goForward();
      await page.waitForURL(url => url.pathname === '/manager' && url.searchParams.get('tab') === 'orders');
      const billsTab = await managerTab(page, 'bills');
      if (viewport.width >= 640 && language === 'el') {
        await billsTab.focus();
        assert.equal(new URL(page.url()).searchParams.get('tab'), 'orders', 'Focus alone keeps the selected Manager tab');
        await billsTab.press('Space');
      } else await billsTab.click();
      await assertManagerBill(page, null, `${label}: return to Bills starts with all tables`);
      await page.getByTestId(`bill-table-${tableId}`).click();
      await assertManagerBill(page, visitId, `${label}: reselect after changing tabs`);
      await page.reload();
      await page.getByTestId('bill-outstanding').waitFor();
      await assertManagerBill(page, visitId, `${label}: reload`);
      assert.equal(await page.getByTestId('bill-outstanding').innerText(), balance);
      await page.goto(`${origin}/staff/bills?tableId=${tableId}`);
      await assertManagerBill(page, visitId, `${label}: legacy table link resolves in Bills tab`);
      assert.equal(manager.state.posts.length, 0, 'Navigation and cancelled dialogs never record payments');
      checks.push(`${label}-legacy-link-selection-navigation-history-and-reload`);
      await manager.context.close();
    }
  }
  console.log('Manager bills: phone/desktop, English/Greek, embedded navigation, history, reload and payment layout passed.');

  const split = await setup();
  await openPayment(split.page);
  await split.page.getByRole('dialog').getByRole('button', { name: 'Selected items', exact: true }).click();
  const teaAdd = split.page.getByRole('dialog').getByRole('button', { name: /^Add one: Mint tea/ });
  await teaAdd.click(); await teaAdd.click(); await teaAdd.click();
  const record = split.page.getByRole('dialog').getByRole('button', { name: /^Record received payment/ });
  assert.match(await record.innerText(), /13[.,]00/);
  await record.evaluate(button => { button.click(); button.click(); button.click(); });
  await split.page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(split.state.posts.length, 1, 'Rapid payment taps result in one request');
  assert.deepEqual(split.state.posts[0].items, [{ orderItemId: teaId, quantity: 3 }]);
  assert.equal(split.state.visit.outstandingCents, 600, 'Partially paid selected line charged remaining cents only');
  checks.push('item-split-existing-partial-payment-and-double-tap');
  await split.context.close();

  const uncertain = await setup({ width: 390, height: 844 }, 'en', 'manager');
  await assertManagerBill(uncertain.page, visitId, 'Manager pending-payment entry');
  uncertain.state.loseResponse = true; uncertain.state.hideReceipts = true;
  await openPayment(uncertain.page);
  await uncertain.page.getByRole('dialog').getByRole('button', { name: 'Amount', exact: true }).click();
  await uncertain.page.getByLabel('Amount received', { exact: true }).fill('7,25');
  await uncertain.page.getByRole('dialog').getByRole('button', { name: /^Record received payment/ }).click();
  await uncertain.page.getByText('Payment confirmation pending', { exact: true }).waitFor();
  assert.equal(uncertain.state.posts.length, 1);
  assert.equal(await uncertain.page.getByRole('button', { name: 'Record payment', exact: true }).isDisabled(), true);
  const pendingBefore = await uncertain.page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('billing-payment:'))?.[1]);
  assert(pendingBefore, 'Unknown payment retained for recovery');
  uncertain.state.hideReceipts = false;
  await uncertain.page.reload();
  await uncertain.page.getByText('The payment has been recorded on this bill.', { exact: true }).waitFor();
  await assertManagerBill(uncertain.page, visitId, 'Manager pending-payment recovery');
  assert.equal(uncertain.state.posts.length, 1, 'Reload reconciliation never posts a second payment');
  assert.equal(uncertain.state.visit.outstandingCents, 1175);
  assert.equal(await uncertain.page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('billing-payment:')).length), 0);
  checks.push('manager-lost-payment-response-reload-read-only-reconciliation');
  await uncertain.context.close();

  const retry = await setup();
  retry.state.loseBeforeCommit = true;
  await openPayment(retry.page);
  await retry.page.getByRole('dialog').getByRole('button', { name: 'Amount', exact: true }).click();
  await retry.page.getByLabel('Amount received', { exact: true }).fill('5.25');
  await retry.page.getByRole('dialog').getByRole('button', { name: /^Record received payment/ }).click();
  await retry.page.getByRole('button', { name: 'Retry this payment', exact: true }).waitFor();
  assert.equal(retry.state.payments.size, 0);
  assert.equal(await retry.page.getByRole('button', { name: 'Record payment', exact: true }).isDisabled(), true);
  await retry.page.getByRole('button', { name: 'Retry this payment', exact: true }).click();
  await retry.page.getByText('The payment has been recorded on this bill.', { exact: true }).waitFor();
  assert.equal(retry.state.posts.length, 2);
  assert.deepEqual(retry.state.posts[1], retry.state.posts[0], 'Unknown uncommitted payment retry preserves exact key and payload');
  assert.equal(retry.state.payments.size, 1);
  assert.equal(retry.state.visit.outstandingCents, 1375);
  checks.push('unknown-uncommitted-payment-exact-retry');
  await retry.context.close();

  const conflict = await setup();
  conflict.state.conflictNext = true;
  await openPayment(conflict.page);
  await conflict.page.getByRole('dialog').getByRole('button', { name: /^Record received payment/ }).click();
  await conflict.page.getByRole('dialog').getByText('This bill changed.', { exact: false }).waitFor();
  assert.equal(conflict.state.payments.size, 0);
  assert.equal(await conflict.page.getByRole('dialog').getByRole('button', { name: /^Record received payment/ }).isDisabled(), true);
  assert.equal(await conflict.page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('billing-payment:')).length), 0, 'Definitively rejected unrecorded payment is not left uncertain');
  checks.push('concurrent-staff-revision-conflict');
  await conflict.context.close();

  const transfer = await setup({ width: 390, height: 844 }, 'en', 'manager');
  await transfer.page.getByRole('button', { name: 'Move table', exact: true }).click();
  await transfer.page.getByLabel('Destination table').selectOption(id(5));
  const destinations = await transfer.page.getByLabel('Destination table').locator('option').allTextContents();
  assert.deepEqual(destinations, ['Destination table', 'Table T5'], 'Active and unassigned-unpaid tables are excluded');
  await transfer.page.getByRole('dialog').getByRole('button', { name: 'Move visit', exact: true }).click();
  await transfer.page.getByText('Visit moved', { exact: true }).waitFor();
  await assertManagerBill(transfer.page, visitId, 'Manager transfer preserves Bills tab');
  assert.equal(transfer.state.transfers, 1);
  assert.equal(transfer.state.visit.payments.length, 1, 'Moving table preserves earlier collections');
  await openPayment(transfer.page);
  await transfer.page.getByRole('dialog').getByRole('button', { name: 'Card terminal', exact: true }).click();
  assert(await transfer.page.getByText('Record money already received.', { exact: false }).isVisible());
  await transfer.page.getByRole('dialog').getByRole('button', { name: /^Record received payment/ }).click();
  await transfer.page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(transfer.state.posts[0].method, 'CARD');
  assert.equal(transfer.state.visit.outstandingCents, 0);
  await transfer.page.getByRole('button', { name: 'Close table', exact: true }).click();
  await transfer.page.getByRole('dialog').getByRole('button', { name: 'Close table', exact: true }).click();
  await transfer.page.getByText('Table closed', { exact: true }).waitFor();
  await assertManagerBill(transfer.page, visitId, 'Manager settlement preserves Bills tab');
  assert.equal(transfer.state.closes, 1);
  assert.equal(await transfer.page.getByRole('button', { name: 'Record payment', exact: true }).count(), 0);
  checks.push('manager-empty-table-transfer-external-card-recording-and-settled-close');
  await transfer.context.close();

  const legacy = await setup({ width: 390, height: 844 }, 'en', 'manager', false);
  await legacy.page.getByText('Earlier orders', { exact: true }).click();
  await legacy.page.getByRole('button', { name: /^Add to current bill/ }).click();
  assert.equal(await legacy.page.getByRole('dialog').getByRole('checkbox').count(), 1, 'Historical paid orders are not offered for adoption');
  const adopt = legacy.page.getByRole('dialog').getByRole('button', { name: 'Add to current bill', exact: true });
  assert.equal(await adopt.isDisabled(), true, 'Earlier orders require explicit selection');
  await legacy.page.getByRole('dialog').getByRole('checkbox').check();
  await adopt.click();
  await legacy.page.getByText('Earlier orders added', { exact: true }).waitFor();
  await assertManagerBill(legacy.page, visitId, 'Manager adoption preserves Bills tab');
  assert.equal(legacy.state.adopts, 1);
  checks.push('explicit-legacy-unpaid-adoption');
  await legacy.context.close();

  const blocked = await setup();
  await blocked.page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('billing-payment:')) throw new DOMException('Blocked', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await openPayment(blocked.page);
  await blocked.page.getByRole('dialog').getByRole('button', { name: /^Record received payment/ }).click();
  await blocked.page.getByRole('dialog').getByText('This browser cannot save payment recovery details.', { exact: false }).waitFor();
  assert.equal(blocked.state.posts.length, 0, 'Do not submit without durable browser recovery data');
  checks.push('blocked-browser-storage-prevents-financial-write');
  await blocked.context.close();

  const denied = await setup({ width: 390, height: 844 }, 'en', 'cook');
  await denied.page.waitForURL('**/login');
  assert.equal(denied.state.reads, 0, 'Cook cannot read billing');
  checks.push('cook-role-blocked');
  await denied.context.close();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`Staff billing: ${checks.length} checks passed; synthetic payments only.`);
} finally { await browser.close(); }
