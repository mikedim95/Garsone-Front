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

For local checkout, serve with `VITE_API_URL=/api` and `VITE_LOCAL_ONLY=true` on
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
