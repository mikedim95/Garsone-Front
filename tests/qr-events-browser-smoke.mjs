// Run against a cloud-mode frontend preview. Every API response is mocked;
// this test never signs in to or writes to a live installation.
// Set PLAYWRIGHT_MODULE to an installed playwright-core package if needed,
// CHROME_PATH to a local browser, and QR_TEST_URL to the preview origin.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const origin = process.env.QR_TEST_URL || "http://127.0.0.1:18180";
const storeId = "11111111-1111-4111-8111-111111111111";
const tableId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const pairingToken = "A".repeat(43);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});

try {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    sessionStorage.setItem("auth-storage", JSON.stringify({
      state: {
        user: { id: "architect-test", email: "test@example.invalid", role: "architect", storeId: "11111111-1111-4111-8111-111111111111", storeSlug: "noor" },
        token: "TEST_ONLY_CLOUD_TOKEN",
      },
      version: 0,
    }));
    window.print = () => {};
  });
  const page = await context.newPage();
  const errors = [];
  const unexpected = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let event = null;
  let forceConflict = false;
  const store = { id: "11111111-1111-4111-8111-111111111111", slug: "noor", name: "Noor", orderingMode: "qr", printers: [] };
  const tiles = [{ id: "44444444-4444-4444-8444-444444444444", storeId: store.id, publicCode: "GT-ABCD-1234", tableId: tableId, label: "<img src=x onerror=alert(1)>", isActive: true }];
  const tables = [{ id: tableId, label: "Table 1", isActive: true, waiterCount: 0, orderCount: 0 }];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.replace(/^\/api/, "");
    requests.push({ url: request.url(), method: request.method(), auth: request.headers().authorization });
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) {
      unexpected.push(request.method() + " " + request.url());
      return route.abort();
    }
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body = {};
    let status = 200;
    if (path === "/admin/stores") body = { stores: [store] };
    else if (path.endsWith("/tables")) body = { tables };
    else if (path.endsWith("/qr-tiles")) body = { tiles };
    else if (path.endsWith("/nodes")) body = { nodes: [] };
    else if (path.endsWith("/users")) body = { users: [] };
    else if (path.endsWith("/pending-nodes")) body = { pendingNodes: [] };
    else if (path.endsWith("/deployment")) body = { deployment: { target: "ONLINE", desiredState: "STOPPED", status: "ONLINE_ONLY" }, node: null };
    else if (path.endsWith("/qr-events") && request.method() === "GET") body = { events: event ? [event] : [] };
    else if (path.endsWith("/qr-events") && request.method() === "POST") {
      event = {
        ...request.postDataJSON(), id: eventId, storeId: store.id, storeSlug: store.slug,
        revision: 1, lastAppliedRevision: 0, lastAppliedAt: null, paired: false, isImported: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      body = { event };
    } else if (path === `/admin/qr-events/${eventId}` && request.method() === "PATCH") {
      if (forceConflict) { status = 409; body = { error: "QR_EVENT_REVISION_CONFLICT" }; }
      else {
        const { expectedRevision, ...changes } = request.postDataJSON();
        assert.equal(expectedRevision, event.revision);
        event = { ...event, ...changes, revision: event.revision + 1 }; body = { event };
      }
    } else if (path.endsWith("/export")) {
      const { id, storeId, storeSlug, name, publicAppUrl, publicApiUrl, revision, isActive, assignments } = event;
      body = { bundle: { schemaVersion: 1, event: { id, storeId, storeSlug, name, publicAppUrl, publicApiUrl, revision, isActive, assignments }, exportedAt: new Date().toISOString() } };
    } else if (path.endsWith("/pairing")) {
      event = { ...event, paired: request.method() !== "DELETE", lastAppliedRevision: 0, lastAppliedAt: null };
      body = request.method() === "DELETE" ? { ok: true } : { token: pairingToken };
    } else if (path === `/admin/qr-events/${eventId}`) body = { event };
    else { unexpected.push(request.method() + " " + path); status = 500; body = { error: "UNEXPECTED_MOCK_REQUEST" }; }
    return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
  });

  await page.goto(`${origin}/GarsoneAdmin`);
  await page.getByRole("tab", { name: "Per Store Setting", exact: true }).click();
  await page.getByRole("tab", { name: "Event QR Codes", exact: true }).click();
  await page.getByRole("button", { name: "New event", exact: true }).click();
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  assert.equal(await page.getByLabel("Event name", { exact: true }).getAttribute("aria-invalid"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.id), "qr-event-name");
  assert.equal(event, null);
  await page.getByLabel("Event name", { exact: true }).fill("Noor test <script>alert(1)</script>");
  await page.getByLabel("Local customer app URL", { exact: true }).fill("http://noor-node.local:8080/path");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), "qr-event-app");
  assert.equal(event, null);
  await page.getByLabel("Local customer app URL", { exact: true }).fill("http://noor-node.local:8080");
  assert.equal(await page.getByLabel("Local Core API / QR resolver URL", { exact: true }).inputValue(), "http://noor-node.local:8080/api");
  await page.getByLabel("Local Core API / QR resolver URL", { exact: true }).fill("http://separate-pi.local:8787");
  await page.getByLabel("Local customer app URL", { exact: true }).fill("http://noor-node.local:8081");
  assert.equal(await page.getByLabel("Local Core API / QR resolver URL", { exact: true }).inputValue(), "http://separate-pi.local:8787");
  await page.getByLabel("Local customer app URL", { exact: true }).fill("http://noor-node.local:8080");
  await page.getByRole("button", { name: "Use app URL + /api", exact: true }).click();
  await page.getByRole("button", { name: "Add venue QR codes", exact: true }).click();
  await page.getByRole("button", { name: "Generate codes", exact: true }).click();
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await page.getByText("Saved revision 1", { exact: true }).waitFor();
  assert.equal(event.assignments.length, 2);
  assert.equal(event.assignments.find(row => row.publicCode === tiles[0].publicCode).tableId, tableId);
  assert.equal(event.assignments.filter(row => row.tableId === null).length, 1);

  const unassigned = event.assignments.find(row => !row.tableId).publicCode;
  await page.getByRole("button", { name: `Remove ${unassigned}`, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove code", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Export for Pi", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Undo removal", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Export for Pi", exact: true }).isEnabled(), true);
  if (process.env.QR_SCREENSHOT_DIR) await fs.mkdir(process.env.QR_SCREENSHOT_DIR, { recursive: true });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.getByLabel("Label for GT-ABCD-1234", { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const geometry = await page.evaluate(() => {
      const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      const save = document.querySelector('[aria-label="Save event"]');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        header: rect(document.querySelector('header')),
        actions: rect(save.closest('.sticky')),
        controls: ['Save event', 'Export for Pi', 'Print enabled QR codes'].map(label => rect(document.querySelector(`[aria-label="${label}"]`))),
        fields: ['Label for GT-ABCD-1234', 'Table for GT-ABCD-1234'].map(label => rect(document.querySelector(`[aria-label="${label}"]`))),
      };
    });
    assert.equal(geometry.overflow, false, `Event page overflow at ${viewport.width}`);
    assert(Math.abs(geometry.header.top) <= 1, `Dashboard header must stay at viewport top at ${viewport.width}`);
    assert(geometry.actions.top >= geometry.header.bottom, `Sticky actions overlap header at ${viewport.width}`);
    assert(geometry.actions.bottom <= viewport.height, `Actions clipped at ${viewport.width}`);
    for (const rect of [...geometry.controls, ...geometry.fields]) {
      assert(rect.left >= 0 && rect.right <= viewport.width + 1, `Control outside viewport at ${viewport.width}`);
    }
    if (process.env.QR_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.QR_SCREENSHOT_DIR}/event-assignments-${viewport.width}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    if (process.env.QR_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.QR_SCREENSHOT_DIR}/event-first-screen-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "QR", exact: true }).first().click();
  await page.getByRole("dialog").getByText(`http://noor-node.local:8080/api/q/GT-ABCD-1234?event=${eventId}`, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Print enabled QR codes", exact: true }).click(),
  ]);
  await popup.locator("svg").waitFor();
  assert.equal(await popup.locator("script,img").count(), 0);
  assert.equal(await popup.locator("svg").count(), 1);
  assert.match(await popup.locator("body").textContent(), /<img src=x onerror=alert\(1\)>/);
  await popup.close();

  event = { ...event, revision: 2 };
  const [stalePopup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Print enabled QR codes", exact: true }).click(),
  ]);
  await page.getByText("Saved revision 2", { exact: true }).waitFor();
  assert.equal(stalePopup.isClosed(), true, "Stale saved data must not be printed");
  event = { ...event, revision: 3, lastAppliedRevision: 3, lastAppliedAt: new Date().toISOString() };
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export for Pi", exact: true }).click(),
  ]);
  const exported = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  assert.equal(exported.event.id, eventId);
  assert.equal(exported.event.revision, 3);
  assert.equal(download.suggestedFilename(), `qr-event-${eventId}-r3.json`);
  assert.equal(exported.event.paired, undefined);
  await page.getByText("Saved revision 3", { exact: true }).waitFor();
  await page.getByText("Applied on Pi", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Create pairing token", exact: true }).click();
  const [pairing] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download pairing file", exact: true }).click(),
  ]);
  const connection = JSON.parse(await fs.readFile(await pairing.path(), "utf8"));
  assert.equal(connection.eventId, eventId);
  assert.equal(connection.token, pairingToken);
  assert(!JSON.stringify(connection).includes("TEST_ONLY_CLOUD_TOKEN"));
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await page.getByText("Waiting for first Pi sync", { exact: true }).waitFor();
  assert.equal(event.lastAppliedRevision, 0);
  forceConflict = true;
  await page.getByLabel("Event name", { exact: true }).fill("Unsaved event name");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await page.getByText(/This event changed elsewhere/).first().waitFor();
  assert.equal(await page.getByLabel("Event name", { exact: true }).inputValue(), "Unsaved event name");
  await page.getByRole("tab", { name: "Store Overview", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Keep editing", exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "Event QR Codes", exact: true }).getAttribute("data-state"), "active");

  event = { ...event, isImported: true, lastAppliedRevision: event.revision, lastAppliedAt: new Date().toISOString() };
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByText("Managed from cloud", { exact: true }).waitFor();
  assert(await page.getByLabel("Event name", { exact: true }).isDisabled());
  assert(await page.getByLabel("Label for GT-ABCD-1234", { exact: true }).isDisabled());
  assert(await page.getByRole("button", { name: "Save event", exact: true }).isDisabled());
  assert(await page.getByRole("button", { name: "Print enabled QR codes", exact: true }).isEnabled());
  assert(!requests.some((request) => request.url.includes("noor-node.local")), "Cloud dashboard must never call the LAN API");
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  assert(requests.filter(request => request.method !== "OPTIONS").every(request => request.auth === "Bearer TEST_ONLY_CLOUD_TOKEN"));
  console.log(JSON.stringify({ passed: true, checks: [
    "responsive event controls and sticky header at four sizes", "inline validation focuses field before any write", "derived/custom API addresses", "removal undo preserves assignments", "stale print is blocked", "latest export revision and filename", "pair rotation clears old acknowledgement", "event creation and venue assignments", "local printed resolver URL", "print XSS escaping", "unassigned codes excluded from printing", "bundle export",
    "scoped pairing download without cloud JWT", "409 retains unsaved edits", "dirty tab navigation guard",
    "imported event is read-only and printable", "no cloud-to-LAN browser requests",
  ] }));
} finally {
  await browser.close();
}
