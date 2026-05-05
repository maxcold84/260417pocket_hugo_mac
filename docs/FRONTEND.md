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
9. **Back-Relation Expansion Syntax**:
    - To expand related records from a collection pointing TO the current one, use the `collection_via_field` syntax.
    - **Example:** `pb.collection('orders').getList(1, 50, { expand: 'order_items_via_order' })` where `order_items` has an `order` field.
10. **Client-Side Dynamic Page Pattern**:
    - For pages requiring fresh user data (e.g., order history), avoid server-side rendering routes. Instead, create a static Hugo page and use Alpine.js + PocketBase SDK to fetch data on `init()`. This avoids cache staleness and matches the `profile` page pattern.
