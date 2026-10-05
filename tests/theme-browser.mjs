// Real palette controls and rendered colors, using synthetic venue data only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { mobileFixture, mobileStore, mobileTableId, installMobileFixture } from './fixtures/mobile-menu.mjs';

const origin = new URL(process.env.THEME_TEST_URL || 'http://127.0.0.1:18182').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Use a loopback fixture server');
const artifacts = 'browser-artifacts/theme';
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const report = { cases: [], errors: [], unexpectedRequests: [] };
const palettes = ['Luxe Ember', 'Nocturne Marina', 'Modern Mist', 'Velvet Dusk', 'Classic'];
const menuPath = `/table/${mobileTableId}?storeSlug=${mobileStore.slug}`;
const cartButton = page => page.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).first();
const openSettings = page => page.getByRole('button', { name: 'Open menu', exact: true }).click();
const closeDialog = async page => {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
};

async function setup({ view = 'phone', theme, palette, colorScheme = 'light', beforeReact = false } = {}) {
  const fixture = mobileFixture();
  fixture.items = [fixture.items[0]];
  fixture.cart = [fixture.cart[0]];
  fixture.bootstrap.menu.items = fixture.items;
  fixture.bootstrap.menu.categories = [fixture.categories[0]];
  const context = await browser.newContext({
    viewport: view === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    hasTouch: view === 'phone', colorScheme, reducedMotion: 'reduce',
  });
  await context.addInitScript(({ cart, tableContext, theme, palette }) => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('OFFLINE', 'false');
    if (!sessionStorage.getItem('theme-fixture')) {
      sessionStorage.setItem('theme-fixture', 'true');
      if (theme) localStorage.setItem('theme', theme);
      if (palette) localStorage.setItem('dashboardTheme', palette);
      localStorage.setItem('cart-storage', JSON.stringify({ state: { items: cart }, version: 0 }));
      localStorage.setItem('cart-table-context', tableContext);
    }
  }, { cart: fixture.cart, tableContext: `${mobileStore.slug}:${mobileTableId}`, theme, palette });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => report.errors.push(error.message));
  await installMobileFixture(page, origin, fixture, report.unexpectedRequests);
  // The document must choose its mode before React loads, including saved light.
  if (beforeReact) await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(`${origin}${menuPath}`);
  if (!beforeReact) await page.getByRole('button', { name: 'Open menu', exact: true }).waitFor();
  return { page, context, fixture };
}

async function assertMode(page, mode, message) {
  await page.waitForFunction(expected => document.documentElement.classList.contains(expected), mode);
  const state = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    light: document.documentElement.classList.contains('light'),
    favicon: document.getElementById('app-favicon')?.getAttribute('href'),
  }));
  assert.equal(state.dark, mode === 'dark', message);
  assert.equal(state.light, mode === 'light', message);
  assert.ok(state.favicon?.includes(`v=${mode}`), `${message}: favicon disagrees with the selected mode`);
}

async function sample(page, label, action) {
  await page.evaluate(async () => {
    // Let finite sheet/color transitions finish before comparing painted colors.
    await Promise.all(document.getAnimations().filter(animation =>
      animation.effect?.getComputedTiming().iterations !== Infinity
    ).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const state = await page.evaluate(() => {
    const inspect = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        primary: style.getPropertyValue('--primary').trim(),
        background: style.getPropertyValue('--background').trim(),
        card: style.getPropertyValue('--card').trim(),
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
      };
    };
    const menu = document.querySelector('[data-testid="menu-header"]')?.parentElement;
    // Resolve the shared landing-card utility under the same selected palette.
    // A dark palette must not inherit its light palette's white gradient stops.
    const card = document.createElement('div');
    card.className = 'bg-gradient-card';
    card.style.display = 'none';
    menu?.append(card);
    const gradientCard = getComputedStyle(card).backgroundImage;
    card.remove();
    return {
      html: inspect(document.documentElement), body: inspect(document.body),
      menu: inspect(menu), gradientCard,
      dialog: inspect(document.querySelector('[role="dialog"]')),
    };
  });
  state.cartButton = await cartButton(page).evaluate(element => getComputedStyle(element).backgroundColor);
  if (action) state.action = await action.evaluate(element => getComputedStyle(element).backgroundColor);
  report.cases.push({ label, ...state });
  assert.ok(state.menu && state.dialog, `${label}: missing menu or portal`);
  for (const variable of ['primary', 'background', 'card']) {
    assert.equal(state.dialog[variable], state.menu[variable], `${label}: portal ${variable} differs from the menu`);
    assert.equal(state.body[variable], state.menu[variable], `${label}: page ${variable} differs from the menu`);
  }
  return state;
}

function assertCardBrightness(state, mode, label) {
  const stops = [...state.gradientCard.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)]
    .map(match => match.slice(1).map(Number));
  assert.ok(stops.length >= 2, `${label}: card gradient was not resolved`);
  for (const stop of stops) {
    const brightness = stop.reduce((sum, channel) => sum + channel, 0) / 3;
    assert.ok(mode === 'dark' ? brightness < 80 : brightness > 210,
      `${label}: ${mode} card gradient has an inappropriate ${stop.join(',')} stop`);
  }
}

