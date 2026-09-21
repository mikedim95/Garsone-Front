// Mobile/desktop layout invariants with synthetic fixtures and real browser motion.
// Use a loopback VITE_LOCAL_ONLY=true VITE_API_URL=/api frontend on port 18181.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mobileFixture, mobileTableId, mobileOrderId, mobileStore, installMobileFixture } from './fixtures/mobile-menu.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = new URL(process.env.MOBILE_TEST_URL || 'http://127.0.0.1:18181').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a local test server');
const phase = process.env.MOBILE_LAYOUT_PHASE || 'final';
const artifactRoot = path.resolve(process.env.MOBILE_LAYOUT_ARTIFACTS || '../Garsone-Core/deploy/pi/full-stack/artifacts/mobile-polish');
await fs.mkdir(artifactRoot, { recursive: true });
const viewports = [
  { name: 'small-phone', width: 320, height: 568 }, { name: 'phone', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 }, { name: 'short-landscape', width: 568, height: 320 },
  { name: 'desktop', width: 1440, height: 900 },
];
const languages = (process.env.MOBILE_LAYOUT_LANGUAGES || 'en,el').split(',');
const selectedViews = process.env.MOBILE_LAYOUT_VIEW?.split(',');
const cases = viewports.filter(view => !selectedViews || selectedViews.includes(view.name))
  .flatMap(view => languages.map(language => ({ ...view, language, theme: process.env.MOBILE_LAYOUT_THEME || 'light' })));
if (!process.env.MOBILE_LAYOUT_VIEW && !process.env.MOBILE_LAYOUT_THEME && languages.includes('en')) {
  cases.push({ ...viewports[1], language: 'en', reducedMotion: true });
  cases.push({ ...viewports[1], language: 'en', theme: 'dark' });
}
const report = { phase, samples: [], failures: [], errors: [], unexpectedRequests: [] };
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const check = (condition, description) => { if (!condition) report.failures.push(description); };

async function sample(page, label, screenshot = false) {
  const state = await page.evaluate(() => {
    const rect = element => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
    const frame = document.querySelector('.menu-content-frame');
    const colors = element => element ? Object.fromEntries(['--primary', '--background'].map(key => [key, getComputedStyle(element).getPropertyValue(key).trim()])) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
      darkTheme: document.documentElement.classList.contains('dark'),
      scrollY, body: rect(document.body), frame: rect(frame), frameOverflow: frame ? getComputedStyle(frame).overflowX : null,
      panes: [...document.querySelectorAll('.menu-swipe-pane')].map(rect),
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(element => {
        const box = element.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight && box.width > 0;
      }).map(element => ({ text: element.textContent, rect: rect(element), parent: rect(element.parentElement) })),
      dialog: rect(dialog), dialogScrollHeight: dialog?.scrollHeight,
      dialogScrollWidth: dialog?.scrollWidth, dialogClientWidth: dialog?.clientWidth,
      scrollAreas: dialog ? [...dialog.querySelectorAll('[data-radix-scroll-area-viewport], [data-testid="cart-scroll-content"], [data-testid="active-order-scroll-content"]')]
        .map(element => ({ rect: rect(element), width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop })) : [],
      controls: rect(document.querySelector('[role="region"]:has(svg.lucide-shopping-cart)')),
      menuHeader: rect(document.querySelector('[data-testid="menu-header"]')),
      menuColors: colors(document.querySelector('[data-testid="menu-header"]')?.parentElement), dialogColors: colors(dialog),
      secondaryBar: rect(document.querySelector('[data-testid="active-order-floating-bar"]')),
      actions: dialog ? [...dialog.querySelectorAll('button')].filter(button => !button.disabled && getComputedStyle(button).display !== 'none')
        .map(button => ({ text: button.textContent, aria: button.getAttribute('aria-label'), rect: rect(button) })) : [],
    };
  });
  report.samples.push({ label, ...state });
  check(state.scrollWidth <= state.viewport.width + 1, `${label}: horizontal document overflow ${state.scrollWidth}/${state.viewport.width}`);
  if (state.frame && state.panes.length > 1) check(['hidden', 'clip'].includes(state.frameOverflow), `${label}: transitioning panes are not clipped`);
  if (state.controls) check(state.controls.y >= -1 && state.controls.bottom <= state.viewport.height + 1, `${label}: order controls exceed viewport`);
  if (state.controls && state.secondaryBar) check(state.controls.bottom <= state.secondaryBar.y + 1 || state.secondaryBar.bottom <= state.controls.y + 1, `${label}: fixed order bars overlap`);
  if (screenshot) {
    for (const heading of state.headings) {
      check(heading.rect.x >= -1 && heading.rect.right <= state.viewport.width + 1, `${label}: heading exceeds viewport: ${heading.text}`);
      check(!heading.parent || heading.rect.x >= heading.parent.x - 1 && heading.rect.right <= heading.parent.right + 1, `${label}: heading exceeds its container: ${heading.text}`);
    }
    if (state.dialog) check(state.dialog.y >= -1 && state.dialog.bottom <= state.viewport.height + 1, `${label}: dialog exceeds viewport height`);
    for (const area of state.scrollAreas) check(area.scrollWidth <= area.width + 1, `${label}: dialog scroll content exceeds width ${area.scrollWidth}/${area.width}`);
    for (const action of state.actions.filter(action => action.rect.height > 0 && action.rect.bottom > 0 && action.rect.y < state.viewport.height))
      check(action.rect.x >= -1 && action.rect.right <= state.viewport.width + 1, `${label}: visible dialog action exceeds width: ${action.aria || action.text}`);
  }
  if (screenshot) await page.screenshot({ path: path.join(artifactRoot, `${phase}-${label}.png`), animations: 'allow' });
  return state;
}

