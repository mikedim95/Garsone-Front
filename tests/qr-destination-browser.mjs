// Isolated Architect fixture: all API traffic is mocked; no live staff token is used.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const origin = new URL(process.env.QR_TEST_URL || "http://127.0.0.1:18186").origin;
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname), "Use a local fixture server");
const store = { id: "11111111-1111-4111-8111-111111111111", slug: "habibi", name: "Habibi", printers: [] };
const reportedAt = new Date(Date.now() - 60_000).toISOString();
const earlierReport = "2024-09-21T08:00:00.000Z";
const tiles = [
  { id: "local", publicCode: "GT-ABCD-2345", publicUrl: "http://10.194.47.73:8080/q/GT-ABCD-2345", storeId: store.id,
    tableId: "pi-table-7", tableLabel: "Window 7", assignmentSource: "PI", assignmentReportedAt: reportedAt },
  { id: "online", publicCode: "GT-BCDE-2345", storeId: "22222222-2222-4222-8222-222222222222", assignmentSource: "ONLINE", assignmentReportedAt: null },
  { id: "pending", publicCode: "GT-CDEF-2345", publicUrl: null, storeId: store.id, assignmentSource: "PI_PENDING", assignmentReportedAt: null },
  { id: "unassigned", publicCode: "GT-DEFG-2345", publicUrl: "http://10.194.47.73:8080/q/GT-DEFG-2345", storeId: store.id,
    assignmentSource: "PI", assignmentReportedAt: reportedAt },
  { id: "older-report", publicCode: "GT-EFGH-2345", publicUrl: "http://10.194.47.73:8080/q/GT-EFGH-2345", storeId: store.id,
    tableId: "pi-table-12", tableLabel: "Garden 12", assignmentSource: "PI", assignmentReportedAt: earlierReport },
].map(tile => ({ isActive: true, storeName: tile.id === "online" ? "Online venue" : "Habibi", tableId: null, ...tile }));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(storeId => {
    localStorage.setItem("language", "en");
    sessionStorage.setItem("auth-storage", JSON.stringify({ state: { user: { id: "fixture", role: "architect", storeId, storeSlug: "habibi" }, token: "FIXTURE_ONLY" }, version: 0 }));
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.fixtureCopiedUrl = text; } } });
  }, store.id);
  const page = await context.newPage();
  const errors = [];
  const unexpectedRequests = [];
  const writes = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.routeWebSocket("**/events/ws*", ws => ws.close());
  await page.route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { unexpectedRequests.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.replace(/^\/api/, "");
    if (request.method() !== "GET") { writes.push(`${request.method()} ${path}`); return route.fulfill({ status: 405, json: { error: "READ_ONLY_FIXTURE" } }); }
    let data = {};
    if (path === "/admin/stores" || path === "/admin/stores/overview") data = { stores: [store] };
    else if (path.endsWith("/qr-tiles")) data = { tiles: path === "/admin/qr-tiles" ? tiles : tiles.filter(tile => tile.storeId === store.id) };
    else if (path.endsWith("/tables")) data = { tables: [] };
    else if (path.endsWith("/nodes")) data = { nodes: [] };
    else if (path.endsWith("/users")) data = { users: [] };
    else if (path.endsWith("/pending-nodes")) data = { pendingNodes: [] };
    else if (path === "/billing/visits") data = { currencyCode: "EUR", visits: [], legacyOrders: [] };
    else if (path.endsWith("/deployment")) data = { deployment: { target: "PI", desiredState: "RUNNING", status: "RUNNING", localUrl: "http://10.194.47.73:8080" }, node: null };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(origin + "/GarsoneAdmin");
  for (const tile of tiles) {
    await page.getByPlaceholder("Find any printed code...").fill(tile.publicCode);
    const row = page.getByRole("row").filter({ hasText: tile.publicCode });
    if (tile.assignmentSource === "PI") {
      await row.getByText("Last reported by Pi", { exact: false }).waitFor();
      assert.equal(await row.locator("time").getAttribute("datetime"), tile.assignmentReportedAt);
    } else if (tile.assignmentSource === "PI_PENDING") {
      await row.getByText("Awaiting Pi report", { exact: true }).waitFor();
      assert.equal(await row.getByText("Venue linked", { exact: true }).count(), 0);
    } else assert.equal(await row.locator("time").count(), 0, "Online assignment is not labelled as a Pi report");
    await row.locator('button[class*="bg-white"]').click();
    const dialog = page.getByRole("dialog");
    if (tile.publicUrl === null) {
      await dialog.getByText("The associated Pi has not reported its local address yet.").waitFor();
      assert(await dialog.getByRole("button", { name: "Copy URL", exact: true }).isDisabled());
      assert.equal(await dialog.locator('svg[height="240"]').count(), 0);
    } else {
      const expected = tile.publicUrl || `https://www.garsone.gr/q/${tile.publicCode}`;
      await dialog.getByText(expected, { exact: true }).waitFor();
      await dialog.getByRole("button", { name: "Copy URL", exact: true }).click();
      assert.equal(await page.evaluate(() => window.fixtureCopiedUrl), expected);
    }
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
  }
  await page.getByRole("tab", { name: "Per Store Setting", exact: true }).click();
  await page.getByRole("tab", { name: "Store QR Tiles", exact: true }).click();
  const assigned = page.getByRole("row").filter({ hasText: tiles[0].publicCode });
  await assigned.getByText("Window 7", { exact: true }).waitFor();
  assert.equal(await assigned.getByText("No table assigned", { exact: true }).count(), 0);
  assert.equal(await assigned.locator("time").getAttribute("datetime"), reportedAt);
  const unassigned = page.getByRole("row").filter({ hasText: tiles[3].publicCode });
  await unassigned.getByText("No table assigned", { exact: true }).waitFor();
  assert.equal(await unassigned.locator("time").getAttribute("datetime"), reportedAt);
  const pending = page.getByRole("row").filter({ hasText: tiles[2].publicCode });
  await pending.getByText("Assignment not reported yet", { exact: true }).waitFor();
  assert.equal(await pending.getByText("No table assigned", { exact: true }).count(), 0, "A missing Pi report is unknown, not unassigned");
  await pending.getByText("Awaiting Pi report", { exact: true }).waitFor();
  const older = page.getByRole("row").filter({ hasText: tiles[4].publicCode });
  await older.getByText("Garden 12", { exact: true }).waitFor();
  assert.equal(await older.locator("time").getAttribute("datetime"), earlierReport);
  assert.match(await older.locator("time").innerText(), /2024/, "Older snapshots retain a visible date including the year");
  await page.getByText("1 QR code is awaiting a table assignment report from the Pi.", { exact: false }).waitFor();
  assert.equal(await page.getByText("Table Unassigned", { exact: true }).locator("..").getByRole("heading").innerText(), "1", "Unknown assignments must not inflate the unassigned count");
  assert.equal(await page.getByText("Table Assigned", { exact: true }).locator("..").getByRole("heading").innerText(), "2");
  await page.getByRole("row").filter({ hasText: tiles[0].publicCode }).locator('button[class*="bg-white"]').click();
  await page.getByRole("dialog").getByText(tiles[0].publicUrl, { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, []);
  assert.deepEqual(writes, [], "Viewing assignments and previews never writes to an API");
  console.log("PASS Architect QR destinations and Pi assigned/unassigned/pending snapshots; timestamps and counts preserve uncertainty; no API writes");
} finally { await browser.close(); }
