// Real Chrome layout checks with synthetic auth responses only.
// Run against the loopback frontend (default port 18181); no cloud or live API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mobileFixture, mobileTableId, mobileStore, installMobileFixture } from './fixtures/mobile-menu.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = new URL(process.env.AUTH_TEST_URL || 'http://127.0.0.1:18181').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a loopback frontend');
const artifacts = path.resolve(process.env.AUTH_LAYOUT_ARTIFACTS || '../Garsone-Core/deploy/pi/full-stack/artifacts/mobile-polish');
await fs.mkdir(artifacts, { recursive: true });
const phase = process.env.AUTH_LAYOUT_PHASE || 'auth-final';
const views = [
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
].filter(view => !process.env.AUTH_LAYOUT_VIEW || process.env.AUTH_LAYOUT_VIEW === view.name);
const languages = (process.env.AUTH_LAYOUT_LANGUAGES || 'en,el').split(',');
const report = { phase, cases: 0, samples: [], failures: [], errors: [], unexpectedRequests: [] };
const check = (condition, message) => { if (!condition) report.failures.push(message); };
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });

async function waitForFocusedInput(page) {
  // Keyboard focus uses the app's smooth page scrolling. Check after it reaches
  // the field, without forcing a scroll that could hide a product regression.
  await page.waitForFunction(() => {
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement)) return false;
    const box = input.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight + 1;
  }, undefined, { timeout: 2000 });
}

async function inspect(page, label, { screenshot = false, initial = false, dialog = false } = {}) {
  const state = await page.evaluate(() => {
    const rect = element => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const visible = element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    const modal = document.querySelector('[role="dialog"]');
    return {
      viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight, scrollY,
      headings: [...document.querySelectorAll('h1,h2')].filter(visible).map(element => ({ text: element.textContent, rect: rect(element) })),
      inputs: [...document.querySelectorAll('input')].filter(visible).map(element => ({ id: element.id, rect: rect(element),
        focused: document.activeElement === element, fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        paddingRight: Number.parseFloat(getComputedStyle(element).paddingRight) })),
      submit: rect(document.querySelector('button[type="submit"]')),
      passwordToggle: rect(document.querySelector('button[aria-controls="login-password"]')),
      alert: rect(document.querySelector('[role="alert"]')),
      dialog: modal ? { rect: rect(modal), scrollWidth: modal.scrollWidth, clientWidth: modal.clientWidth,
        scrollHeight: modal.scrollHeight, clientHeight: modal.clientHeight,
        close: rect([...modal.querySelectorAll('button')].find(button => button.textContent.trim() === 'Close')),
        heading: rect(modal.querySelector('h2')) } : null,
    };
  });
  report.samples.push({ label, ...state });
  check(state.scrollWidth <= state.viewport.width + 1, `${label}: horizontal page overflow`);
  for (const element of [...state.headings, ...state.inputs]) {
    check(element.rect.x >= 0 && element.rect.right <= state.viewport.width + 1, `${label}: ${element.id || element.text} exceeds viewport width`);
  }
  for (const input of state.inputs) {
    if (state.viewport.width < 1024) check(input.fontSize >= 16, `${label}: ${input.id} could trigger mobile focus zoom`);
    check(input.rect.height >= 44, `${label}: ${input.id} is too short`);
    if (input.focused) check(input.rect.y >= 0 && input.rect.bottom <= state.viewport.height + 1, `${label}: focused input is clipped`);
  }
  if (initial && state.viewport.height >= 568) {
    check(state.submit?.bottom <= state.viewport.height - 8, `${label}: primary login action is below initial viewport`);
  }
  if (state.passwordToggle) {
    const input = state.inputs.find(item => item.id === 'login-password');
    check(state.passwordToggle.width >= 44 && state.passwordToggle.height >= 44, `${label}: password reveal target is below 44px`);
    check(input && state.passwordToggle.x >= input.rect.x && state.passwordToggle.right <= input.rect.right, `${label}: password reveal exceeds input`);
    check(input && state.passwordToggle.y >= input.rect.y && state.passwordToggle.bottom <= input.rect.bottom, `${label}: password reveal exceeds input height`);
    check(input && input.paddingRight >= state.passwordToggle.width, `${label}: password text overlaps reveal target`);
  }
  if (dialog) {
    check(Boolean(state.dialog), `${label}: settings drawer is missing`);
    if (state.dialog) {
      const box = state.dialog.rect;
      check(box.x >= 0 && box.right <= state.viewport.width + 1 && box.y >= 0 && box.bottom <= state.viewport.height + 1, `${label}: settings drawer exceeds viewport`);
      check(state.dialog.scrollWidth <= state.dialog.clientWidth + 1, `${label}: settings drawer content overflows`);
      const close = state.dialog.close;
      check(close?.width >= 44 && close?.height >= 44 && close?.right <= box.right && close?.bottom <= box.bottom, `${label}: drawer close button is clipped or too small`);
      if (close && state.dialog.heading) check(state.dialog.heading.right <= close.x + 1, `${label}: drawer heading overlaps close button`);
    }
  }
  if (screenshot) await page.screenshot({ path: path.join(artifacts, `${phase}-${label}.png`) });
}

