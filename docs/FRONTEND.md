# Frontend & Alpine.js Guidelines

## Stack
- Frontend Interactivity: HTMX 2.x + Alpine.js 3.x (no React, no Vue, no SPA)
- Cart: Client-side localStorage via Alpine.js (no backend cart dependency)
- Styling: Tailwind CSS via CDN (no Node.js dependency)

## Best Practices
1. **Client-Side UUID Tracking on Localhost HTTP**:
   - In strict browsers (e.g. Safari), `crypto.randomUUID()` evaluates to `undefined` on `http://127.0.0.1` because it is not always recognized as a Secure Context compared to `localhost`.
   - **Rule:** Always provide a fallback generation string (e.g. `Math.random().toString(36)`) and use `SameSite=Lax` cookies when tracking sessions (like guest carts) locally without HTTPS to prevent silent JavaScript runtime failures.
2. **Alpine.js Race Conditions across CDNs**:
   - When using `<script defer src="...alpine.js">` alongside direct `x-data` bindings that require JS initialization logic, avoid using `Alpine.data()` inside `alpine:init` listeners if the component loading order is unpredictable.
   - **Rule:** Lift the component data model into a plain vanilla global function (e.g., `function authForm() { return { ... } }`) inside an inline script placed linearly before or near the component to ensure bullet-proof initialization free of race-condition crashes.
3. **Avoid PocketBase JS SDK on Static Pages**:
    - The PocketBase JS SDK UMD bundle can conflict with Alpine.js initialization or add unnecessary payload for simple data reads.
    - **Rule:** For read-only data fetching (catalog listings), prefer native `fetch('/api/collections/{name}/records')` over the PocketBase JS SDK. Reserve the SDK for pages that need auth operations (login, register).
4. **Alpine.js Template Constraints (`<template x-if>`)**:
    - The `<template x-if>` directive in Alpine.js strictly requires **only one root element** inside it.
    - **Rule:** If you place another `<template>` (such as `<template x-teleport="body">`) alongside a `<div>` inside an `x-if` block, Alpine.js will silently drop the second element, breaking the UI. Always move `x-teleport` templates completely outside of `x-if` blocks, or wrap everything in a single parent element.
5. **PocketBase Payload Parsing & Required Number Fields**:
    - Alpine.js v3 uses Proxy objects for its reactive data (`x-data`). Passing these Proxies directly into the PocketBase JS SDK (`pb.collection().create(this.data)`) can sometimes lead to missing payload fields.
    - **Rule:** Strip Alpine Proxies before sending via `JSON.parse(JSON.stringify(this.data))`.
    - **Rule:** In PocketBase, `required: true` on a `NumberField` strictly prevents `0` (zero) as it is considered the "empty" value. Ensure number inputs properly cast empty strings and 0 to actual numbers, and handle 0-value rejections if the field is marked required.
6. **Korean IME Composition and Alpine.js `$watch`**:
    - Korean text input uses an IME (Input Method Editor) that **composes characters in place** (e.g., `ㅇ` → `이` → `이ㅁ` → `이미`). Unlike English typing where each keystroke appends a new character, Korean characters transform the **same position** during composition.
    - This breaks any `$watch`-based auto-generation logic that compares the current value with a "previous character removed" version (e.g., `val.substring(0, val.length - 1)`), because the string length doesn't change during composition — only the last character mutates.
    - **Rule:** Never use character-by-character string comparison for auto-slug or auto-fill features when Korean input is expected. Instead, use a **flag-based approach**: track whether the user has manually edited the target field (e.g., `_slugTouched = false`), and auto-generate only while the flag is `false`. Set the flag to `true` on the target field's `@input` event, and reset it when the form is re-opened.
7. **PocketBase v0.23+ AuthStore LocalStorage Structure**:
    - In PocketBase v0.23+, the `authStore` model structure changed. When accessing user data directly from `localStorage.getItem('pocketbase_auth')` without the SDK, the user data object is now stored under the `record` key instead of the `model` key.
    - **Rule:** When parsing `pocketbase_auth` manually (e.g., in inline scripts or Alpine.js components where the SDK might not be fully initialized), always check for both `record` and `model` to ensure compatibility and prevent null reference errors: `const userObj = (authData && authData.record) || (authData && authData.model);`
8. **Manual Authorization Header in `fetch()`**:
    - PocketBase's custom API routes (`routerAdd`) require an explicit `Authorization: Bearer <token>` header if they use `e.auth`. Unlike the SDK's `pb.send()`, native `fetch()` does NOT attach the token automatically.
    - **Rule:** When calling custom endpoints like `/api/orders/prep` from the frontend, manually extract the token from `localStorage` and include it in the headers to avoid being treated as a Guest.
    - **Rule:** If the checkout sends `couponId`, do not trust any client-side discount amount. The UI may show an estimate, but PortOne must receive only the `amount` returned by `/api/orders/prep`.
