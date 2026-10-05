// Isolated Architect fixture: all API traffic is mocked; no live staff token is used.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const origin = process.env.QR_TEST_URL || "http://127.0.0.1:18186";
const store = { id: "11111111-1111-4111-8111-111111111111", slug: "habibi", name: "Habibi", printers: [] };
const tiles = [
  { id: "local", publicCode: "GT-ABCD-2345", publicUrl: "http://10.194.47.73:8080/q/GT-ABCD-2345", storeId: store.id },
  { id: "online", publicCode: "GT-BCDE-2345", storeId: "22222222-2222-4222-8222-222222222222" },
  { id: "pending", publicCode: "GT-CDEF-2345", publicUrl: null, storeId: store.id },
].map(tile => ({ ...tile, isActive: true, storeName: tile.id === "online" ? "Online venue" : "Habibi", tableId: null }));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(storeId => {
    sessionStorage.setItem("auth-storage", JSON.stringify({ state: { user: { id: "fixture", role: "architect", storeId, storeSlug: "habibi" }, token: "FIXTURE_ONLY" }, version: 0 }));
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.fixtureCopiedUrl = text; } } });
  }, store.id);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    let data = {};
    if (path === "/admin/stores" || path === "/admin/stores/overview") data = { stores: [store] };
    else if (path.endsWith("/qr-tiles")) data = { tiles: path === "/admin/qr-tiles" ? tiles : tiles.filter(tile => tile.storeId === store.id) };
    else if (path.endsWith("/tables")) data = { tables: [] };
    else if (path.endsWith("/nodes")) data = { nodes: [] };
    else if (path.endsWith("/users")) data = { users: [] };
    else if (path.endsWith("/pending-nodes")) data = { pendingNodes: [] };
    else if (path.endsWith("/deployment")) data = { deployment: { target: "PI", desiredState: "RUNNING", status: "RUNNING", localUrl: "http://10.194.47.73:8080" }, node: null };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(origin + "/GarsoneAdmin");
  for (const tile of tiles) {
    await page.getByPlaceholder("Find any printed code...").fill(tile.publicCode);
    const row = page.getByRole("row").filter({ hasText: tile.publicCode });
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
  await page.getByRole("row").filter({ hasText: tiles[0].publicCode }).locator('button[class*="bg-white"]').click();
  await page.getByRole("dialog").getByText(tiles[0].publicUrl, { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS Architect QR pool, store previews and copied URLs use each venue's destination; missing Pi address cannot print a cloud QR");
} finally { await browser.close(); }
