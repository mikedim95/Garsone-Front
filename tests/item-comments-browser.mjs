// Synthetic customer orders only. Exercise comments through the UI and a lost-response retry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { mobileFixture, mobileStore, mobileTableId, installMobileFixture } from './fixtures/mobile-menu.mjs';

const origin = new URL(process.env.ITEM_COMMENTS_TEST_URL || 'http://127.0.0.1:18182').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Use a loopback fixture server');
const artifacts = 'browser-artifacts/item-comments';
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const pendingKey = `garsone:order-submission:${mobileStore.slug}:${mobileTableId}`;
const report = { cases: [], errors: [], unexpectedRequests: [] };
const draft = page => page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage')).state.items);
const journal = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), pendingKey);
const cartButton = page => page.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).first();

async function openItem(page, item) {
  await page.locator('.menu-item-card').filter({ has: page.getByRole('heading', { name: item.title, exact: true }) }).getByRole('button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Comments (optional)', exact: true }).waitFor();
  assert.equal(await dialog.getByTestId('item-comment').evaluate(element => element === document.activeElement), false,
    'Opening an item must not force the phone keyboard open for an optional comment');
  return dialog;
}
async function addItem(dialog) {
  await dialog.getByRole('button', { name: /^Add to cart$/i }).click();
  await dialog.waitFor({ state: 'hidden' });
}

