# AGENTS.md — PocketBase E-Commerce with PortOne

**CORE DIRECTIVE**: This project uses a hybrid architecture (PocketBase backend/static file server + Hugo static generator + HTMX/Alpine.js frontend). No separate Node.js servers, no React/Vue/SPA. Everything runs inside a single PocketBase Go binary.

## 1. Quick Tech Stack
- **Backend**: PocketBase v0.36.9 (Goja JSVM, SQLite)
- **Frontend**: Hugo v0.160.1 (Static output), HTMX 2.x, Alpine.js 3.x, Tailwind CSS (CDN)
- **Payment**: PortOne V2 (Client-side SDK + Server-side Webhook/Verify)

## 2. Progressive Disclosure (READ THESE BEFORE CODING)
To keep instructions concise, detailed rules and gotchas are separated into documents. If your task involves any of these topics, you **MUST read the corresponding file** before making changes:

- **PocketBase Custom Routes & JSVM**: Read `docs/POCKETBASE_JSVM.md` (Crucial for `pb_hooks` routing, file I/O, and Goja constraints)
- **Database Schema & Security**: Read `docs/DATABASE.md` (Collections, list/view rules, AuthStore changes)
- **PortOne Payment Integration**: Read `docs/PORTONE.md` (Payment flow, Webhook, Phone number handling)
- **Frontend & Alpine.js**: Read `docs/FRONTEND.md` (Cart localStorage, IME composition, Template constraints)
- **Hugo CMS Rebuild & Architecture**: Read `docs/HUGO_ARCHITECTURE.md` (Product-to-Markdown sync, Image caching, File structure)

## 3. Strict Golden Rules
1. **Never use npm packages inside JSVM**. PocketBase Goja engine is NOT Node.js.
2. **Never use async/await or fetch() in JSVM**. Use `$http.send()` for HTTP calls.
3. **Never use PocketPages library**. We replicate its pattern natively.
4. **Use `const` over `let` — never use `var`.**
5. **Git Conventions**: Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`). Commit Hugo source and `pb_hooks/`. Gitignore `pb_data/` and `pb_public/`.
6. **Dynamic Data Pattern**: For user-specific historical data (orders, profile), prefer **client-side dynamic fetching** (Alpine.js + PB SDK) over server-side rendered routes to ensure data freshness and UI consistency.
