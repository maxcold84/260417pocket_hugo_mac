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
    - **Rule:** `$os.writeFile()` does not create missing parent directories. Before writing generated files, call `$os.mkdirAll(parentDir, 0o755)` or a project helper such as `cmsUtil.prepareHugoContentTree()`.
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
8. **Reading UTF-8 Files from JSVM**:
    - `$os.readFile("path/to/file")` returns a Go `[]byte` slice. Passing this directly to a template or JSON response can result in a comma-separated array of numbers (e.g., `98,97,115...`).
    - Using `String()` does NOT properly decode UTF-8 characters like Korean, causing encoding corruption.
    - **Rule:** To properly read a UTF-8 file into a JavaScript string inside Goja, map the byte array using `String.fromCharCode`, then decode it:
      ```javascript
      const bytes = $os.readFile("hugo/hugo.toml");
      const binaryStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
      const tomlStr = decodeURIComponent(escape(binaryStr));
      ```

9. **Custom GET Route SSR Authentication & pb_auth Cookie JSON Gotcha**:
    - The `pb_auth` cookie generated by `pb.authStore.exportToCookie()` is not a raw token string! It is a **JSON stringified object** containing both the JWT `token` and the `record`/`model` (e.g. `{"token":"eyJ...","record":{...}}`).
    - Attempting to pass the entire raw cookie value directly to `ev.app.findAuthRecordByToken(token, ...)` will fail since it contains JSON wrappers.
    - **Rule:** Always parse the cookie value as JSON and extract the `token` field first.
    - **Rule:** Token signature verification (`findAuthRecordByToken`) can fail inside the Goja JSVM depending on signature/key mismatches in sandbox setups. Always implement a robust fallback by parsing the JWT claims directly and querying the record by ID:
      ```javascript
      // 1. Extract and parse JSON cookie
      const cookieVal = decodeURIComponent(match[1]);
      let token = cookieVal;
      try {
          const parsed = JSON.parse(cookieVal);
          if (parsed && parsed.token) token = parsed.token;
      } catch (e) {}

      // 2. Perform verification with a robust fallback
      let superuser = null;
      try {
          superuser = ev.app.findAuthRecordByToken(token, superusers);
      } catch (err) {
          // Fallback: decode claims and query by ID
          try {
              const claims = $security.parseUnverifiedJWT(token);
              if (claims && claims.id) {
                  superuser = ev.app.findRecordById("_superusers", claims.id);
              }
          } catch (jwtErr) {}
      }
      ```

10. **Sorting Field Name Syntax Error (`GoError: invalid sort field "+field"`)**:
    - **Issue**: Attempting to sort queries using a leading positive sign `"+"` (e.g. `"+sort_order"`) in `$app.findRecordsByFilter` or client-side fetch sort options triggers a fatal GoError `invalid sort field "+field"` and aborts database transactions.
    - **Rule**: Never use a `+` prefix for ascending sorting in PocketBase. Ascending sorting is specified by the field name alone without any prefix (e.g. `"sort_order"`). Descending sorting is specified by a `-` prefix (e.g. `"-sort_order"`).

