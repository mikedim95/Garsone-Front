// Run against a loopback Vite server built with VITE_LOCAL_ONLY=true and
// VITE_API_URL=/api. All backend data and printer actions are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = new URL(process.env.LOCAL_OPERATIONS_TEST_URL || 'http://127.0.0.1:18182').origin;
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Use a loopback fixture server');
const artifacts = path.resolve(process.env.LOCAL_OPERATIONS_ARTIFACTS || '../Garsone-Core/deploy/pi/full-stack/artifacts/local-operations');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const errors = [];
const checks = [];
const operationPath = '/api/manager/local-operations';
const fixture = () => ({
  localOnly: true, checkedAt: new Date().toISOString(),
  system: { uptimeSeconds: 92005, database: { ok: true }, storage: { availableBytes: 44 * 1024 ** 3 } },
  backup: { source: 'deployment', lastSuccessfulAt: null },
  printing: { enabled: true, lastError: null, pendingCount: 3,
    printers: [
      { id: 'rfcomm0', topics: ['noor/orders/placed/printer_1'], device: '/dev/rfcomm0', available: true, busy: false, lastError: null },
      { id: 'rfcomm1', topics: ['noor/orders/placed/printer_2'], device: '/dev/rfcomm1', available: false, busy: false, lastError: 'Device unavailable' },
    ],
    jobs: [
      { id: 'uncertain-1', topic: 'noor/orders/placed/printer_1', state: 'uncertain', createdAt: new Date().toISOString(), ticketNumber: 42, tableLabel: 'T4', error: `Printer write timeout: ${'a'.repeat(300)}` },
      { id: 'writing-1', topic: 'noor/orders/placed/printer_1', state: 'uncertain', busy: true, createdAt: new Date().toISOString(), ticketNumber: 43, tableLabel: 'T5' },
      { id: 'queued-1', topic: 'noor/orders/placed/printer_1', state: 'queued', createdAt: new Date().toISOString(), ticketNumber: 44, tableLabel: 'T6' },
      { id: 'done-1', topic: 'noor/orders/placed/printer_1', state: 'delivered', createdAt: new Date().toISOString(), ticketNumber: 41, tableLabel: 'T3' },
    ],
  },
});

async function createCase(viewport, language = 'en', role = 'manager') {
  const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
  await context.addInitScript(({ language, role }) => {
    localStorage.setItem('language', language);
    localStorage.setItem('STORE_SLUG', 'noor');
    if (role) sessionStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'manager-fixture', role, storeSlug: 'noor', email: 'manager@fixture.local' }, token: 'fixture-token' }, version: 0 }));
  }, { language, role });
  const state = { data: fixture(), posts: [], seen: new Set(), loseNextResponse: false, failReads: false, reads: 0 };
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === operationPath && request.method() === 'GET') {
      state.reads++;
      if (state.failReads) return route.abort('failed');
      return route.fulfill({ json: { ...state.data, checkedAt: new Date().toISOString() } });
    }
    if (pathname.startsWith(operationPath) && request.method() === 'POST') {
      assert.equal(request.headers().authorization, 'Bearer fixture-token', 'Operations request carries the signed-in credential');
      const body = request.postDataJSON();
      assert.match(body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      state.posts.push({ pathname, ...body });
      state.seen.add(body.requestId);
      if (state.loseNextResponse) {
        state.loseNextResponse = false;
        return route.abort('failed');
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { stores: [], store: { slug: 'noor', name: 'Noor' } } });
  });
  await page.goto(`${origin}/manager/operations`);
  if (role === 'manager') await page.getByTestId('print-job-uncertain-1').waitFor();
  return { page, context, state };
}

async function layout(page, label, screenshot = false) {
  const measurements = await page.evaluate(() => {
    const dialog = document.querySelector('[role="alertdialog"]');
    const rect = dialog?.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      dialog: rect ? { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, clientWidth: dialog.clientWidth, scrollWidth: dialog.scrollWidth } : null,
      overflowingHeadings: [...document.querySelectorAll('h1,h2,h3')].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.x < -1 || box.right > innerWidth + 1);
      }).map(element => element.textContent),
    };
  });
  assert(measurements.scrollWidth <= measurements.width + 1, `${label}: document overflow`);
  assert.deepEqual(measurements.overflowingHeadings, [], `${label}: heading overflow`);
  if (measurements.dialog) {
    const d = measurements.dialog;
    assert(d.x >= -1 && d.right <= measurements.width + 1 && d.y >= -1 && d.bottom <= measurements.height + 1, `${label}: dialog exceeds viewport`);
    assert(d.scrollWidth <= d.clientWidth + 1, `${label}: dialog content overflows horizontally`);
  }
  if (screenshot) await page.screenshot({ path: path.join(artifacts, `${label}.png`) });
  checks.push(label);
}

