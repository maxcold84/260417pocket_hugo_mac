# AGENTS.md — PocketBase E-Commerce with PortOne

## Tech Stack
- Backend: PocketBase v0.36.9 (single Go binary, SQLite embedded)
- Static Site Generator: Hugo v0.160.1 (product catalog, SEO pages)
- Dynamic Pages: PocketBase JSVM native hooks (NO PocketPages — we implement the pattern ourselves)
- Payment: PortOne V2 (Browser SDK via CDN + REST API for server verification)
- Frontend Interactivity: HTMX 2.x + Alpine.js 3.x (no React, no Vue, no SPA)
- Styling: Tailwind CSS v4 via Hugo css.Build (no Node.js dependency)

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
pb_public/              ← Hugo output (static catalog)
pb_hooks/
  routes.pb.js          ← Dynamic route registration (cart, checkout, orders)
  portone.pb.js         ← PortOne webhook + payment verification routes
  templates/
    layout.js           ← Base HTML layout with template literal
    cart.js             ← Full Cart page template
    cart-fragment.js    ← Cart sidebar modal HTML fragment for fetch
    checkout.js         ← Checkout page (includes PortOne SDK script)
    order-complete.js   ← Order completion page
    my-orders.js        ← User order history
  helpers/
    render.js           ← Simple layout-slot string replacement function
    portone-verify.js   ← HMAC-SHA256 webhook signature verifier
pb_data/                ← SQLite DB + uploaded files (gitignored)
hugo/                   ← Hugo source (content, themes, config)
  content/products/     ← Product markdown files
  layouts/              ← Hugo templates
  hugo.toml             ← Hugo config with publishDir = "../pb_public"

## PocketBase Collections (DB Schema)
- users (auth collection): email, name, address, phone
- products: name, slug, description, price, images (file), stock, category (relation)
- categories: name, slug, sort_order
- cart_items: user (relation→users), product (relation→products), quantity
- orders: user (relation→users), payment_id, status (pending/paid/cancelled/refunded), total_amount, items (JSON), portone_tx_id, created
- order_items: order (relation→orders), product (relation→products), quantity, unit_price

## Security Rules
- NEVER hardcode PortOne API_SECRET — read from environment or PocketBase settings
- Always verify payment amount server-side (compare DB order total vs PortOne response)
- Webhook signature must be verified BEFORE processing any payment state change
- Cart operations require authenticated user ($apis.requireAuth() middleware)
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
3. **findRecordsByFilter Sort Parameter Constraints (v0.23+):**
   - Using base system fields like `"-created"` in `$app.findRecordsByFilter("collection", "1=1", "-created", ...)` can result in a fatal `GoError: invalid sort field "created"` in Goja hook callbacks.
   - **Rule:** To avoid crashing list renderings or silently catching empty arrays, explicitly use `""` (empty string) for the sort parameter if you don't naturally need sorting.
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
