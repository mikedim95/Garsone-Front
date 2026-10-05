// Observe actual painted frames, including reopening after the mobile exit animation.
// Synthetic menu only: no requests reach a venue or create real orders.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { mobileFixture, mobileStore, mobileTableId, installMobileFixture } from './fixtures/mobile-menu.mjs';

const origin = new URL(process.env.CART_TEST_URL || 'http://127.0.0.1:18182').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Use a loopback fixture server');
const artifacts = 'browser-artifacts/cart-opening';
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const report = { cases: [], errors: [], unexpectedRequests: [] };

async function openingFrames(page, button) {
  await page.evaluate(() => {
    window.cartOpeningFrames = [];
    let first;
    const sample = now => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        first ??= now;
        const box = element => {
          const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
          return { x, y, width, height, bottom, right };
        };
        window.cartOpeningFrames.push({
          dialog: box(dialog), opacity: Number(getComputedStyle(dialog).opacity),
          footer: box(dialog.querySelector('[data-testid="cart-checkout-footer"]')),
        });
      }
      if (first === undefined || now - first < 400) requestAnimationFrame(sample);
      else window.cartOpeningDone = true;
    };
    window.cartOpeningDone = false;
    requestAnimationFrame(sample);
  });
  await button.click();
  await page.waitForFunction(() => window.cartOpeningDone);
  return page.evaluate(() => window.cartOpeningFrames);
}

try {
  for (const view of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'small-phone', width: 320, height: 568 },
    { name: 'landscape', width: 844, height: 390 },
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'reduced-motion', width: 390, height: 844, reducedMotion: 'reduce' },
  ]) {
    const fixture = mobileFixture();
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height },
      hasTouch: view.width < 1000, reducedMotion: view.reducedMotion || 'no-preference' });
    await context.addInitScript(({ cart, cartContext }) => {
      localStorage.setItem('language', 'en');
      localStorage.setItem('OFFLINE', 'false');
      localStorage.setItem('cart-storage', JSON.stringify({ state: { items: cart }, version: 0 }));
      localStorage.setItem('cart-table-context', cartContext);
    }, { cart: fixture.cart, cartContext: `${mobileStore.slug}:${mobileTableId}` });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await installMobileFixture(page, origin, fixture, report.unexpectedRequests);
    try {
      await page.goto(`${origin}/table/${mobileTableId}?storeSlug=${mobileStore.slug}`);
      await page.getByRole('button', { name: fixture.categories[0].title, exact: true }).click();
      const button = page.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).first();
      for (let opening = 0; opening < 3; opening++) {
        const frames = await openingFrames(page, button);
        report.cases.push({ view: view.name, opening, frames });
        assert.ok(frames.length >= 2, `${view.name}: opening was not sampled`);
        const settled = frames.at(-1).dialog;
        for (const frame of frames) {
          assert.equal(frame.opacity, 1, `${view.name}: cart flashes transparent on opening ${opening}`);
          for (const dimension of ['x', 'y', 'width', 'height']) {
            assert.ok(Math.abs(frame.dialog[dimension] - settled[dimension]) <= 1,
              `${view.name}: cart ${dimension} jumps on opening ${opening}`);
          }
          assert.ok(frame.footer.bottom <= view.height + 1 && frame.footer.y >= 0,
            `${view.name}: checkout footer is clipped during opening ${opening}`);
        }
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Place order', exact: true }).waitFor();
        if (view.width < 1280 && opening === 1) {
          await page.getByTestId('cart-drag-handle').click();
        } else if (view.width < 1280 && opening === 2) {
          const handle = await page.getByTestId('cart-drag-handle').boundingBox();
          const x = handle.x + handle.width / 2;
          const y = handle.y + handle.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x, Math.min(view.height - 10, y + 170), { steps: 10 });
          await page.mouse.up();
        } else await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
      }
      await context.close();
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/${view.name}-failure.png` });
      throw error;
    }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpectedRequests, []);
  console.log('Cart opening: 15 first-open/reopen checks passed, including phone, landscape, desktop, reduced motion and drag-to-close');
} finally {
  await browser.close();
  await fs.writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
}