try {
  for (const scenario of [
    { label: 'fresh-light-OS-before-React', beforeReact: true, expected: 'dark' },
    { label: 'saved-light-before-React', beforeReact: true, theme: 'light', expected: 'light' },
    { label: 'fresh-light-OS', expected: 'dark' },
    { label: 'saved-light', theme: 'light', expected: 'light' },
  ]) {
    const { page, context } = await setup(scenario);
    try {
      await assertMode(page, scenario.expected, scenario.label);
      await page.reload();
      if (!scenario.beforeReact) await page.getByRole('button', { name: 'Open menu', exact: true }).waitFor();
      await assertMode(page, scenario.expected, `${scenario.label}: reload`);
      report.cases.push({ label: scenario.label, mode: scenario.expected, passed: true });
    } finally { await context.close(); }
  }

  for (const view of ['phone', 'desktop']) {
    const { page, context, fixture } = await setup({ view });
    try {
      await page.getByRole('button', { name: fixture.categories[0].title, exact: true }).click();
      const modeColors = {};
      for (const mode of ['dark', 'light']) {
        await openSettings(page);
        if (mode === 'light') await page.getByRole('switch', { name: 'Toggle dark mode' }).click();
        await assertMode(page, mode, `${view}: selected ${mode}`);
        const colors = [];
        for (const palette of palettes) {
          await page.getByRole('button', { name: new RegExp(palette) }).click();
          // Reduced motion disables transitions; two frames allow context consumers to update.
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const drawer = await sample(page, `${view}/${mode}/${palette}/settings`);
          assertCardBrightness(drawer, mode, `${view}/${mode}/${palette}`);
          colors.push({ palette, button: drawer.cartButton, surface: drawer.dialog.backgroundColor });
          await closeDialog(page);

          await cartButton(page).click();
          const checkout = page.getByRole('dialog').getByRole('button', { name: 'Place order', exact: true });
          await checkout.waitFor();
          const cart = await sample(page, `${view}/${mode}/${palette}/cart`, checkout);
          assert.equal(cart.cartButton, drawer.cartButton, 'Closing settings must preserve the selected palette');
          assert.equal(cart.action, drawer.cartButton, 'Checkout must use the selected primary color');
          await closeDialog(page);

          await page.locator('.menu-item-card').first().getByRole('button').click();
          const add = page.getByRole('dialog').getByRole('button', { name: /^Add to cart$/i });
          await add.waitFor();
          const item = await sample(page, `${view}/${mode}/${palette}/item`, add);
          assert.equal(item.action, drawer.cartButton, 'Item action must use the selected primary color');
          await closeDialog(page);
          await openSettings(page);
        }
        assert.equal(new Set(colors.map(color => color.button)).size, palettes.length,
          `${view}/${mode}: palette controls do not change visible primary colors`);
        assert.equal(new Set(colors.map(color => color.surface)).size, palettes.length,
          `${view}/${mode}: palette controls do not change visible surface colors`);
        modeColors[mode] = colors;
        await closeDialog(page);
      }
      for (let index = 0; index < palettes.length; index++) {
        assert.notEqual(modeColors.dark[index].button, modeColors.light[index].button,
          `${view}/${palettes[index]}: mode toggle leaves the primary color unchanged`);
        assert.notEqual(modeColors.dark[index].surface, modeColors.light[index].surface,
          `${view}/${palettes[index]}: mode toggle leaves the surface unchanged`);
      }
      // A user's light preference and final Classic selection must survive a reload.
      await page.reload();
      await page.getByRole('button', { name: fixture.categories[0].title, exact: true }).click();
      await assertMode(page, 'light', `${view}: user-selected light survives reload`);
      await openSettings(page);
      const reloaded = await sample(page, `${view}/light/Classic/reload`);
      assert.equal(reloaded.cartButton, modeColors.light.at(-1).button);
      assert.equal(reloaded.dialog.backgroundColor, modeColors.light.at(-1).surface);
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/${view}-failure.png` });
      throw error;
    } finally { await context.close(); }
  }

  // Existing system preferences remain supported when the OS changes without a reload.
  const { page, context, fixture } = await setup({ theme: 'system', palette: 'nocturne-marina' });
  try {
    await page.getByRole('button', { name: fixture.categories[0].title, exact: true }).click();
    await assertMode(page, 'light', 'Saved system theme with light OS');
    await openSettings(page);
    const light = await sample(page, 'system/light/settings');
    await page.emulateMedia({ colorScheme: 'dark' });
    await assertMode(page, 'dark', 'Saved system theme follows dark OS');
    const dark = await sample(page, 'system/dark/settings');
    assert.notEqual(light.dialog.backgroundColor, dark.dialog.backgroundColor);
    await page.emulateMedia({ colorScheme: 'light' });
    await assertMode(page, 'light', 'Saved system theme follows light OS again');
    const restored = await sample(page, 'system/light/restored');
    assert.equal(restored.dialog.backgroundColor, light.dialog.backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    await assertMode(page, 'dark', 'System dark before using the header toggle');
    await closeDialog(page);
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    await assertMode(page, 'light', 'Header toggle resolves system dark to explicit light');
    assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'light');
  } finally { await context.close(); }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpectedRequests, []);
  console.log('Themes: dark default, saved light, five palettes in both modes, menu/cart/item/settings portals, reload and live system changes passed');
} finally {
  await browser.close();
  await fs.writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
}
