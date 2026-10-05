// Synthetic local manager data: distinguish collections from served/sales value.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = new URL(process.env.BILLING_TEST_URL || 'http://127.0.0.1:18182').origin;
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const artifacts = path.resolve(process.env.BILLING_REPORT_ARTIFACTS || '../Garsone-Core/deploy/pi/full-stack/artifacts/billing-report');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const errors = [], checks = [];
const summary = { currencyCode: 'EUR', salesCents: 12800, collectedCents: 4700, outstandingCents: 8100, cashCents: 1700, cardCents: 3000,
  paymentCount: 3, legacyPaidCents: 1900, asOf: new Date().toISOString() };
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    for (const language of ['en', 'el']) {
      const context = await browser.newContext({ viewport, timezoneId: 'Europe/Athens' });
      await context.addInitScript(language => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        localStorage.setItem('language', language);
        localStorage.setItem('STORE_SLUG', 'noor');
        localStorage.setItem('MANAGER_ECON_RANGE', 'today');
        sessionStorage.setItem('auth-storage', JSON.stringify({ state: { user: { id: 'manager-fixture', role: 'manager', storeSlug: 'noor', email: 'manager@fixture.local' }, token: 'fixture-token' }, version: 0 }));
      }, language);
      const page = await context.newPage();
      let failed = false;
      page.on('pageerror', error => errors.push(String(error)));
      await page.route('**/api/**', async route => {
        const request = route.request();
        assert.equal(request.method(), 'GET', 'Finance report is read-only');
        const url = new URL(request.url());
        if (url.pathname === '/api/manager/billing/summary') {
          assert.equal(request.headers().authorization, 'Bearer fixture-token');
          const from = new Date(url.searchParams.get('from'));
          const to = new Date(url.searchParams.get('to'));
          assert(to > from);
          assert(to.getTime() - from.getTime() >= 23 * 3600_000);
          if (failed === 'currency') return route.fulfill({ status: 409, json: { error: 'MIXED_BILLING_CURRENCIES' } });
          if (failed) return route.fulfill({ status: 503, json: { error: 'SESSION_SERVICE_UNAVAILABLE' } });
          return route.fulfill({ json: summary });
        }
        return route.fulfill({ json: { orders: [], items: [], categories: [], modifiers: [], tables: [], waiters: [], cooks: [], assignments: [], qrTiles: [], tiles: [],
          store: { id: 'store-fixture', slug: 'noor', name: 'Noor', settingsJson: {} } } });
      });
      await page.goto(`${origin}/manager`);
      await page.getByTestId('billing-collected').filter({ hasText: '47' }).waitFor();
      assert.match(await page.getByTestId('billing-sales').innerText(), /128/);
      assert.match(await page.getByTestId('billing-outstanding').innerText(), /81/);
      assert.match(await page.getByTestId('billing-legacy').innerText(), /19/);
      const report = page.getByTestId('billing-report');
      await report.scrollIntoViewIfNeeded();
      const layout = await report.evaluate(element => ({
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        overflowing: [...element.querySelectorAll('p,h3,strong,button')].filter(child => child.getBoundingClientRect().width && child.scrollWidth > child.clientWidth + 2).map(child => child.textContent),
        badCopy: /\?{3,}/.test(element.textContent),
      }));
      assert(layout.documentOverflow <= 1, 'Manager view must not overflow on small phones');
      assert.deepEqual(layout.overflowing, []);
      assert.equal(layout.badCopy, false);
      const label = `${viewport.width}x${viewport.height}-${language}`;
      await page.screenshot({ path: path.join(artifacts, `${label}.png`) });
      checks.push(label);
      if (language === 'en' && viewport.width === 390) {
        failed = true;
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.getByTestId('billing-report').getByRole('alert').waitFor({ timeout: 20_000 });
        assert.match(await page.getByTestId('billing-collected').innerText(), /47/, 'Failed refresh never replaces recorded money with a fake zero');
        failed = false;
        await report.getByRole('button', { name: 'Retry', exact: true }).click();
        await page.getByTestId('billing-report').getByRole('alert').waitFor({ state: 'hidden' });
        checks.push('stale-report-retains-last-values-and-recovers');
        failed = 'currency';
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await report.getByRole('alert').filter({ hasText: 'different currencies' }).waitFor({ timeout: 20_000 });
        assert.equal(await page.getByTestId('billing-collected').innerText(), '—', 'Never display a combined total when currencies differ');
        failed = false;
        await report.getByRole('button', { name: 'Retry', exact: true }).click();
        await report.getByRole('alert').waitFor({ state: 'hidden' });
        assert.match(await page.getByTestId('billing-collected').innerText(), /47/);
        checks.push('mixed-currency-values-are-not-added-together');
      }
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS: ${checks.length} billing report cases, authoritative collections, local WAN-offline flag and mobile/Greek layouts`);
} finally { await browser.close(); }
