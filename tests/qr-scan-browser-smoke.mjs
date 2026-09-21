// Run against a local Vite dev server or preview built with VITE_API_URL=/api.
// Every API and destination outside the preview origin is mocked: no live venue/cloud access.
// PLAYWRIGHT_MODULE, CHROME_PATH and QR_TEST_URL use the same options as the event dashboard smoke.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const origin = new URL(process.env.QR_TEST_URL || "http://127.0.0.1:18180").origin;
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) {
  throw new Error("QR scan smoke requires a local preview origin");
}
const artifactDir = process.env.QR_SCAN_ARTIFACT_DIR || fileURLToPath(new URL("../../Garsone-Core/deploy/pi/full-stack/artifacts/", import.meta.url));
const eventId = "a7a8c9d0-1234-4567-8123-123456789abc";
const tableId = "d7a8c9d0-1234-4567-8123-123456789abc";
const storeId = "c7a8c9d0-1234-4567-8123-123456789abc";
const code = "GT-ABCD-2345";
const tablePath = `/table/${tableId}?storeSlug=noor`;
const foreignOrigin = "https://configured-event-app.invalid";
const success = { status: "OK", tableId, tableLabel: "Table 1", storeSlug: "noor", publicCode: code, eventId };
const completed = [];
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });

async function scenario(name, handler, verify, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const unexpected = [];
  const requests = [];
  const destinationRequests = [];
  const releases = [];
  const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.addInitScript(language => {
    window.__unexpectedQrCodeExecution = false;
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem("language", language);
  }, options.language || "en");
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", async dialog => { unexpected.push(`Unexpected browser dialog: ${dialog.type()}`); await dialog.dismiss(); });
  await context.routeWebSocket("**/*", socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(origin).host && !url.pathname.startsWith("/api/")) socket.connectToServer();
    else socket.close(); // Table screen realtime is outside this resolver test; never connect to another service.
  });
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === foreignOrigin && url.pathname === `/table/${tableId}` && request.isNavigationRequest()) {
      destinationRequests.push(request);
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Mock event app</title><h1>Configured event app destination</h1>" });
    }
    if (url.origin !== origin) {
      unexpected.push(`External request: ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (url.pathname === `/api/q/${code}`) {
      requests.push(request);
      return handler({ route, request, url, attempt: requests.length, fulfill, releases });
    }
    // The success assertion follows the canonical table route. Its data is an empty
    // fixture so the same smoke works with both source modules and built chunks.
    const store = { id: storeId, slug: "noor", name: "Noor", orderingMode: "qr", currencyCode: "EUR", locale: "en", customerOrderRecallEnabled: false, settings: {} };
    if (url.pathname === "/api/public/menu-bootstrap") {
      return fulfill(route, { store, table: { id: tableId, label: "Table 1" }, menu: { categories: [], items: [], modifiers: [], itemModifiers: [] } });
    }
    if (url.pathname === "/api/store") return fulfill(route, { store });
    if (url.pathname === `/api/tables/${tableId}/public`) return fulfill(route, { tableId, tableLabel: "Table 1", storeSlug: "noor", storeName: "Noor" });
    if (url.pathname === "/api/orders/public-summary") return fulfill(route, { orders: [] });
    if (url.pathname.startsWith("/api/")) {
      unexpected.push(`Unmocked API: ${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  try {
    if (options.clock) await page.clock.install();
    const requested = page.waitForRequest(request => new URL(request.url()).pathname === `/api/q/${code}`);
    await page.goto(`${origin}/q/${code}${options.query ?? `?event=${eventId}`}`, { waitUntil: "domcontentloaded" });
    await requested;
    await verify({ page, requests, destinationRequests });
    for (const request of requests) {
      assert.equal(request.method(), "GET");
      assert.equal(request.headers().accept, "application/json");
      assert.equal(request.headers().authorization, undefined, "QR resolver never sends an architect session");
    }
    assert.deepEqual(unexpected, [], `${name}: unexpected network or browser activity`);
    assert.deepEqual(errors, [], `${name}: browser errors`);
    completed.push(name);
  } catch (error) {
    await fs.mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, `qr-scan-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-failure.png`), fullPage: true });
    throw error;
  } finally {
    releases.forEach(release => release());
    await context.close();
  }
}