11. **Goja Root Scope Function Deallocation (`ReferenceError: <funcName> is not defined` inside Route/Event Callbacks)**:
    - **Issue**: Because Goja (PocketBase's JSVM) processes requests in concurrent, sandboxed context threads, functions declared globally at the root scope of `.pb.js` hook files can lose their scope/reference bindings at runtime. This causes fatal `ReferenceError` crashes when async router or event hook callbacks try to invoke them.
    - **Rule**: Never define helper functions at the root scope of hook files if they are meant to be called inside route/event handlers. Instead:
      - Define helper functions directly inside the callback handler's local scope, or
      - Place helper functions in a dedicated module file in `pb_hooks/utils/` (using standard CommonJS `module.exports`), and `require()` them inside the callback scope at execution time (e.g., `const cmsUtil = require(`${__hooks}/utils/cms.js`);`).

12. **Command Environment PATH Mismatch in PocketBase (`$os.cmd` throws executable file not found in $PATH)**:
    - **Issue**: PocketBase runs inside an isolated, minimal process environment. Path values for custom tools (e.g., Apple Silicon macOS Homebrew path `/opt/homebrew/bin` or standard Linux `/usr/local/bin`) are not present in the process's `$PATH` variable. Running `$os.cmd("executable")` will throw an error and fail.
    - **Rule**: When executing shell commands from JSVM:
      - Provide a list of candidate absolute binary paths (e.g., `/opt/homebrew/bin/hugo`, `/usr/local/bin/hugo`) and test/execute them sequentially inside a `try/catch` loop.
      - **Transaction Safety**: Always wrap external command executions in a local `try/catch` block inside database route handlers (like creation, deletion, or settings updates) to prevent command failures from aborting crucial database transactions. Return a clean `200 OK` with a non-blocking warning message if the tool fails, rather than a fatal `500 Internal Server Error`.

13. **Go HTML Template Nested Property Evaluation Crash (`can't evaluate field in type interface {}` on JS Objects)**:
    - **Issue**: When a raw, nested JavaScript object (like parsed JSON from `guest_info` or standard JS Object) is passed as-is to the Go `html/template` rendering context, the template engine interprets it as an opaque `interface {}` type. Attempting to evaluate its nested parameters using dot-chain notation (e.g. `{{.guestInfo.name}}`) inside the HTML layout triggers a reflection crash (500 Error).
    - **Rule**: Never pass nested JS Objects to the Go template engine for dot-chain evaluation.
      - Always flatten (preprocess) the object's properties on the backend JSVM router first, extracting nested attributes into explicit, 1-level standalone variables (e.g., `isGuest`, `guestName`, `guestPhone`).
      - Pass these standalone primitive parameters to the render parameters block and evaluate them directly (e.g. `{{.guestName}}`).

14. **Goja VM JSON Field Map Serialization & Access gotcha (`types.JsonMap` deallocation and blank fields)**:
    - **Issue**: PocketBase JSON fields (like `guest_info`) return a custom Go structure (`types.JsonMap`) inside JSVM. In Goja VM, accessing attributes directly (e.g. `rawGuest.name` or `rawGuest["name"]`) will return `null` or `undefined`. Furthermore, using `JSON.stringify(rawGuest)` will yield an empty object `{}` or raw byte array sequences, deallocating the actual JSON content.
    - **Rule**: Never attempt to serialize custom types.JsonMap fields directly or access keys without parsing. Always convert the `types.JsonMap` field to string via `rawGuest.toString()` first, which correctly returns the standard JSON string, then parse it back to a standard JS Object:
      ```javascript
      const rawGuest = order.get("guest_info");
      let guestInfo = null;
      if (rawGuest) {
          const jsonStr = (typeof rawGuest === "string") ? rawGuest : rawGuest.toString();
          if (jsonStr) {
              guestInfo = JSON.parse(jsonStr);
          }
      }
      ```

15. **Category Delete Requests Must Clean Dependent Static State**:
    - **Issue**: Deleting a `categories` record directly from PocketBase Admin/API bypasses the custom CMS route that normally removes the `hugo.toml` block, clears `products.category`, regenerates product Markdown, and rebuilds Hugo.
    - **Rule**: Register a collection-scoped request hook with `onRecordDeleteRequest((e) => { ... }, "categories")`.
      - Clear affected `products.category` values before `e.next()` so required/relation constraints cannot leave dangling category references.
      - After `e.next()`, remove the matching `[[params.categories]]` TOML block so the next CMS rebuild does not recreate the category from the source config.
      - Do not run Hugo in the low-level delete hook. Defer product Markdown sync and static output generation to the explicit custom CMS **동기화 및 사이트 빌드** action.
