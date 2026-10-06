// Synthetic cloud relay only: block every external request and never contact a Pi.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = new URL(process.env.ARCHITECT_TEST_URL || 'http://127.0.0.1:18186').origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname));
const artifacts = process.env.ARCHITECT_ARTIFACTS || 'browser-artifacts/architect-local-operations';
await fs.mkdir(artifacts, { recursive: true });
const stores = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Local Alpha', slug: 'local-alpha', dataSource: 'PI', orderingMode: 'qr', printers: [] },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Local Beta', slug: 'local-beta', dataSource: 'PI', orderingMode: 'qr', printers: [] },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Online Gamma', slug: 'online-gamma', dataSource: 'ONLINE', orderingMode: 'qr', printers: [] },
];
const printerStatus = () => ({ localOnly: true, checkedAt: new Date().toISOString(),
  system: { uptimeSeconds: 900, database: { ok: true }, storage: { availableBytes: 3000000000 } },
  backup: { source: 'deployment', lastSuccessfulAt: null },
  printing: { enabled: true, lastError: null, pendingCount: 2, jobs: [], printers: [
    { id: 'rfcomm0', topics: ['orders/placed/printer_1'], device: '/dev/rfcomm0', available: true, busy: false, lastError: null },
    { id: 'rfcomm1', topics: ['orders/placed/printer_2'], device: '/dev/rfcomm1', available: false, busy: false, lastError: null },
  ] },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const checks = [];
async function fixture(width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addInitScript(store => {
    localStorage.setItem('language', 'en');
    sessionStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'fixture-architect', role: 'architect', storeId: store.id, storeSlug: store.slug }, token: 'FIXTURE_ONLY' }, version: 0 }));
  }, stores[0]);
  const page = await context.newPage();
  const state = { writes: [], errors: [], unexpected: [], mutations: new Map(), losePrint: false, loseMutation: false, unavailable: false, stale: false, delivered: false,
    users: new Map(stores.map(store => [store.id, [{ id: `user-${store.slug}`, email: `${store.slug}@fixture.local`, displayName: `${store.name} manager`, role: 'MANAGER', createdAt: new Date().toISOString() }]])),
    modes: new Map(stores.map(store => [store.id, store.dataSource === 'PI' ? 'waiter' : 'qr'])) };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.routeWebSocket('**/events/ws*', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { state.unexpected.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    assert.equal(request.headers().authorization, 'Bearer FIXTURE_ONLY');
    const path = url.pathname.replace(/^\/api/, ''), json = data => route.fulfill({ json: data });
    const id = path.match(/^\/admin\/stores\/([^/]+)/)?.[1];
    const store = stores.find(item => item.id === id);
    if (request.method() !== 'GET') {
      const body = request.postData() ? request.postDataJSON() : {};
      const entry = { path, method: request.method(), body, requestId: request.headers()['x-request-id'] };
      state.writes.push(entry);
      if (path.endsWith('/printers/test')) {
        assert.match(body.requestId, uuid);
        assert.equal(body.printerId, 'rfcomm0');
        if (state.losePrint) { state.losePrint = false; return route.abort('failed'); }
        await new Promise(resolve => setTimeout(resolve, 120));
        return json({ jobId: 'test-fixture', replayed: false, state: 'queued' });
      }
      assert.match(entry.requestId, uuid);
      const previous = state.mutations.get(entry.requestId);
      if (previous) return previous.payload === JSON.stringify(body) ? json(previous.result) : route.fulfill({ status: 409, json: { error: 'REQUEST_ID_REUSED' } });
      if (path.includes('/users/') || path.endsWith('/users')) {
        const user = path.endsWith('/users') ? { id: 'created-user', ...body } : { ...state.users.get(id)[0], ...body };
        state.users.set(id, path.endsWith('/users') ? [...state.users.get(id), user] : [user]);
        state.mutations.set(entry.requestId, { payload: JSON.stringify(body), result: { user } });
        if (state.loseMutation) { state.loseMutation = false; return route.fulfill({ status: 504, json: { message: 'No response from local Pi', error: 'LOCAL_COMMAND_TIMEOUT' } }); }
        return json({ user });
      }
      if (path.endsWith('/ordering-mode')) { state.modes.set(id, body.orderingMode); return json({ store: { ...store, orderingMode: body.orderingMode } }); }
      state.unexpected.push(`${request.method()} ${path}`);
      return route.abort();
    }
    if (path === '/admin/stores') return json({ stores });
    if (path === '/admin/stores/overview') return json({ stores: stores.map(store => ({ ...store, usersCount: store.dataSource === 'PI' ? null : 7, tilesCount: 3, ordersCount: store.dataSource === 'PI' ? null : 70 })) });
    if (path.endsWith('/local-status') || path.endsWith('/printers/status') || path.endsWith('/users')) {
      if (state.unavailable) return route.fulfill({ status: 503, json: { message: 'Local Pi unavailable', error: 'LOCAL_PI_UNAVAILABLE' } });
      if (path.endsWith('/local-status')) return json({ source: 'PI', checkedAt: new Date().toISOString(), store: { ...store, id: 'different-local-db-id', orderingMode: state.modes.get(id) }, counts: { usersCount: 4, tilesCount: 20, ordersCount: 42 } });
      if (path.endsWith('/users')) return json({ users: state.users.get(id) || [] });
      const status = printerStatus();
      if (state.delivered) status.printing.jobs = [{ id: 'test-fixture', state: 'delivered', topic: 'orders/placed/printer_1', createdAt: new Date().toISOString() }];
      if (state.stale) status.checkedAt = new Date(Date.now() - 120000).toISOString();
      return json(status);
    }
    if (path.endsWith('/qr-tiles')) return json({ tiles: [] });
    if (path.endsWith('/tables')) return json({ tables: [] });
    if (path.endsWith('/pending-nodes')) return json({ pendingNodes: [] });
    if (path.endsWith('/nodes')) return json({ nodes: [{ id: 'node-fixture', storeId: id, slug: 'main', displayName: 'Fixture Pi', status: 'ONLINE', config: { printers: [{ id: 'printer_1', mac: 'AA:BB:CC:DD:EE:FF', topicSuffix: 'printer_1', type: 'bluetooth' }] } }] });
    if (path.endsWith('/deployment')) return json({ deployment: { target: store?.dataSource || 'ONLINE', desiredState: 'RUNNING', status: 'RUNNING', localUrl: 'http://192.0.2.77:8080', version: 1, appliedVersion: 1, dataSyncVersion: 1, appliedDataSyncVersion: 1, frontendPort: 8080, corePort: 8787, channel: 'STABLE', services: {} }, node: { id: 'node-fixture' } });
    if (path === '/billing/visits') return json({ currencyCode: 'EUR', visits: [], legacyOrders: [] });
    return json({});
  });
  await page.goto(origin + '/GarsoneAdmin');
  await settings(page);
  await page.getByTestId('architect-printer-rfcomm0').waitFor();
  return { page, context, state };
}
async function settings(page) {
  await page.getByRole('tab', { name: 'Per Store Setting', exact: true }).click();
  await page.getByRole('tab', { name: 'Store Settings', exact: true }).click();
}
async function testDialog(page) {
  await page.getByTestId('architect-printer-rfcomm0').getByRole('button', { name: 'Test print', exact: true }).click();
  return page.getByRole('alertdialog');
}
async function assertSafe(state) { assert.deepEqual(state.errors, []); assert.deepEqual(state.unexpected, []); }

