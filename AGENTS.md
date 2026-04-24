# AGENTS.md — PocketBase E-Commerce with PortOne

## Tech Stack
- Backend: PocketBase v0.36.9 (single Go binary, SQLite embedded)
- Static Site Generator: Hugo v0.160.1 (product catalog, SEO pages)
- Dynamic Pages: Uses Hugo-generated static HTML layouts as the base shell, with only routes requiring dynamic data intercepted by PocketBase JSVM custom routes (routerAdd + JS template literals), which inject and replace the relevant content server-side (no PocketPages — static assets served by PocketBase, layout/partial rendering built with custom render helper)
- Payment: PortOne V2 (Browser SDK via CDN + REST API for server verification)
- Frontend Interactivity: HTMX 2.x + Alpine.js 3.x (no React, no Vue, no SPA)
- Cart: Client-side localStorage via Alpine.js (no backend cart dependency)
- Styling: Tailwind CSS via CDN (no Node.js dependency)

## Architecture Rules
- Everything runs inside a single PocketBase binary — no separate servers
- Hugo builds static output into pb_public/ directory
- All dynamic routes live in pb_hooks/*.pb.js using routerAdd()
- HTML templates are JS template literals inside pb_hooks/templates/*.js
- NEVER use npm packages inside JSVM — PocketBase Goja engine is NOT Node.js
- NEVER use async/await or fetch() in JSVM — use $http.send() for HTTP calls
- NEVER use PocketPages library — we replicate its pattern natively

## PocketBase JSVM Constraints
- Engine: Goja (ES2021, synchronous only)
- Available globals: $app, $http, $security, $filesystem, $apis, $os
- Route registration: routerAdd("METHOD", "/path/{param}", handler, ...middlewares)
- HTML response: e.html(200, htmlString)
- JSON response: e.json(200, object)
- Auth check: e.auth (null if guest)
- Request body: e.requestInfo().body
- Query params: e.request.url.query().get("key")
- Outbound HTTP: $http.send({ method, url, headers, body })
- Static serving: $apis.static("/path", false) with {path...} wildcard

## PortOne Integration Rules
- Payment initiation: 100% client-side via PortOne Browser SDK CDN script
- Use forceRedirect: true for all payments (unified PC + mobile flow)
- Server verification: $http.send() GET to https://api.portone.io/payments/{paymentId}
- Auth header format: "Authorization": "PortOne " + API_SECRET
- Webhook endpoint: routerAdd("POST", "/api/payment/webhook", handler)
- Webhook verification: Standard Webhooks spec (HMAC-SHA256 manual implementation)
- Webhook headers to check: webhook-id, webhook-timestamp, webhook-signature
- NEVER use @portone/server-sdk in JSVM — it requires Node.js

## File Structure
pb_public/              ← Hugo output (static catalog, served by PocketBase)
pb_hooks/
  routes.pb.js          ← Dynamic route registration (checkout, orders, order-prep API)
  portone.pb.js         ← PortOne webhook + payment verification routes
  templates/
    layout.js           ← Base HTML layout with dark mode + Alpine.js cart sidebar
    checkout.js         ← Checkout page (reads localStorage cart, calls /api/orders/prep, invokes PortOne SDK)
    order-complete.js   ← Order completion page
    my-orders.js        ← User order history
  helpers/
    render.js           ← Simple layout-slot string replacement function
    portone-verify.js   ← HMAC-SHA256 webhook signature verifier
pb_data/                ← SQLite DB + uploaded files (gitignored)
pb_migrations/          ← Schema and seed data migrations
hugo/                   ← Hugo source (content, themes, config)
  content/products/     ← Product markdown files (SEO/static fallback)
  layouts/
    index.html          ← Homepage catalog (Alpine.js + fetch from PocketBase REST API)
    login/single.html   ← Login/register page (Alpine.js + PocketBase JS SDK)
  hugo.toml             ← Hugo config with publishDir = "../pb_public"

## PocketBase Collections (DB Schema)
- users (auth collection): email, name, nickname, address, phone
- products: name, slug, description, price, images (file), stock, category (relation) — **listRule/viewRule: public**
- categories: name, slug, sort_order — **listRule/viewRule: public**
- orders: user (relation→users), status (pending/paid/cancelled/refunded), total_amount, portone_tx_id, guest_info (JSON), created
- order_items: order (relation→orders), product (relation→products), quantity, unit_price

> **Note:** `cart_items` collection은 더 이상 사용하지 않음. 장바구니는 클라이언트 localStorage로 관리.

## Security Rules
- NEVER hardcode PortOne API_SECRET — read from environment or PocketBase settings
- Always verify payment amount server-side (compare DB order total vs PortOne response)
- Webhook signature must be verified BEFORE processing any payment state change
- /api/orders/prep endpoint validates cart items against DB prices/stock before creating pending order
- Admin/superuser routes require $apis.requireSuperuserAuth()

## Code Style
- Use const over let — never use var
- Keep each pb_hooks/*.pb.js file under 200 lines
- Template files export a single function that returns HTML string
- All money values stored as integers (Korean Won, no decimals)
- Comments in English, user-facing strings in Korean (ko-KR)

## Git Conventions
- Conventional commits: feat:, fix:, docs:, refactor:
- Commit Hugo source and pb_hooks/ — gitignore pb_data/ and pb_public/

## PocketBase JSVM Gotchas & Best Practices
1. **Migration Schema Definition (v0.23+):**
   - The `Dao` object is no longer available. Models are strictly typed.
   - Use `new Collection(...)` and `app.save(collection)`.
   - Never use global `$app` inside the `migrate((app) => {...})` closure; use the injected `app` parameter.
2. **Goja Closure & Scope Loss in Route Handlers:**
   - Variables declared with `const` or `let` at the root of a `.pb.js` hook file may lose their scope inside async `routerAdd` callbacks, resulting in `ReferenceError`.
   - **Rule:** Always place `require()` statements *inside* the route handler's callback scope (e.g., inside the `(c) => { ... }` block) to ensure references don't break when routes are accessed.
   - Example: 
     ```javascript
     routerAdd("GET", "/path", (c) => {
         const module = require(`${__hooks}/module.js`);
         return c.html(200, module(c));
     });
     ```
3. **Sort Parameter Constraints (JSVM + REST API):**
   - Using base system fields like `"-created"` in `$app.findRecordsByFilter("collection", "1=1", "-created", ...)` can result in a fatal `GoError: invalid sort field "created"` in Goja hook callbacks.
   - The same issue applies to the **REST API**: `GET /api/collections/{name}/records?sort=-created` returns **400 Bad Request** in certain PocketBase versions.
   - **Rule:** Omit the `sort` parameter entirely in both JSVM `findRecordsByFilter()` and client-side `fetch()` calls unless sorting by a custom (non-system) field. Use `""` (empty string) for the sort parameter in JSVM.
4. **Client-Side UUID Tracking on Localhost HTTP:**
   - In strict browsers (e.g. Safari), `crypto.randomUUID()` evaluates to `undefined` on `http://127.0.0.1` because it is not always recognized as a Secure Context compared to `localhost`.
   - **Rule:** Always provide a fallback generation string (e.g. `Math.random().toString(36)`) and use `SameSite=Lax` cookies when tracking sessions (like guest carts) locally without HTTPS to prevent silent JavaScript runtime failures.
5. **Static Frontend vs JSVM Routing Separation:**
   - **Static Pages:** Routes requiring no server-side compilation (e.g. `index`, `login/register`, `catalog`) MUST be compiled statically via Hugo into `pb_public`.
   - **JSVM Pages:** ONLY routes requiring strict server-side logic (e.g. calculating precise `/cart` subtotals or verifying `/checkout` pre-flight PortOne logic) should use `routerAdd()` + `templates/` hooks.
6. **Alpine.js Race Conditions across CDNs:**
   - When using `<script defer src="...alpine.js">` alongside direct `x-data` bindings that require JS initialization logic, avoid using `Alpine.data()` inside `alpine:init` listeners if the component loading order is unpredictable.
   - **Rule:** Lift the component data model into a plain vanilla global function (e.g., `function authForm() { return { ... } }`) inside an inline script placed linearly before or near the component to ensure bullet-proof initialization free of race-condition crashes.
7. **Hugo Rebuild Necessity for Shared UI Elements:**
   - Modifying layout files under `hugo/layouts/` (e.g., adding sidebar modals, changing `<nav>` logic) will NOT automatically reflect in the active browser, because PocketBase serves the static `/pb_public` directory.
   - **Rule:** Always run `hugo` inside the `/hugo` directory immediately after editing any global HTML layouts or static Markdown pages so that changes are correctly compiled to `pb_public` and picked up by `/pocketbase serve`.
8. **PocketBase Collection API Access Rules:**
   - Collections default to superuser-only access. If the frontend needs to read data via REST API (e.g., product catalog), `listRule` and `viewRule` MUST be set to `""` (empty string = public).
   - **Rule:** After creating collections, always verify API access rules. Use a migration script or the Admin UI (`/_/`) to set appropriate rules. Test with `curl` before relying on frontend fetch.
9. **Checkout Flow — localStorage Cart to Server Order:**
   - The checkout process sends the client-side `localStorage` cart array to `POST /api/orders/prep`.
   - The server validates each item against the DB (price, stock), creates a `pending` order + order_items, and returns `{ orderId, amount }`.
   - The client then calls PortOne SDK with the returned orderId and amount.
   - On successful payment, the client clears localStorage cart and redirects to `/payment/complete`.
   - PortOne webhook independently verifies and updates order status to `paid`.
10. **Avoid PocketBase JS SDK on Static Pages:**
    - The PocketBase JS SDK UMD bundle can conflict with Alpine.js initialization or add unnecessary payload for simple data reads.
    - **Rule:** For read-only data fetching (catalog listings), prefer native `fetch('/api/collections/{name}/records')` over the PocketBase JS SDK. Reserve the SDK for pages that need auth operations (login, register).