try {
  for (const view of [
    { name: 'phone', width: 390, height: 844, isMobile: true },
    { name: 'desktop', width: 1440, height: 900, isMobile: false },
  ]) {
    const fixture = mobileFixture();
    fixture.items = [fixture.items[0], fixture.items[1], fixture.items[7]].map((item, index) => ({
      ...item, title: ['House coffee', 'Garden salad', 'Custom toast'][index],
      titleEn: ['House coffee', 'Garden salad', 'Custom toast'][index],
      name: ['House coffee', 'Garden salad', 'Custom toast'][index],
    }));
    fixture.items[2].modifiers = [{ id: 'toast-extra', name: 'Choose an extra', required: true, minSelect: 1, maxSelect: 1,
      options: [{ id: 'extra-cheese', label: 'Cheese', priceDeltaCents: 50 }] }];
    fixture.bootstrap.menu.items = fixture.items;
    fixture.bootstrap.menu.categories = [fixture.categories[0]];
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.isMobile });
    await context.addInitScript(({ tableContext }) => {
      localStorage.setItem('language', 'en');
      localStorage.setItem('OFFLINE', 'false');
      // Leave persisted changes intact when checking a reload and submission recovery.
      if (!sessionStorage.getItem('item-comments-fixture')) {
        sessionStorage.setItem('item-comments-fixture', 'true');
        localStorage.setItem('cart-storage', JSON.stringify({ state: { items: [] }, version: 0 }));
        localStorage.setItem('cart-table-context', tableContext);
      }
    }, { tableContext: `${mobileStore.slug}:${mobileTableId}` });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    page.on('pageerror', error => report.errors.push({ view: view.name, message: error.message }));
    await installMobileFixture(page, origin, fixture, report.unexpectedRequests);
    const requests = [];
    let committed = false;
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/^\/api/, '');
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/orders' && request.method() === 'POST') {
        requests.push(request.postDataJSON());
        if (requests.length === 1) return route.abort('connectionreset');
        committed = true;
        return json(201, { order: fixture.order, replayed: false });
      }
      if (path.startsWith('/orders/submissions/')) {
        assert.equal(request.method(), 'GET');
        return committed ? json(200, { order: fixture.order, replayed: true }) : json(404, { error: 'ORDER_SUBMISSION_NOT_FOUND' });
      }
      if (path === `/public/table/${mobileTableId}/orders`) return json(200, { orders: committed ? [fixture.order] : [] });
      return route.fallback();
    });
    try {
      await page.goto(`${origin}/table/${mobileTableId}?storeSlug=${mobileStore.slug}`);
      await page.getByRole('button', { name: fixture.categories[0].title, exact: true }).click();
      assert.deepEqual(await draft(page), []);

      // Plain items must offer a comment before adding anything to the cart.
      let dialog = await openItem(page, fixture.items[0]);
      assert.deepEqual(await draft(page), []);
      const comment = dialog.getByRole('textbox', { name: 'Comments (optional)', exact: true });
      assert.equal(await comment.getAttribute('maxlength'), '500');
      await comment.fill('x'.repeat(501));
      assert.equal((await comment.inputValue()).length, 500, 'Comment must stop at the supported limit');
      await comment.fill('  No sugar  ');
      await addItem(dialog);
      assert.equal((await draft(page))[0].note, 'No sugar');

      dialog = await openItem(page, fixture.items[0]);
      assert.equal(await dialog.getByTestId('item-comment').inputValue(), '', 'A new item must not inherit a prior comment');
      await dialog.getByTestId('item-comment').fill('No sugar');
      await addItem(dialog);
      let items = await draft(page);
      assert.equal(items.length, 1, 'Equivalent comments may share one cart line');
      assert.equal(items[0].quantity, 2);

      const secondComment = 'No salt\nSauce on the side <please>';
      dialog = await openItem(page, fixture.items[0]);
      await dialog.getByTestId('item-comment').fill(secondComment);
      await addItem(dialog);
      items = await draft(page);
      assert.equal(items.length, 2, 'Different instructions for the same item must stay separate');
      assert.deepEqual(items.map(item => [item.note, item.quantity]), [['No sugar', 2], [secondComment, 1]]);

      dialog = await openItem(page, fixture.items[1]);
      assert.equal(await dialog.getByTestId('item-comment').inputValue(), '', 'Changing items must reset the comment');
      await dialog.getByTestId('item-comment').fill('   ');
      await addItem(dialog);
      assert.ok(!(await draft(page))[2].note, 'Blank comments are optional');

      // Comments must coexist with, and never bypass, required modifiers.
      dialog = await openItem(page, fixture.items[2]);
      await dialog.getByTestId('item-comment').fill('Cut in half');
      await dialog.getByRole('button', { name: /^Add to cart$/i }).click();
      await dialog.getByRole('alert').waitFor();
      assert.equal((await draft(page)).length, 3);
      await dialog.getByRole('radio', { name: /^Cheese/ }).check();
      await addItem(dialog);

      await cartButton(page).click();
      const cartDialog = page.getByRole('dialog').filter({ has: page.getByTestId('cart-checkout-footer') });
      await cartDialog.getByText('No sugar', { exact: true }).waitFor();
      await cartDialog.getByText(secondComment, { exact: true }).waitFor();
      const editButtons = cartDialog.getByRole('button', { name: /^(Edit|Edit item)$/ });
      assert.equal(await editButtons.count(), 4, 'Every cart line, including plain items, must be editable');
      await editButtons.first().click();
      const editDialog = page.getByRole('dialog').filter({ has: page.getByTestId('item-comment') });
      assert.equal(await editDialog.getByTestId('item-comment').inputValue(), 'No sugar');
      await editDialog.getByTestId('item-comment').fill('  No sugar, extra hot  ');
      await editDialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await editDialog.waitFor({ state: 'hidden' });
      items = await draft(page);
      assert.equal(items[0].note, 'No sugar, extra hot');
      assert.equal(items[0].quantity, 2);
      assert.equal(items[1].note, secondComment, 'Editing one line must preserve other instructions');
      await page.reload();
      await page.getByRole('button', { name: fixture.categories[0].title, exact: true }).click();
      assert.deepEqual(await draft(page), items, 'Reload must preserve the annotated cart');
      await cartButton(page).click();
      await cartDialog.getByText('No sugar, extra hot', { exact: true }).waitFor();
      await cartDialog.getByText(secondComment, { exact: true }).waitFor();
      await cartDialog.getByRole('button', { name: 'Place order', exact: true }).click();
      await page.getByTestId('order-recovery').waitFor();
      const saved = await journal(page);
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].items.map(item => [item.itemId, item.quantity, item.note]), [
        [fixture.items[0].id, 2, 'No sugar, extra hot'],
        [fixture.items[0].id, 1, secondComment],
        [fixture.items[1].id, 1, undefined],
        [fixture.items[2].id, 1, 'Cut in half'],
      ]);
      assert.ok(!Object.hasOwn(requests[0].items[2], 'note'), 'Omit blank item notes from the API payload');
      assert.deepEqual(saved.payload, requests[0], 'Save exact item instructions for request recovery');
      await page.reload();
      await page.getByRole('button', { name: 'Retry saved order', exact: true }).waitFor();
      assert.equal(requests.length, 1, 'Reload must not automatically POST the order');
      assert.deepEqual((await journal(page)).payload, saved.payload);
      await page.getByRole('button', { name: 'Retry saved order', exact: true }).click();
      await page.waitForFunction(key => localStorage.getItem(key) === null, pendingKey);
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1], requests[0], 'Explicit retry must preserve all item notes and the submission key');
      assert.deepEqual(await draft(page), []);
      report.cases.push({ view: view.name, passed: true, submittedItems: requests[0].items.length });
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/${view.name}-failure.png` });
      throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpectedRequests, []);
  console.log('Item comments: phone and desktop passed adding, limits, blank/reset, separate lines, editing, reload, modifiers and exact checkout retry');
} finally {
  await browser.close();
  await fs.writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
}