try {
  for (const width of [320, 1280]) {
    const { page, context, state } = await fixture(width);
    await page.getByTestId('architect-local-source').getByText('Local Pi database', { exact: true }).waitFor();
    await page.getByRole('combobox').filter({ hasText: 'Browse-only' }).waitFor();
    assert.equal(await page.getByText('Declared printer interfaces', { exact: true }).count(), 0);
    assert.equal(await page.getByTestId('architect-printer-rfcomm1').getByRole('button').isDisabled(), true);
    assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width + 1, 'No horizontal page overflow');
    await page.screenshot({ path: `${artifacts}/printers-${width}.png` });
    state.losePrint = true;
    let dialog = await testDialog(page);
    await dialog.getByRole('button', { name: 'Test print', exact: true }).click();
    await dialog.getByText(/No confirmation received from the Pi/).waitFor();
    const first = state.writes.at(-1);
    await page.reload();
    await settings(page);
    dialog = await testDialog(page);
    await dialog.getByRole('button', { name: 'Test print', exact: true }).evaluate(button => { button.click(); button.click(); button.click(); });
    await page.getByText('Test queued on the Pi. Check the paper at the printer.', { exact: true }).waitFor();
    assert.equal(state.writes.length, 2, 'Rapid retry submits once');
    assert.equal(state.writes.at(-1).body.requestId, first.body.requestId, 'Reload retry reuses test UUID');
    state.delivered = true;
    await page.getByRole('button', { name: 'Refresh Pi printers', exact: true }).click();
    await page.getByText('Ticket sent to the printer. Check that it printed clearly.', { exact: true }).waitFor();
    state.delivered = false;
    await page.getByRole('combobox', { name: 'Select store', exact: true }).click();
    await page.getByRole('option', { name: 'Local Beta', exact: true }).click();
    await page.getByText('Local Beta manager', { exact: true }).waitFor();
    assert.equal(await page.getByText('Local Alpha manager', { exact: true }).count(), 0);
    dialog = await testDialog(page);
    await dialog.getByRole('button', { name: 'Test print', exact: true }).click();
    await page.getByText('Test queued on the Pi. Check the paper at the printer.', { exact: true }).waitFor();
    assert(state.writes.at(-1).path.includes(stores[1].id), 'Selection uses cloud venue identity, not local DB ID');
    assert.notEqual(state.writes.at(-1).body.requestId, first.body.requestId, 'Other venue gets another UUID');
    state.stale = true;
    await page.getByRole('button', { name: 'Refresh Pi printers', exact: true }).click();
    await page.getByText('This Pi status is out of date. Refresh before sending a test.', { exact: true }).waitFor();
    assert.equal(await page.getByTestId('architect-printer-rfcomm0').getByRole('button').isDisabled(), true);
    await assertSafe(state);
    checks.push(`local printer source, unavailable device, reload/double-click recovery, observed delivery, venue isolation, stale status, layout ${width}`);
    await context.close();
  }
  {
    const { page, context, state } = await fixture();
    const row = page.getByRole('row').filter({ hasText: 'Local Alpha manager' });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Floor staff').fill('Local manager changed');
    state.loseMutation = true;
    await dialog.getByRole('button', { name: 'Update user', exact: true }).click();
    await page.getByText(/The venue did not confirm this change/).first().waitFor();
    const first = state.writes.at(-1);
    assert(await dialog.isVisible(), 'Unknown outcome preserves the draft');
    await dialog.getByRole('button', { name: 'Update user', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.writes.at(-1).requestId, first.requestId, 'Unchanged user mutation reuses x-request-id');
    const keys = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('architect-mutation:')));
    assert(!keys.some(key => key.includes('Local manager changed') || key.includes('@fixture')), 'Stored operation identity contains no payload');
    state.unavailable = true;
    await page.getByRole('button', { name: 'Refresh local data', exact: true }).click();
    await page.getByTestId('architect-local-source').getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add User', exact: true }).isDisabled(), true);
    assert.equal(await page.getByText('Local manager changed', { exact: true }).count(), 0, 'Failed local user read clears stale rows');
    assert.equal(await page.getByRole('button', { name: 'Delete history', exact: true }).isDisabled(), true);
    await page.getByRole('tab', { name: 'Store Overview', exact: true }).click();
    assert(await page.getByText('Not reported', { exact: true }).count() >= 3, 'No cloud count fallback while Pi unavailable');
    await page.getByRole('combobox', { name: 'Select store', exact: true }).click();
    await page.getByRole('option', { name: 'Online Gamma', exact: true }).click();
    await page.getByRole('tab', { name: 'Store Settings', exact: true }).click();
    await page.getByText('Declared printer interfaces', { exact: true }).waitFor();
    assert.equal(await page.getByTestId('architect-local-source').count(), 0, 'Online venue keeps existing controls');
    await assertSafe(state);
    checks.push('local user mutation recovery, secret-free request identity, offline fail closed, unknown counts, online controls');
    await context.close();
  }
  {
    const { page, context, state } = await fixture();
    const fillUser = async () => {
      await page.getByRole('button', { name: 'Add User', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByPlaceholder('staff@example.com').fill('new@fixture.local');
      await dialog.getByPlaceholder('Floor staff').fill('New local staff');
      await dialog.getByPlaceholder('Required').fill('fixture-secret-Only123');
      return dialog;
    };
    let dialog = await fillUser();
    state.loseMutation = true;
    await dialog.getByRole('button', { name: 'Create user', exact: true }).click();
    await page.getByText(/The venue did not confirm this change/).first().waitFor();
    const first = state.writes.at(-1);
    const persisted = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('architect-mutation:')));
    assert.deepEqual(persisted, [[`architect-mutation:fixture-architect:POST:/admin/stores/${stores[0].id}/users`, first.requestId]], 'Only nonsecret operation scope and random UUID are stored');
    await page.reload();
    await settings(page);
    dialog = await fillUser();
    await dialog.getByRole('button', { name: 'Create user', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.writes.at(-1).requestId, first.requestId, 'Password mutation retry survives reload without storing its payload');
    assert.equal(state.users.get(stores[0].id).length, 2, 'Retry recovers one created user');
    // A changed draft after reload must be rejected before a new deliberate submit.
    await page.getByRole('row').filter({ hasText: 'Local Alpha manager' }).getByRole('button', { name: 'Edit', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Floor staff').fill('First interrupted name');
    state.loseMutation = true;
    await dialog.getByRole('button', { name: 'Update user', exact: true }).click();
    await page.getByText(/The venue did not confirm this change/).first().waitFor();
    const interrupted = state.writes.at(-1);
    await page.reload();
    await settings(page);
    await page.getByRole('row').filter({ hasText: 'First interrupted name' }).getByRole('button', { name: 'Edit', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Floor staff').fill('Changed after reload');
    await dialog.getByRole('button', { name: 'Update user', exact: true }).click();
    await page.getByText(/These details differ from an interrupted request/).first().waitFor();
    assert.equal(state.writes.at(-1).requestId, interrupted.requestId);
    assert.equal(state.users.get(stores[0].id)[0].displayName, 'First interrupted name');
    await dialog.getByRole('button', { name: 'Update user', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.notEqual(state.writes.at(-1).requestId, interrupted.requestId);
    assert.equal(state.users.get(stores[0].id)[0].displayName, 'Changed after reload');
    await assertSafe(state);
    checks.push('password mutation reload recovery stores UUID only; changed intent requires explicit new submit');
    await context.close();
  }
  console.log(`PASS ${checks.length} Architect local operations scenarios`, JSON.stringify(checks));
} finally { await browser.close(); }
