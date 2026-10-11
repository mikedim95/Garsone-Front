// Synthetic API only: opening the QR pool must not require a venue's local Pi.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const origin = new URL(process.env.ARCHITECT_TEST_URL || 'http://127.0.0.1:18186').origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname));
const artifacts = process.env.ARCHITECT_ARTIFACTS || path.join(os.tmpdir(), 'garsone-architect-store-users');
const stores = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Habibi', slug: 'habibi', dataSource: 'PI', orderingMode: 'qr', printers: [] },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Noor', slug: 'noor', dataSource: 'ONLINE', orderingMode: 'hybrid', printers: [] },
];
const users = store => [{ id: `fixture-${store.slug}`, email: `${store.slug}@fixture.invalid`, displayName: `${store.name} manager`, role: 'MANAGER', createdAt: new Date().toISOString() }];
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const checks = [];
let currentPage;

async function settled(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function fixture() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(store => {
    localStorage.setItem('language', 'en');
    sessionStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'fixture-architect', role: 'architect', storeId: store.id, storeSlug: store.slug }, token: 'FIXTURE_ONLY' }, version: 0 }));
  }, stores[0]);
  const page = await context.newPage();
  currentPage = page;
  const state = { usersRequests: [], writes: [], errors: [], external: [], piUnavailable: true, holdNextUsers: false, pending: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { state.external.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    assert.equal(request.headers().authorization, 'Bearer FIXTURE_ONLY');
    const apiPath = url.pathname.replace(/^\/api/, '');
    if (request.method() !== 'GET') { state.writes.push(`${request.method()} ${apiPath}`); return route.abort(); }
    const json = data => route.fulfill({ json: data });
    const store = stores.find(item => item.id === apiPath.match(/^\/admin\/stores\/([^/]+)/)?.[1]);
    if (apiPath === '/admin/stores') return json({ stores });
    if (apiPath === '/admin/stores/overview') return json({ stores: stores.map(item => ({ ...item, usersCount: item.dataSource === 'PI' ? null : 1, tilesCount: 0, ordersCount: item.dataSource === 'PI' ? null : 0 })) });
    if (apiPath.endsWith('/users')) {
      state.usersRequests.push(store.id);
      if (state.holdNextUsers) {
        state.holdNextUsers = false;
        await new Promise(resolve => state.pending.push(async (status = 503, data = { error: 'LOCAL_PI_UNAVAILABLE' }) => {
          await route.fulfill({ status, json: data });
          resolve();
        }));
        return;
      }
      return store.dataSource === 'PI' && state.piUnavailable
        ? route.fulfill({ status: 503, json: { error: 'LOCAL_PI_UNAVAILABLE' } })
        : json({ users: users(store) });
    }
    if (apiPath.endsWith('/local-status')) return state.piUnavailable
      ? route.fulfill({ status: 503, json: { error: 'LOCAL_PI_UNAVAILABLE' } })
      : json({ source: 'PI', checkedAt: new Date().toISOString(), store, counts: { usersCount: 1, tilesCount: 0, ordersCount: 0 } });
    if (apiPath.endsWith('/printers/status')) return state.piUnavailable
      ? route.fulfill({ status: 503, json: { error: 'LOCAL_PI_UNAVAILABLE' } })
      : json({ localOnly: true, checkedAt: new Date().toISOString(), system: { uptimeSeconds: 100, database: { ok: true }, storage: { availableBytes: 1000000 } }, backup: {}, printing: { enabled: true, pendingCount: 0, jobs: [], printers: [] } });
    if (apiPath.endsWith('/qr-tiles')) return json({ tiles: [] });
    if (apiPath.endsWith('/tables')) return json({ tables: [] });
    if (apiPath.endsWith('/pending-nodes')) return json({ pendingNodes: [] });
    if (apiPath.endsWith('/nodes')) return json({ nodes: [] });
    if (apiPath.endsWith('/deployment')) return json({ deployment: { target: store?.dataSource || 'ONLINE', desiredState: 'RUNNING', status: 'RUNNING', localUrl: 'http://192.0.2.77:8080', version: 1, appliedVersion: 1, dataSyncVersion: 1, appliedDataSyncVersion: 1, frontendPort: 8080, corePort: 8787, channel: 'STABLE', services: {} }, recentEvents: [] });
    return json({});
  });
  await page.goto(origin + '/GarsoneAdmin');
  await page.getByRole('tab', { name: 'QR Pool', exact: true }).waitFor();
  await settled(page);
  return { page, context, state };
}
async function openUsers(page) {
  await page.getByRole('tab', { name: 'Per Store Setting', exact: true }).click();
  await page.getByRole('tab', { name: 'Store Settings', exact: true }).click();
}
async function selectStore(page, name) {
  await page.getByRole('combobox', { name: 'Select store', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
async function pendingUsers(page, state) {
  const deadline = Date.now() + 5000;
  while (!state.pending.length && Date.now() < deadline) await page.waitForTimeout(25);
  assert.equal(state.pending.length, 1, 'The synthetic users response is pending');
  return state.pending.shift();
}
async function noUsersError(page) {
  assert.equal(await page.getByText(/Unable to load .* users|Failed to load users/).count(), 0, 'No unrelated users error toast');
  assert.equal(await page.getByRole('alert').filter({ hasText: 'User actions are unavailable' }).count(), 0, 'No stale users error');
}
function safe(state) {
  assert.deepEqual(state.errors, [], 'No browser exceptions');
  assert.deepEqual(state.external, [], 'No external backend requests');
  assert.deepEqual(state.writes, [], 'No data mutations');
}

try {
  {
    const { page, context, state } = await fixture();
    assert.deepEqual(state.usersRequests, [], 'QR Pool does not fetch the default Pi venue users');
    await noUsersError(page);
    await page.getByRole('tab', { name: 'Per Store Setting', exact: true }).click();
    await page.getByRole('tab', { name: 'Store Overview', exact: true }).waitFor();
    await settled(page);
    assert.deepEqual(state.usersRequests, [], 'Store Overview does not fetch users');
    await noUsersError(page);
    await page.getByRole('tab', { name: 'Store Settings', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: "Habibi's local Pi is unavailable" }).filter({ hasText: 'User actions are unavailable' }).waitFor();
    assert.deepEqual(state.usersRequests, [stores[0].id]);
    assert.equal(await page.getByRole('button', { name: 'Add User', exact: true }).isDisabled(), true);
    assert.equal(await page.getByText('No store users yet.', { exact: true }).count(), 0, 'Unreachable Pi is not shown as an empty staff list');
    await selectStore(page, 'Noor');
    await page.getByText('Noor manager', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add User', exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole('row').filter({ hasText: 'Noor manager' }).getByRole('button', { name: 'Edit', exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole('alert').filter({ hasText: 'User actions are unavailable' }).count(), 0);
    assert.deepEqual(state.usersRequests, stores.map(store => store.id));
    safe(state);
    checks.push('QR Pool and overview avoid users reads; explicit Pi failure names Habibi; online Noor users and controls work');
    await context.close();
  }
  {
    const { page, context, state } = await fixture();
    state.piUnavailable = false;
    state.holdNextUsers = true;
    await openUsers(page);
    const releaseOld = await pendingUsers(page, state);
    await page.getByRole('tab', { name: 'QR Pool', exact: true }).click();
    await releaseOld();
    await settled(page);
    await noUsersError(page);
    assert.equal(await page.getByRole('tab', { name: 'QR Pool', exact: true }).getAttribute('aria-selected'), 'true');
    safe(state);
    checks.push('leaving Store Settings suppresses a late Pi users error and toast');
    await context.close();
  }
  {
    const { page, context, state } = await fixture();
    state.piUnavailable = false;
    state.holdNextUsers = true;
    await openUsers(page);
    const releaseOld = await pendingUsers(page, state);
    await page.getByRole('tab', { name: 'Store Overview', exact: true }).click();
    await page.getByRole('tab', { name: 'Store Settings', exact: true }).click();
    await page.getByText('Habibi manager', { exact: true }).waitFor();
    await releaseOld();
    await settled(page);
    await noUsersError(page);
    assert.equal(await page.getByText('Habibi manager', { exact: true }).count(), 1, 'Older failure cannot clear the newer users response');
    assert.equal(await page.getByRole('button', { name: 'Add User', exact: true }).isEnabled(), true);
    assert.equal(state.usersRequests.length, 2, 'Reopening settings refreshes users');
    safe(state);
    checks.push('reopening the same venue ignores a previous view request that finishes later');
    await context.close();
  }
  {
    const { page, context, state } = await fixture();
    state.piUnavailable = false;
    state.holdNextUsers = true;
    await openUsers(page);
    const releaseOld = await pendingUsers(page, state);
    await selectStore(page, 'Noor');
    await page.getByText('Noor manager', { exact: true }).waitFor();
    await releaseOld(200, { users: users(stores[0]) });
    await settled(page);
    await noUsersError(page);
    assert.equal(await page.getByText('Habibi manager', { exact: true }).count(), 0, 'Late response cannot show another venue staff');
    assert.equal(await page.getByText('Noor manager', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Add User', exact: true }).isEnabled(), true);
    safe(state);
    checks.push('switching venues ignores an older successful users response');
    await context.close();
  }
  console.log(`PASS ${checks.length} Architect store users scenarios`, JSON.stringify(checks));
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