try {
  for (const view of views) for (const language of languages) {
    const label = `${view.name}-${language}`;
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height },
      hasTouch: view.width < 1024, isMobile: view.width < 1024, colorScheme: 'light', reducedMotion: 'no-preference' });
    await context.addInitScript(({ language }) => {
      localStorage.setItem('language', language);
      localStorage.setItem('vite-ui-theme', 'light');
      localStorage.setItem('theme', 'light');
    }, { language });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${label}: ${error.message}`));
    let signinCalls = 0;
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
      if (url.origin === origin && url.pathname === '/api/auth/signin' && request.method() === 'POST') {
        signinCalls++;
        return route.fulfill({ status: signinCalls === 1 ? 401 : 200, contentType: 'application/json',
          body: JSON.stringify(signinCalls === 1 ? { error: 'INVALID_CREDENTIALS' } : {
            accessToken: 'synthetic-layout-test-token', user: {
              id: '66666666-6666-4666-8666-666666666666', email: 'layout@example.invalid', name: 'Layout test',
              role: 'manager', storeId: mobileStore.id, storeSlug: mobileStore.slug, mustChangePassword: true,
            }, store: mobileStore,
          }) });
      }
      report.unexpectedRequests.push(`${label}: ${request.method()} ${request.url()}`);
      return route.abort();
    });
    try {
      await page.goto(`${origin}/login`);
      const email = page.locator('#login-email');
      const password = page.locator('#login-password');
      const reveal = page.locator('button[aria-controls="login-password"]');
      const submit = page.locator('button[type="submit"]');
      await email.waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      await inspect(page, `${label}-login`, { initial: true, screenshot: true });
      check(signinCalls === 0, `${label}: login made an unsolicited auth request`);

      await email.click();
      await email.fill('layout@example.invalid');
      await waitForFocusedInput(page);
      await inspect(page, `${label}-email-focused`);
      await email.press('Tab');
      await waitForFocusedInput(page);
      await password.fill('Synthetic-passphrase-only');
      await inspect(page, `${label}-password-focused`, { screenshot: view.width < 1024 });
      await reveal.click();
      check(await password.getAttribute('type') === 'text', `${label}: password reveal failed`);
      check(await reveal.getAttribute('aria-pressed') === 'true', `${label}: reveal accessibility state is wrong`);
      check(await password.inputValue() === 'Synthetic-passphrase-only', `${label}: reveal changed password value`);
      await reveal.click();
      check(await password.getAttribute('type') === 'password', `${label}: password hide failed`);
      check(signinCalls === 0, `${label}: password reveal submitted the form`);

      await submit.click();
      await page.getByRole('alert').waitFor({ state: 'visible' });
      await submit.waitFor({ state: 'visible' });
      await inspect(page, `${label}-login-error`);
      check(await submit.isEnabled(), `${label}: rejected login left submit disabled`);
      await submit.click();
      const newPassword = page.locator('#login-new-password');
      const confirmPassword = page.locator('#login-confirm-password');
      await newPassword.waitFor({ state: 'visible' });
      await inspect(page, `${label}-change-password`, { screenshot: view.width < 400 });
      await newPassword.click();
      await newPassword.fill('Synthetic-new-passphrase');
      await waitForFocusedInput(page);
      await inspect(page, `${label}-new-password-focused`);
      await newPassword.press('Tab');
      await waitForFocusedInput(page);
      await confirmPassword.fill('Synthetic-different-passphrase');
      await inspect(page, `${label}-confirm-password-focused`);
      await page.locator('button[type="submit"]').click();
      await page.getByRole('alert').waitFor({ state: 'visible' });
      await inspect(page, `${label}-password-mismatch`);
      check(signinCalls === 2, `${label}: auth request count changed unexpectedly`);

      // The desktop runner cannot show a phone keyboard. A reduced viewport verifies
      // that focused fields remain reachable when less vertical space is available.
      if (view.name === 'small-phone') {
        await page.setViewportSize({ width: view.width, height: 320 });
        await confirmPassword.focus();
        await confirmPassword.scrollIntoViewIfNeeded();
        await inspect(page, `${label}-reduced-height-focus`);
        await page.setViewportSize({ width: view.width, height: view.height });
      }

      // Exercise the shared AppBurger against the synthetic guest page; no live venue data.
      await context.clearCookies();
      await page.evaluate(() => { sessionStorage.clear(); localStorage.setItem('ROLE', 'guest'); });
      await page.unrouteAll({ behavior: 'wait' });
      await installMobileFixture(page, origin, mobileFixture(language), report.unexpectedRequests);
      await page.goto(`${origin}/table/${mobileTableId}?storeSlug=${mobileStore.slug}`);
      const burger = page.getByRole('button', { name: 'Open menu', exact: true });
      await burger.waitFor({ state: 'visible' });
      await burger.click();
      const drawer = page.getByRole('dialog');
      await drawer.waitFor({ state: 'visible' });
      await drawer.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); });
      await inspect(page, `${label}-settings`, { dialog: true, screenshot: view.width < 400 || view.name === 'landscape' });
      await drawer.getByRole('button', { name: 'Close', exact: true }).click();
      await drawer.waitFor({ state: 'hidden' });
      check(await burger.evaluate(element => document.activeElement === element), `${label}: drawer did not restore focus to trigger`);
      report.cases++;
    } catch (error) {
      report.failures.push(`${label}: ${error.stack || error}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(artifacts, `${phase}-report.json`), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ phase, cases: report.cases, samples: report.samples.length,
  failures: report.failures, errors: report.errors, unexpectedRequests: report.unexpectedRequests }, null, 2));
assert.equal(report.failures.length + report.errors.length + report.unexpectedRequests.length, 0, 'Auth layout checks failed');