9. **Back-Relation Expansion Syntax**:
    - To expand related records from a collection pointing TO the current one, use the `collection_via_field` syntax.
    - **Example:** `pb.collection('orders').getList(1, 50, { expand: 'order_items_via_order' })` where `order_items` has an `order` field.
10. **Client-Side Dynamic Page Pattern**:
    - For pages requiring fresh user data (e.g., order history), avoid server-side rendering routes. Instead, create a static Hugo page and use Alpine.js + PocketBase SDK to fetch data on `init()`. This avoids cache staleness and matches the `profile` page pattern.
11. **Alpine.js Reactivity — Never Add Properties to External Objects**:
    - Alpine.js only tracks properties that exist at `x-data` initialization time. Dynamically adding properties like `order._flag = true` on objects fetched from PocketBase will NOT trigger `x-show` or other reactive updates.
    - **Rule:** Always store UI state (confirm dialogs, loading flags, active selections) in **component-level properties** declared in the `x-data` return object (e.g., `confirmId: '', cancelling: false`), not on individual array items from API responses.
12. **Avoid Native `confirm()` / `alert()` — Use Inline UI**:
    - Browser extensions (e.g., subtitle tools, ad blockers) can intercept and block `window.confirm()` and `window.alert()`, making buttons appear broken.
    - **Rule:** Replace `confirm()` with Alpine.js inline confirmation UI (show/hide a confirm box using reactive state). Replace `alert()` with a toast notification (a fixed-position div with `setTimeout` auto-dismiss).
13. **`x-ref` Does Not Work Inside `<template x-teleport>`**:
    - Alpine.js `$refs` bindings are scoped to the component's original DOM tree. Elements inside `<template x-teleport="body">` are moved out of the component's scope, making `$refs` return `undefined`.
    - **Rule:** For file inputs inside teleported modals, use `@change` event handlers to capture files into component state arrays (e.g., `_addImageFiles`), then build `FormData` from that state on submit. Never rely on `$refs` or `document.getElementById()` for teleported elements.
14. **Native HTML5 Drag-and-Drop Pattern**:
    - For reorderable lists without external libraries, use the native `draggable="true"` attribute with `@dragstart`, `@dragover.prevent`, `@drop.prevent`, and `@dragend` Alpine.js event handlers.
    - **Rule:** Store the dragged item index in component state (e.g., `_draggedIndex`). On drop, splice the item from its old position and insert at the new position. Always reassign the array (`this.list = [...list]`) to trigger Alpine reactivity.
    - **Rule:** Add `pointer-events: none` to child elements (images, badges) to prevent them from interfering with drag events on the parent container.
    - **Rule:** If you dynamically apply `pointer-events: none` to descendants of the dragged element to prevent flickering, **never** change the state synchronously inside the `dragstart` handler. Doing so causes Chrome/Safari to immediately abort/cancel the drag gesture. Instead, defer the state update using `setTimeout(() => { this.isDragging = true; }, 0)`.
    - **Rule:** For table row reordering, do not apply `pointer-events: none` to table cells (`td`) themselves. Doing so will cause drag/drop pointer events to pass completely through the row, preventing `@dragover` and `@drop` handlers on the `tr` from firing. Instead, target only the cell descendants: `.dragging-active .product-drag-row td * { pointer-events: none; }`.
15. **PocketBase v0.36 REST API Sort Limitation**:
    - Multi-field sort parameters (e.g., `sort=sort_order,created`) cause a 500 error in PocketBase v0.36. Only single-field sort is supported via the REST API.
    - **Rule:** Always use single-field sort in `pb.collection().getList()` options: `{ sort: 'sort_order' }`. If secondary sorting is needed, sort client-side after fetching.

16. **JS SDK Cookie Export (`exportToCookie`) & SSR Integration Gotchas**:
    - By default, calling `pb.authStore.exportToCookie({ secure: false })` outputs a cookie header string that sets `HttpOnly` to `true`. Browsers **strictly prevent** client-side JavaScript (`document.cookie = ...`) from writing `HttpOnly` cookies.
    - **Rule:** When exporting cookies client-side for SSR route verification, you **must explicitly pass `httpOnly: false`**:
      ```javascript
      document.cookie = pb.authStore.exportToCookie({ secure: false, httpOnly: false });
      ```
    - **Rule:** In single-page app (SPA) environments where Alpine.js restores credentials directly from `localStorage` on page load, the manual `login()` function is completely bypassed. Ensure cookie exports are also placed inside the Alpine.js component's `init()` method to guarantee session synchronization whenever the admin refreshes or directly navigates to an SSR page.

17. **CMS Order Management Uses Guarded Custom Routes**:
    - Never update order status from the CMS with `pb.collection('orders').update(id, { status })`. That bypasses the server-side payment-state guard.
    - **Rule:** Use `pb.send('/api/cms/orders/' + id + '/status', { method: 'POST', body: { status } })` for list-page status changes and `/api/cms/orders/{id}/update` for guarded detail-page edits.
    - **Rule:** The CMS order archive/list must page through all `orders` result pages before calculating counts or filtered views. Do not assume `getList(1, 50)` contains the full archive.
    - **Rule:** For newest-first order display, fetch without `sort: '-created'`, then sort the combined client-side array by the `created` string.