async function stable(page) { await page.waitForTimeout(750); }
function checkPortalTheme(state, label) { check(JSON.stringify(state.menuColors) === JSON.stringify(state.dialogColors), `${label}: portal colors differ from the guest menu theme`); }

async function drag(page, from, to, during, touch = false) {
  const session = touch ? await page.context().newCDPSession(page) : null;
  if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, radiusX: 3, radiusY: 3, force: 1, id: 1 }] });
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); }
  for (let step = 1; step <= 10; step++) {
    const point = { x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10 };
    if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, radiusX: 3, radiusY: 3, force: 1, id: 1 }] });
    else await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(16);
    if (step === 5 && during) await during();
  }
  if (session) { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); }
  else await page.mouse.up();
}

async function checkSheetInteraction(page, label, view, body, handle) {
  const dialog = page.getByRole('dialog');
  const initial = await dialog.boundingBox();
  const contentBox = await body.boundingBox();
  if (!contentBox || !initial) return check(false, `${label}: missing scrollable sheet content`);
  const start = { x: contentBox.x + contentBox.width / 2, y: contentBox.y + Math.min(contentBox.height / 3, 45) };
  const end = { x: start.x, y: Math.min(view.height - 80, start.y + 150) };
  await drag(page, start, end, async () => {
    const during = await dialog.boundingBox();
    check(during && Math.abs(during.y - initial.y) <= 2, `${label}: dragging sheet body moves the dialog`);
  });
  await stable(page);
  check(await dialog.isVisible(), `${label}: dragging sheet body dismissed the dialog`);
  const beforeScroll = await body.evaluate(element => element.scrollTop);
  await body.hover(); await page.mouse.wheel(0, 400); await page.waitForTimeout(200);
  const afterScroll = await body.evaluate(element => ({ top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight }));
  check(afterScroll.total <= afterScroll.height || afterScroll.top > beforeScroll, `${label}: long sheet content cannot scroll independently`);
  if (view.width < 1280) {
    if (afterScroll.total > afterScroll.height + 40 && view.width < 1000) {
      await body.evaluate(element => { element.scrollTop = 0; });
      const from = { x: contentBox.x + contentBox.width / 2, y: contentBox.y + contentBox.height - 12 };
      await drag(page, from, { x: from.x, y: Math.max(contentBox.y + 12, from.y - 130) }, undefined, true);
      await page.waitForTimeout(200);
      check(await body.evaluate(element => element.scrollTop) > 10, `${label}: vertical touch does not scroll sheet content`);
      const afterTouch = await dialog.boundingBox();
      check(afterTouch && Math.abs(afterTouch.y - initial.y) <= 2, `${label}: touching scroll content moves the whole sheet`);
    }
    const grip = await handle.boundingBox();
    check(Boolean(grip), `${label}: no mobile drag handle`);
    if (grip) {
      const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
      await drag(page, from, { x: from.x, y: Math.min(view.height - 10, from.y + 220) }, () => sample(page, `${label}-handle-mid`));
      await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 3000 });
      await sample(page, `${label}-handle-end`);
    }
  }
}