try {
  for (const view of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    for (const language of ['en', 'el']) {
      const { page, context } = await createCase(view, language);
      const label = `${view.width}x${view.height}-${language}`;
      await layout(page, `${label}-page`, true);
      assert.equal(await page.getByTestId('print-job-writing-1').getByRole('button').count(), 0, 'Writing tickets cannot be resolved');
      assert.equal(await page.getByTestId('local-printer-rfcomm1').getByRole('button').isDisabled(), true, 'Missing devices cannot be tested');
      const job = page.getByTestId('print-job-uncertain-1');
      await job.locator('summary').click();
      await layout(page, `${label}-long-error`);
      await job.getByRole('button', { name: language === 'el' ? 'Επανεκτύπωση' : 'Reprint', exact: true }).click();
      await layout(page, `${label}-dialog-opening`);
      await page.waitForTimeout(350);
      await layout(page, `${label}-dialog-open`, true);
      await page.getByRole('alertdialog').getByRole('button', { name: language === 'el' ? 'Ακύρωση' : 'Cancel', exact: true }).click();
      await page.waitForTimeout(350);
      await layout(page, `${label}-dialog-closed`);
      if (language === 'en') {
        assert(await page.getByText('No successful backup has been reported.').isVisible(), 'Missing backup is not displayed as healthy');
        await page.getByText('Recent activity').click();
        assert(await page.getByText('Sent to printer', { exact: true }).isVisible(), 'Delivery does not claim paper success');
      }
      await context.close();
    }
  }

  const { page, context, state } = await createCase({ width: 390, height: 844 });
  const openTest = async () => {
    await page.getByTestId('local-printer-rfcomm0').getByRole('button', { name: 'Test print', exact: true }).click();
    await page.getByRole('alertdialog').waitFor();
  };
  state.loseNextResponse = true;
  await openTest();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Test print', exact: true }).click();
  await page.getByText('No confirmation received.', { exact: false }).waitFor();
  assert.equal(state.posts.length, 1);
  const uncertainKey = state.posts[0].requestId;
  await page.reload();
  await page.getByTestId('local-printer-rfcomm0').waitFor();
  await openTest();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Test print', exact: true }).evaluate(button => { button.click(); button.click(); button.click(); });
  await page.getByText('Test queued.', { exact: false }).waitFor();
  assert.equal(state.posts.length, 2, 'Repeated taps submit only once');
  assert.equal(state.posts[1].requestId, uncertainKey, 'Reload after a lost response preserves the action key');
  assert.equal(state.seen.size, 1, 'A lost response does not create another printer test');
  await openTest();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Test print', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal(state.posts.length, 3);
  assert.notEqual(state.posts[2].requestId, uncertainKey, 'An acknowledged action permits an intentional new test');
  checks.push('lost-response-reload-idempotency-and-double-tap');

  state.failReads = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Cannot reach the venue.', { exact: false }).waitFor();
  assert.equal(await page.getByTestId('local-printer-rfcomm0').getByRole('button').isDisabled(), true, 'Stale status cannot trigger actions');
  assert(await page.getByText('Showing the last received status.').isVisible());
  state.failReads = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Cannot reach the venue.', { exact: false }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByTestId('local-printer-rfcomm0').getByRole('button').isEnabled(), true, 'Successful refresh restores actions');
  checks.push('connection-failure-and-recovery');

  state.data.printing.enabled = false;
  state.data.printing.printers = [];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Local printing is disabled.').waitFor();
  const uncertain = page.getByTestId('print-job-uncertain-1');
  assert.equal(await uncertain.getByRole('button', { name: 'Already printed', exact: true }).isEnabled(), true, 'Disabled printing still allows paper confirmation');
  assert.equal(await uncertain.getByRole('button', { name: 'Reprint', exact: true }).isDisabled(), true, 'Disabled printing does not allow reprints');
  checks.push('disabled-printing-preserves-pending-review');

  state.data.printing = { enabled: true, pendingCount: null, lastError: 'Print queue could not be read', jobs: [], printers: [] };
  state.data.system.database.ok = false;
  state.data.system.storage.availableBytes = null;
  state.data.backup = { source: 'unknown', lastSuccessfulAt: null, error: 'Backup status could not be read' };
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Print queue unavailable.', { exact: false }).waitFor();
  assert.equal(await page.getByText('No tickets waiting', { exact: true }).count(), 0, 'Unavailable queue must not claim no pending tickets');
  assert.equal(await page.getByText('No local printers configured.', { exact: true }).count(), 0, 'Unavailable printer status must not claim there are no configured printers');
  assert(await page.getByText('Not responding', { exact: true }).isVisible(), 'Failed database health remains visible');
  checks.push('unknown-queue-database-storage-and-backup');

  state.data = fixture();
  state.data.printing.pendingCount = 450;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Showing 3 of 450 pending tickets.', { exact: false }).waitFor();
  checks.push('capped-queue-honest-count');

  state.data.localOnly = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText("Local operations are available on the venue's Pi.").waitFor();
  assert.equal(await page.getByTestId('local-printer-rfcomm0').count(), 0, 'Cloud response cannot expose local action controls');
  checks.push('cloud-response-hidden');
  await context.close();

  for (const role of ['cook', 'waiter', 'hybrid', null]) {
    const denied = await createCase({ width: 390, height: 844 }, 'en', role);
    await denied.page.waitForURL('**/login');
    assert.equal(denied.state.reads, 0, `${role || 'Anonymous'} cannot query manager operations from this page`);
    assert.equal(denied.state.posts.length, 0);
    checks.push(`role-gate-${role || 'anonymous'}`);
    await denied.context.close();
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`Local operations: ${checks.length} checks passed; fixtures only.`);
} finally {
  await browser.close();
}