18. **OAuth Button Visibility Must Follow PocketBase Auth Methods**:
    - `hugo.toml` only controls whether a social login button is allowed to render in the static template. It does not configure PocketBase provider credentials.
    - **Rule:** Before showing OAuth buttons, call `pb.collection('users').listAuthMethods()` and only show providers returned by PocketBase. This prevents a visible Google/Kakao button when `users.oauth2.enabled` is true but `oauth2.providers` is empty or `null`.
    - **Rule:** Do not use `async/await` directly in the OAuth click handler. Use a promise chain for `authWithOAuth2()` so strict browsers do not treat the OAuth popup as detached from the user click.
    - **Rule:** OAuth error handling should surface provider configuration failures instead of only displaying a generic "Something went wrong" message.
19. **Static Product Page + Dynamic Comments Pattern**:
    - Product detail pages remain Hugo-generated static pages. Comments are the only dynamic island on the page.
    - **Rule:** Load the PocketBase SDK UMD only on `hugo/layouts/products/single.html` and call custom comment routes with `pb.send()` so the SDK attaches the auth token for logged-in users.
    - **Rule:** Use the Hugo product page slug as the comment API product key. The backend resolves both DB ids and slugs, which prevents stale Markdown frontmatter ids from blocking eligible buyers.
    - **Rule:** Render comment body and author snapshots with `x-text` only. Never inject user comment text with `x-html`.
    - **Rule:** Keep comment UI state (`editingId`, `deleteConfirmId`, loading flags, notices) on the Alpine component instead of mutating fetched comment objects.
    - **Rule:** Comments appear immediately after successful create/update/delete by updating Alpine state; no Hugo rebuild is needed for comment changes.
    - **Rule:** Product ratings live inside the same dynamic island. The UI must send a 1-5 integer rating with comment create/update requests, display rating text with SVG icons (not emoji), and update the returned `summary` in Alpine state so the visible average changes without a rebuild.
    - **Rule:** A logged-in buyer can create one review per product only after the related order is `purchase_confirmed`. If a review already exists, guide the user to edit the existing review instead of posting duplicates.
    - **Rule:** The comment create response may include `couponIssued`, `coupon`, and `couponMessage`. Show the reward message as a notice after the successful create response, but do not attempt to mint or reserve coupons on the client.
20. **Static Product Page + Dynamic Product Inquiries Pattern**:
    - Product detail pages remain Hugo-generated static pages. Inquiries are a second dynamic island on `hugo/layouts/products/single.html` and use the Hugo product slug as the API product key.
    - **Rule:** Call inquiry custom routes with `pb.send()` so logged-in user auth is attached consistently.
    - **Rule:** Render inquiry title, content, author snapshot, and admin answer with `x-text` only. Never inject inquiry text with `x-html`.
    - **Rule:** Keep inquiry UI state (`editingId`, `deleteConfirmId`, loading flags, notices, secret toggles) on the Alpine component instead of mutating fetched records.
    - **Rule:** Secret inquiries must be masked for non-authors: show only locked/private state and answer status, never the title, content, answer, or author snapshot.
    - **Rule:** Users can edit/delete only their own `pending` inquiries. Answered inquiries are read-only on the product page.

21. **Member Order History Purchase Confirmation Pattern**:
    - `/my-orders/` is a static Hugo page with an Alpine.js dynamic order island. It must show the purchase-confirm CTA only for logged-in member orders in `completed` status, never for guest orders.
    - **Rule:** Use `pb.send('/api/orders/{id}/confirm-purchase', { method: 'POST' })` for confirmation so the SDK attaches auth. Keep confirmation and loading state on component-level properties such as `confirmAction` and `confirmingPurchase`.
    - **Rule:** After confirmation, update the local order status to `purchase_confirmed` and refresh `/api/orders/review-state` without requiring a page reload.
    - **Rule:** Product review CTAs must be filtered by the server-returned `canReview` state. A member can review each product only once, even if the product appears in multiple confirmed orders.
    - **Rule:** Show the review reward coupon state per purchased product item (`available`, `reserved`, `used`, `expired`, `void`, or `not_issued`) so the member can tell whether the reward is still pending, already earned, or already used.

22. **Checkout Coupon Pattern**:
    - Logged-in checkout pages may load available coupons with `pb.send('/api/coupons/available')`. Guest checkout must not show coupon controls.
    - **Rule:** Show coupon discounts and final totals as estimates before order prep. The authoritative subtotal, discount, coupon snapshot, and payable amount are the `/api/orders/prep` response.
    - **Rule:** Disable or explain coupon choices that would reduce the payable amount to 0 or below, because this storefront has no zero-payment order flow.
