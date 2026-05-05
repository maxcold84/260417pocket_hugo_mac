# PocketBase JSVM Guidelines

## Core Constraints
- Engine: Goja (ES2021, synchronous only)
- Available globals: `$app`, `$http`, `$security`, `$filesystem`, `$apis`, `$os`
- Route registration: `routerAdd("METHOD", "/path/{param}", handler, ...middlewares)`
- HTML response: `e.html(200, htmlString)`
- JSON response: `e.json(200, object)`
- Auth check: `e.auth` (null if guest)
- Request body: `e.requestInfo().body`
- Query params: `e.request.url.query().get("key")`
- Outbound HTTP: `$http.send({ method, url, headers, body })`
- Static serving: `$apis.static("/path", false)` with `{path...}` wildcard
- NEVER use npm packages inside JSVM — PocketBase Goja engine is NOT Node.js
- NEVER use async/await or fetch() in JSVM — use `$http.send()` for HTTP calls
- NEVER use PocketPages library — we replicate its pattern natively

## Gotchas & Best Practices
1. **Migration Schema Definition (v0.23+)**:
   - The `Dao` object is no longer available. Models are strictly typed.
   - Use `new Collection(...)` and `app.save(collection)`.
   - Never use global `$app` inside the `migrate((app) => {...})` closure; use the injected `app` parameter.
2. **Goja Closure & Scope Loss in Route Handlers**:
   - Variables declared with `const` or `let` at the root of a `.pb.js` hook file may lose their scope inside async `routerAdd` callbacks, resulting in `ReferenceError`.
   - **Rule:** Always place `require()` statements *inside* the route handler's callback scope (e.g., inside the `(c) => { ... }` block) to ensure references don't break when routes are accessed.
3. **Sort Parameter Constraints (JSVM + REST API)**:
   - Using base system fields like `"-created"` in `$app.findRecordsByFilter("collection", "1=1", "-created", ...)` can result in a fatal `GoError: invalid sort field "created"` in Goja hook callbacks.
   - The same issue applies to the **REST API**: `GET /api/collections/{name}/records?sort=-created` returns **400 Bad Request** in certain PocketBase versions.
   - **Rule:** Omit the `sort` parameter entirely in both JSVM `findRecordsByFilter()` and client-side `fetch()` calls unless sorting by a custom (non-system) field. Use `""` (empty string) for the sort parameter in JSVM.
4. **Superuser Authentication in JS SDK (v0.23+)**:
    - The `pb.admins` API has been removed in PocketBase v0.23+. Admin users are now stored in the `_superusers` collection.
    - **Rule:** To authenticate as an admin, use `pb.collection('_superusers').authWithPassword(email, password)` instead of `pb.admins.authWithPassword()`.
    - **Rule:** To check if the current user is an admin, check `pb.authStore.isSuperuser` instead of `pb.authStore.isAdmin`. Use a fallback for compatibility: `pb.authStore.isSuperuser || pb.authStore.isAdmin`.
5. **Custom API Route Authentication via SDK**:
    - Using native `fetch()` with manually crafted `Authorization: Bearer` headers can lead to parsing errors or 401 Unauthorized responses with PocketBase v0.23's strict middlewares.
    - **Rule:** Always use the PocketBase SDK's `pb.send('/api/custom-route', { method: 'POST' })` method instead of native `fetch()` when calling authenticated custom routes. The SDK automatically and correctly attaches the JWT.
6. **JSVM File I/O — Use `$os.writeFile` Over Shell Commands**:
    - Using `$os.cmd("sh", "-c", "cat << 'EOF' > file.md ...")` to write files from JSVM is fragile. It breaks when file paths contain **Korean characters, spaces, or special characters** because the shell interprets them as command delimiters.
    - **Rule:** Always use `$os.writeFile(filePath, content, 0o644)` for creating/overwriting files from JSVM. It writes directly to the filesystem without invoking a shell, safely handling any Unicode path or content.
    - **Rule:** Avoid backtick template literals for multi-line content strings in Goja JSVM; use string concatenation (`'...' + variable + '...'`) instead, as template literal newlines can be misinterpreted.
7. **Bootstrap Hooks & Collection Modification (v0.36+)**:
    - `onAfterBootstrap` has been renamed to `onBootstrap`.
    - **Rule:** You MUST call `e.next()` at the start of `onBootstrap` to allow the bootstrap process to continue.
    - **Rule:** When modifying collections programmatically (e.g., setting API rules), use direct property assignment (e.g., `collection.listRule = "..."`) instead of `.set()`, and use `e.app.save(collection)` instead of `$app.save()`.
    - **Example:**
      ```javascript
      onBootstrap((e) => {
          e.next();
          const collection = e.app.findCollectionByNameOrId("name");
          collection.listRule = "@request.auth.id != ''";
          e.app.save(collection);
      });
      ```