try {
  for (const view of cases) {
    const label = `${view.name}-${view.language}${view.reducedMotion ? '-reduced-motion' : ''}${view.theme === 'dark' ? '-dark' : ''}`;
    const fixture = mobileFixture(view.language);
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.width < 1000, reducedMotion: view.reducedMotion ? 'reduce' : 'no-preference' });
    await context.addInitScript(({ language, cart, cartContext, theme }) => {
      localStorage.setItem('language', language); localStorage.setItem('OFFLINE', 'false');
      localStorage.setItem('theme', theme || 'light');
      localStorage.setItem('cart-storage', JSON.stringify({ state: { items: cart }, version: 0 }));
      localStorage.setItem('cart-table-context', cartContext);
    }, { language: view.language, cart: fixture.cart, cartContext: `${mobileStore.slug}:${mobileTableId}`, theme: view.theme });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${label}: ${error.message}`));
    await installMobileFixture(page, origin, fixture, report.unexpectedRequests);
    try {
      await page.goto(`${origin}/table/${mobileTableId}?storeSlug=${mobileStore.slug}`);
      const firstCategory = page.getByRole('button', { name: fixture.categories[0].title, exact: true });
      await firstCategory.waitFor(); await stable(page);
      await sample(page, `${label}-landing`, true);
      const categoryBox = await firstCategory.boundingBox();
      check(categoryBox && categoryBox.y < view.height - 40 && categoryBox.y + categoryBox.height > 40, `${label}: no category content visible on first screen`);
      await firstCategory.click();
      await page.locator('.menu-swipe-pane').first().waitFor(); await stable(page);
      const menuState = await sample(page, `${label}-menu`, true);
      check(menuState.darkTheme === (view.theme === 'dark'), `${label}: requested color theme was not applied`);
      check(menuState.menuHeader && Math.abs(menuState.menuHeader.y) <= 1, `${label}: menu header does not remain pinned after category selection`);
      const firstItemName = await page.locator('.menu-item-card h3').first().boundingBox();
      check(firstItemName && firstItemName.y >= 0 && firstItemName.y + firstItemName.height <= (menuState.controls?.y ?? view.height) + 1, `${label}: no complete item name visible above fixed controls on first menu screen`);

      const tabs = page.getByRole('tab');
      if (await tabs.count()) {
        const paneBox = await page.getByRole('tabpanel').boundingBox();
        const navBox = await page.getByRole('tablist').boundingBox();
        const swipeY = Math.min(view.height - 110, Math.max(paneBox.y + 90, navBox.y + navBox.height + 95));
        await sample(page, `${label}-swipe-start`);
        await drag(page, { x: view.width * .78, y: swipeY }, { x: view.width * .2, y: swipeY }, () => sample(page, `${label}-swipe-drag-mid`), view.width < 1000);
        await page.waitForTimeout(60); await sample(page, `${label}-swipe-transition-mid`, true); await stable(page);
        check(await page.getByRole('tab', { selected: true }).getAttribute('title') === fixture.categories[1].title, `${label}: horizontal swipe did not advance exactly one category`);
        await sample(page, `${label}-swipe-end`);

        const indicator = page.locator('button[aria-current]').locator('..').locator('button').last();
        await indicator.click(); await stable(page);
        check(await page.getByRole('tab', { selected: true }).getAttribute('title') === fixture.categories[3].title, `${label}: category indicator did not navigate to its destination`);
        await tabs.first().focus(); await page.keyboard.press('End'); await stable(page);
        check(await page.getByRole('tab', { selected: true }).getAttribute('title') === fixture.categories[3].title, `${label}: category keyboard End navigation failed`);
        await page.keyboard.press('Home'); await stable(page);
        check(await page.getByRole('tab', { selected: true }).getAttribute('title') === fixture.categories[0].title, `${label}: category keyboard Home navigation failed`);
        if (view.width < 1000) {
          const beforeScroll = await page.evaluate(() => scrollY);
          await drag(page, { x: view.width / 2, y: Math.min(view.height - 100, swipeY + 100) }, { x: view.width / 2, y: 100 }, undefined, true);
          await page.waitForTimeout(250);
          const afterScroll = await page.evaluate(() => scrollY);
          check(afterScroll > beforeScroll + 30, `${label}: vertical touch drag did not scroll menu`);
          check(await page.getByRole('tab', { selected: true }).getAttribute('title') === fixture.categories[0].title, `${label}: vertical touch scrolling changed category`);
          const scrolledState = await sample(page, `${label}-vertical-scroll`);
          check(scrolledState.menuHeader && Math.abs(scrolledState.menuHeader.y) <= 1, `${label}: menu header scrolls out of viewport`);
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await stable(page);
        }
        const cartQuantityAfterGestures = await page.evaluate(() => JSON.parse(localStorage.getItem('cart-storage') || '{}').state?.items?.reduce((total, entry) => total + entry.quantity, 0));
        check(cartQuantityAfterGestures === fixture.cart.reduce((total, entry) => total + entry.quantity, 0), `${label}: category gestures accidentally changed cart quantities`);
      } else check(false, `${label}: category tabs lack accessible semantics`);

      if (view.theme === 'dark') {
        await page.locator('button').filter({ has: page.locator('svg.lucide-bell') }).first().click();
        await page.getByRole('alertdialog').waitFor(); await stable(page);
        const waiterState = await sample(page, `${label}-call-waiter`, true);
        checkPortalTheme(waiterState, `${label}-call-waiter`);
        await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      const customizableItem = page.locator('.menu-item-card button').nth(7);
      if (view.height < 390) {
        // A viewport-centered click would be underneath the pinned category navigation.
        // Scroll the item into the actual gap between the two fixed control regions.
        await customizableItem.evaluate(element => {
          const nav = document.querySelector('[role="tablist"]').parentElement.parentElement.getBoundingClientRect();
          const footer = document.querySelector('[role="region"]:has(svg.lucide-shopping-cart)').getBoundingClientRect();
          const box = element.getBoundingClientRect();
          scrollBy({ top: box.y + box.height / 2 - (nav.bottom + footer.y) / 2, behavior: 'instant' });
        });
        await page.waitForTimeout(100);
        const point = await customizableItem.evaluate(element => {
          const box = element.getBoundingClientRect(); const x = box.x + box.width / 2; const y = box.y + box.height / 2;
          return { x, y, reachable: element.contains(document.elementFromPoint(x, y)) };
        });
        assert.equal(point.reachable, true, `${label}: item cannot be reached between fixed bars`);
        await page.mouse.click(point.x, point.y);
      } else await customizableItem.click();
      const modifierDialog = page.getByRole('dialog');
      await modifierDialog.waitFor(); await stable(page);
      const modifierState = await sample(page, `${label}-modifiers`, true);
      checkPortalTheme(modifierState, `${label}-modifiers`);
      const modifierFooterButtons = modifierDialog.getByRole('button').filter({ hasText: view.language === 'el' ? /^(Άκυρο|Προσθήκη στο καλάθι)$/ : /^(Cancel|Add to cart)$/i });
      check(await modifierFooterButtons.count() === 2, `${label}: modifier footer actions missing`);
      for (const button of await modifierFooterButtons.all()) {
        const box = await button.boundingBox();
        check(box && box.y >= 0 && box.y + box.height <= view.height + 1 && box.height >= 43, `${label}: modifier footer is outside viewport or too small`);
      }
      const modifierOptions = await modifierDialog.locator('label').evaluateAll(labels => labels.map(label => ({ height: label.getBoundingClientRect().height, width: label.clientWidth, scrollWidth: label.scrollWidth })));
      check(modifierOptions.length === 14 && modifierOptions.every(option => option.height >= 44 && option.scrollWidth <= option.width + 1), `${label}: long modifier option tap target or width fails`);
      const modifierScroll = modifierDialog.locator('.overflow-y-auto').first();
      if (view.height >= 390 && view.height < 500 && view.width > view.height) {
        const firstOption = await modifierDialog.getByRole('checkbox').first().boundingBox();
        const modifierScrollBox = await modifierScroll.boundingBox();
        check(firstOption && modifierScrollBox && firstOption.y >= modifierScrollBox.y && firstOption.y + firstOption.height <= modifierScrollBox.y + modifierScrollBox.height + 1, `${label}: no modifier checkbox is fully visible before scrolling in landscape`);
      }
      const modifierBefore = await modifierScroll.evaluate(element => element.scrollTop);
      await modifierScroll.hover(); await page.mouse.wheel(0, 600); await page.waitForTimeout(200);
      check(await modifierScroll.evaluate(element => element.scrollTop) > modifierBefore, `${label}: long modifier list does not scroll independently`);
      await page.keyboard.press('Escape'); await modifierDialog.waitFor({ state: 'hidden' });
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await stable(page);

      const cartButton = page.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).first();
      await cartButton.click();
      await page.getByRole('dialog').waitFor();
      await sample(page, `${label}-cart-start`);
      await page.waitForTimeout(100); await sample(page, `${label}-cart-mid`);
      await stable(page);
      const cartState = await sample(page, `${label}-cart`, true);
      checkPortalTheme(cartState, `${label}-cart`);
      const dialog = page.getByRole('dialog');
      const placeOrder = dialog.getByRole('button', { name: view.language === 'el' ? 'Αποστολή παραγγελίας' : 'Place order', exact: true });
      const submit = await placeOrder.count() ? placeOrder : dialog.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).first();
      const submitBox = await submit.boundingBox();
      check(submitBox && submitBox.y >= -1 && submitBox.y + submitBox.height <= view.height + 1, `${label}: cart submit is outside viewport`);
      check(cartState.dialog && cartState.dialog.x >= -1 && cartState.dialog.right <= view.width + 1,
        `${label}: cart dialog exceeds viewport width`);
      const note = dialog.getByRole('textbox');
      const noteBox = await note.boundingBox();
      check(noteBox && submitBox && (noteBox.y + noteBox.height <= submitBox.y + 1 || submitBox.y + submitBox.height <= noteBox.y + 1 || noteBox.x + noteBox.width <= submitBox.x + 1 || submitBox.x + submitBox.width <= noteBox.x + 1), `${label}: cart note overlaps submit action`);
      const cartScroll = dialog.locator('[data-radix-scroll-area-viewport], [data-testid="cart-scroll-content"]').first();
      const cartHandle = dialog.locator('[data-testid="cart-drag-handle"]');
      if (await cartHandle.count() && await cartScroll.count()) {
        const firstIncrease = await cartScroll.getByRole('button').filter({ hasText: /^\+$/ }).first().boundingBox();
        const cartScrollBox = await cartScroll.boundingBox();
        check(firstIncrease && cartScrollBox && firstIncrease.y >= cartScrollBox.y && firstIncrease.y + firstIncrease.height <= cartScrollBox.y + cartScrollBox.height + 1, `${label}: first cart row quantity controls are clipped below its scroll window`);
        await checkSheetInteraction(page, `${label}-cart`, view, cartScroll, cartHandle);
      }
      await context.close();

      const orderContext = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.width < 1000, reducedMotion: view.reducedMotion ? 'reduce' : 'no-preference' });
      await orderContext.addInitScript(({ language, theme }) => { localStorage.setItem('language', language); localStorage.setItem('OFFLINE', 'false'); localStorage.setItem('theme', theme || 'light'); }, { language: view.language, theme: view.theme });
      const orderPage = await orderContext.newPage();
      orderPage.on('pageerror', error => report.errors.push(`${label}-order: ${error.message}`));
      await installMobileFixture(orderPage, origin, fixture, report.unexpectedRequests);
      await orderPage.goto(`${origin}/table/${mobileTableId}?storeSlug=${mobileStore.slug}&highlightLastOrder=1`);
      const lastOrder = orderPage.locator('button').filter({ has: orderPage.locator('svg.lucide-shopping-bag') }).first();
      await lastOrder.waitFor(); await lastOrder.click();
      await sample(orderPage, `${label}-active-order-start`); await orderPage.waitForTimeout(100);
      await sample(orderPage, `${label}-active-order-mid`); await stable(orderPage);
      await sample(orderPage, `${label}-active-order`, true);
      await checkSheetInteraction(orderPage, `${label}-active-order`, view, orderPage.getByTestId('active-order-scroll-content'), orderPage.getByTestId('active-order-drag-handle'));
      await orderPage.goto(`${origin}/order/${mobileOrderId}/thanks?tableId=${mobileTableId}&storeSlug=${mobileStore.slug}`);
      await stable(orderPage); await sample(orderPage, `${label}-thanks`, true);
      await orderContext.close();
    } catch (error) {
      report.failures.push(`${label}: ${error.message}`);
      if (!page.isClosed()) await page.screenshot({ path: path.join(artifactRoot, `${phase}-${label}-failure.png`) });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(artifactRoot, `${phase}-layout-report.json`), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ phase, cases: cases.length, samples: report.samples.length, failures: report.failures, errors: report.errors, unexpectedRequests: report.unexpectedRequests }, null, 2));
if (phase !== 'baseline') {
  assert.deepEqual(report.failures, []); assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpectedRequests, []);
}
