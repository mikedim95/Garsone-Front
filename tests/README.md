# UX regression checks

Use Node 24. `npm run typecheck` checks both application and Vite configuration;
`npm run test:unit` checks order and modifier validation. Both run in the existing
image publishing workflow.

Browser checks require Chrome/Chromium and an installed `playwright-core` package.
Set `PLAYWRIGHT_MODULE` to that package's absolute path and `CHROME_PATH` to the
browser executable. This is development tooling and is excluded from the Pi
runtime. All browser API fixtures are synthetic, including writes.

For the cloud Architect and QR scan suites, build or serve with
`VITE_API_URL=/api` and `VITE_LOCAL_ONLY=false` on `http://127.0.0.1:18180`, then run:

```sh
node tests/qr-events-browser-smoke.mjs
node tests/qr-scan-browser-smoke.mjs
```

Event checks verify opaque public links in previews, clipboard values and the
printed QR matrix, without an event UUID or query parameter. Legacy events must
save to prepare links before previewing or printing. The fixture also checks v2
exports and that clients never submit public tokens on create/update. Scan checks
preserve existing online GT codes and old event links while accepting QT tokens.
Both suites run in the cloud image-publishing checks.

Run the guest checkout suite in both cloud (`VITE_LOCAL_ONLY=false`) and local
(`VITE_LOCAL_ONLY=true`) modes. It verifies a single submit action, no payment/NFC
requests, cart recovery and duplicate-click prevention. For local checkout, serve with `VITE_API_URL=/api` and `VITE_LOCAL_ONLY=true` on
`http://127.0.0.1:18181`, then run:

```sh
node tests/guest-menu-browser-smoke.mjs
node tests/mobile-layout-browser-smoke.mjs
node tests/auth-layout-browser-smoke.mjs
```

Override origins with `QR_TEST_URL` or `GUEST_TEST_URL`. Use local test servers;
the suites intercept API calls and verify that customers and cloud management
never make unintended external requests.

The mobile layout suite checks 320×568, 390×844, 844×390 and 1440×900 in
English and Greek, plus reduced motion. It captures landing, category navigation,
cart, modifiers, active orders and confirmation screens. Checks cover pinned
headers, horizontal overflow, text/container bounds, visible footer controls,
animation samples, real touch swipes, vertical scrolling and handle dismissal.
Use `MOBILE_LAYOUT_THEME=dark` for a dark-theme run; `MOBILE_LAYOUT_VIEW` and
`MOBILE_LAYOUT_LANGUAGES` can narrow a follow-up check. Artifacts default to the
ignored Pi release `artifacts/mobile-polish` directory. Set `MOBILE_TEST_URL` to
override the local origin. The login suite checks eight viewport/language cases,
keyboard focus, input sizing, password reveal/change and drawer focus return.
The Architect suite also checks responsive assignment cards and pinned actions
at all four sizes. Browser emulation does not reproduce a physical phone's
keyboard, browser bars or display cutout; verify these at venue acceptance.

The Core deployment bundle also contains `tests/container-smoke.mjs`, which
checks the actual isolated PostgreSQL/Core/Front stack with Noor data, local
login, event readiness, QR resolution and anonymous orders. It uses private
`.env.test` credentials and writes only to that local test installation.

Order recovery and local operations use the pinned `playwright-core` development
dependency. Install Chromium with `npx playwright-core install chromium`, serve
with `VITE_API_URL=/api VITE_LOCAL_ONLY=true` at `http://127.0.0.1:18182`, and run:

```sh
node tests/order-recovery-browser-smoke.mjs
node tests/local-operations-browser.mjs
```

Both suites use synthetic API responses and run before image publication in
GitHub Actions. They exercise lost responses, reloads and explicit retries,
saved-cart recovery, staff permissions, repeated print actions, stale health
status, and small-screen layouts in English/Greek. They never send orders or
print jobs to a real venue. `CHROME_PATH` can point to an existing local Chrome
installation; `PLAYWRIGHT_MODULE` can override the browser library location.

Table-visit billing uses the same local fixture server on port 18182:

```sh
node tests/customer-billing-browser.mjs
node tests/billing-report-browser.mjs
node tests/staff-billing-browser.mjs
```

The customer suite checks bill requests, retries, visit closure, explicit new
visits and transfers without granting access to another party. The manager suite
checks separate sales/collections/balances, retained data after failed refresh,
and English/Greek layouts at phone, landscape and desktop sizes. Pure visit
storage and ended-visit isolation checks also run through `npm run test:unit`.
These fixtures simulate a reachable LAN while the browser reports no internet.
The staff suite covers full and partial payments, item selection, duplicate
clicks and lost responses, stale balances, transfers, legacy-order review and
role restrictions. Money parsing rejects invalid precision rather than silently
rounding what a staff member entered.

Architect venue-user loading uses a cloud-mode fixture server with
`VITE_API_URL=/api VITE_LOCAL_ONLY=false` on port 18186:

```sh
node tests/architect-store-users-browser.mjs
```

This read-only synthetic suite checks that the QR pool and venue overview do not
request local staff, an unavailable Pi is identified by venue, online staff
remain editable, and delayed responses cannot overwrite another venue or view.
It blocks external requests and API writes. Failure artifacts default to the
system temporary directory; `ARCHITECT_TEST_URL` and `ARCHITECT_ARTIFACTS` override
the local server and artifact directory.

The same cloud-mode fixture server supports Cook cancellation recovery:

```sh
node tests/cook-cancel-browser.mjs
```

It verifies translated network and billing errors, preservation of the order
after failed cancellation, recovery of the button, and successful explicit retry
in English and Greek. All responses are synthetic; no real orders are changed.
Use `COOK_TEST_URL` to override the local origin. Failure artifacts default to the
system temporary directory or `COOK_ARTIFACTS`.
