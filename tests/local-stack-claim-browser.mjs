// Claims only a synthetic pending node; every API request is intercepted locally.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin = new URL(process.env.QR_TEST_URL || 'http://127.0.0.1:18186').origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname));
const store = { id: '11111111-1111-4111-8111-111111111111', slug: 'claim-fixture', name: 'Claim fixture', printers: [] };
const pending = { id: 'pending-fixture', nodeKey: 'fixture-pi-key', displayName: 'Fixture Pi', status: 'PENDING', macAddresses: [], ipAddresses: [] };
const node = { id: 'node-fixture', storeId: store.id, slug: 'main', displayName: 'Fixture Pi', desiredConfigVersion: 1, lastAppliedVersion: 1,
  status: 'ONLINE', config: { lastConfigAck: { version: 1, status: 'ONLINE', message: 'Fixture configuration acknowledged' } } };
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  for (const outcome of ['adopted', 'preserved', 'not_applicable']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addInitScript(store => {
      localStorage.setItem('language', 'en');
      sessionStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'fixture', role: 'architect', storeId: store.id, storeSlug: store.slug }, token: 'FIXTURE_ONLY' }, version: 0 }));
    }, store);
    const page = await context.newPage();
    const errors = [], unexpected = [], writes = [];
    let claimed = false, deploymentReadsAfterClaim = 0, tileReadsAfterClaim = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/events/ws*', ws => ws.close());
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { unexpected.push(request.url()); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname.replace(/^\/api/, '');
      const json = data => route.fulfill({ status: 200, json: data });
      if (request.method() !== 'GET') {
        writes.push(`${request.method()} ${path}`);
        assert.equal(path, `/admin/pending-nodes/${pending.id}/claim`);
        assert.equal(request.postDataJSON().storeId, store.id);
        claimed = true;
        return json({ node, token: null, localDeployment: { status: outcome,
          message: outcome === 'preserved' ? 'Existing venue deployment was preserved. Review Venue Deployment before using this Pi.' : undefined } });
      }
      if (path === '/admin/stores' || path === '/admin/stores/overview') return json({ stores: [store] });
      if (path.endsWith('/qr-tiles')) { if (claimed) tileReadsAfterClaim++; return json({ tiles: [] }); }
      if (path.endsWith('/tables')) return json({ tables: [] });
      if (path.endsWith('/nodes')) return json({ nodes: claimed ? [node] : [] });
      if (path.endsWith('/users')) return json({ users: [] });
      if (path.endsWith('/pending-nodes')) return json({ pendingNodes: claimed ? [] : [pending] });
      if (path === '/billing/visits') return json({ currencyCode: 'EUR', visits: [], legacyOrders: [] });
      if (path.endsWith('/deployment')) {
        if (claimed) deploymentReadsAfterClaim++;
        const local = claimed && outcome === 'adopted';
        return json({ deployment: { target: local ? 'PI' : 'ONLINE', desiredState: local ? 'RUNNING' : 'STOPPED', status: local ? 'RUNNING' : 'ONLINE_ONLY',
          localUrl: local ? 'http://192.0.2.77:8085' : null, version: 0, appliedVersion: 0, dataSyncVersion: 0, appliedDataSyncVersion: 0,
          frontendPort: 8085, corePort: 8790, channel: 'STABLE', services: {} }, node: claimed ? node : null });
      }
      return json({});
    });
    await page.goto(origin + '/GarsoneAdmin');
    await page.getByRole('tab', { name: 'Per Store Setting', exact: true }).click();
    await page.getByRole('tab', { name: 'Store Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Associate to store', exact: true }).click();
    if (outcome === 'adopted') await page.getByText('Local Pi associated', { exact: true }).waitFor();
    else if (outcome === 'preserved') await page.getByText('Existing venue deployment was preserved. Review Venue Deployment before using this Pi.', { exact: true }).waitFor();
    else await page.getByText('Pi associated', { exact: true }).waitFor();
    await page.waitForTimeout(2600);
    assert(deploymentReadsAfterClaim > 0, 'Claim refreshes the visible deployment');
    assert(tileReadsAfterClaim > 0, 'Claim refreshes QR destinations');
    if (outcome === 'preserved') assert(await page.getByText('Existing venue deployment was preserved. Review Venue Deployment before using this Pi.', { exact: true }).isVisible(), 'A generic acknowledgement must not replace the preserved-deployment warning');
    await page.getByRole('tab', { name: 'Venue Deployment', exact: true }).click();
    if (outcome === 'adopted') await page.getByRole('link', { name: 'http://192.0.2.77:8085', exact: true }).waitFor();
    assert.deepEqual(writes, [`POST /admin/pending-nodes/${pending.id}/claim`]);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await context.close();
  }
  console.log('PASS local-stack claim adopted/preserved/classic outcomes, refreshed deployment and QR URLs; synthetic API only');
} finally { await browser.close(); }