try {
  let releaseLoading;
  await scenario("mobile loading and missing-code guidance", async ({ route, fulfill, releases }) => {
    await new Promise(resolve => { releaseLoading = resolve; releases.push(resolve); });
    return fulfill(route, { error: "QR_EVENT_TILE_NOT_FOUND_OR_INACTIVE" }, 404);
  }, async ({ page, requests }) => {
    await page.getByRole("heading", { name: "Opening your table", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /again/ }).count(), 0);
    releaseLoading();
    await page.getByRole("heading", { name: "This QR code is unavailable", exact: true }).waitFor();
    assert.match(await page.locator("main").innerText(), /member of staff/);
    assert.doesNotMatch(await page.locator("main").innerText(), /QR_EVENT_|NOT_FOUND|\{"error"/);
    assert.equal(new URL(page.url()).pathname, `/q/${code}`);
    assert.equal(requests.length, 1);
    await fs.mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "qr-scan-mobile-unavailable.png"), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile page should not scroll horizontally");
  });

  await scenario("unassigned code stays on a friendly page", ({ route, fulfill }) => fulfill(route, { status: "UNASSIGNED_TILE", storeSlug: "noor", publicCode: code }), async ({ page, requests }) => {
    await page.getByRole("heading", { name: "Your table is being set up", exact: true }).waitFor();
    assert.match(await page.locator("main").innerText(), /member of staff/);
    assert.doesNotMatch(await page.locator("main").innerText(), /UNASSIGNED_TILE/);
    assert.equal(new URL(page.url()).pathname, `/q/${code}`);
    assert.equal(requests.length, 1);
  });

  await scenario("network failure retries to canonical local table", ({ route, attempt, fulfill }) => attempt === 1 ? route.abort("failed") : fulfill(route, success), async ({ page, requests }) => {
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.match(await page.locator("main").innerText(), /venue Wi-Fi/);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.waitForURL(`${origin}${tablePath}`);
    assert.equal(requests.length, 2);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("STORE_SLUG")), "noor");
  });

  await scenario("empty event cannot fall back to global assignment", ({ route, fulfill }) => fulfill(route, { error: "QR_EVENT_TILE_NOT_FOUND_OR_INACTIVE" }, 404), async ({ page, requests }) => {
    await page.getByRole("heading", { name: "This QR code is unavailable", exact: true }).waitFor();
    assert.equal(new URL(requests[0].url()).search, "?event=");
    assert.equal(new URL(page.url()).search, "?event=");
    assert.equal(requests.length, 1);
  }, { query: "?event=" });

  await scenario("unsafe destination is refused", ({ route, fulfill }) => fulfill(route, { ...success, redirectUrl: "javascript:window.__unexpectedQrCodeExecution=true" }), async ({ page }) => {
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, `/q/${code}`);
    assert.equal(await page.evaluate(() => window.__unexpectedQrCodeExecution), false);
  });

  await scenario("configured other-origin app destination is honored", ({ route, fulfill }) => fulfill(route, { ...success, redirectUrl: `${foreignOrigin}${tablePath}` }), async ({ page, destinationRequests }) => {
    await page.waitForURL(`${foreignOrigin}${tablePath}`);
    await page.getByRole("heading", { name: "Configured event app destination", exact: true }).waitFor();
    assert.equal(destinationRequests.length, 1);
    assert.equal(destinationRequests[0].headers().authorization, undefined);
  });

  await scenario("twelve-second timeout cancels pending resolution", async ({ releases }) => {
    await new Promise(resolve => releases.push(resolve));
  }, async ({ page, requests }) => {
    await page.getByRole("heading", { name: "Opening your table", exact: true }).waitFor();
    const failed = page.waitForEvent("requestfailed", { predicate: request => new URL(request.url()).pathname === `/api/q/${code}` });
    await page.clock.fastForward(12001);
    await failed;
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.equal(requests.length, 1);
    assert.equal(new URL(page.url()).pathname, `/q/${code}`);
  }, { clock: true });

  await scenario("Greek venue guidance is translated and fits mobile", ({ route, fulfill }) => fulfill(route, { error: "QR_EVENT_TILE_NOT_FOUND_OR_INACTIVE" }, 404), async ({ page }) => {
    await page.getByRole("heading", { name: "Αυτός ο κωδικός QR δεν είναι διαθέσιμος", exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Ελέγξτε ξανά", exact: true }).isVisible());
    assert.doesNotMatch(await page.locator("main").innerText(), /qr_scan\.|QR_EVENT_|This QR code is unavailable/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Greek copy should fit the mobile viewport");
    await fs.mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "qr-scan-mobile-unavailable-el.png"), fullPage: true });
  }, { language: "el" });

  console.log(JSON.stringify({ passed: true, viewport: "390x844", checks: completed }));
} finally {
  await browser.close();
}
