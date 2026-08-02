# OpenWiki Quickstart

This repository is a hybrid **PocketBase + Hugo e-commerce storefront** with a custom CMS, dynamic checkout/payment flows, and a static storefront published into `pb_public/`.

## What this wiki covers

- How the app is structured: PocketBase JSVM hooks, Hugo themes/layouts, generated public output, and local data storage.
- How checkout, PortOne payment verification, refunds, coupons, guest ordering, comments, and inquiries work.
- How CMS rebuilds sync PocketBase data back into Hugo content and themes.
- The security boundaries that matter when changing order state, admin routes, or public-facing APIs.

## Start here

1. [Repository overview](./architecture/overview.md) — the stack, runtime model, and main source entrypoints.
2. [Local development](./operations/local-dev.md) — how to run PocketBase + Hugo correctly in this repo.
3. [Data model and access rules](./domain/data-model.md) — collections, order states, coupon lifecycle, and permissions.
4. [Frontend patterns](./frontend.md) — Alpine.js, HTMX, localStorage cart, and dynamic page islands.
5. [Payments and checkout](./payments.md) — order prep, PortOne verification, webhook behavior, and refunds.
6. [CMS and rebuild workflow](./cms/rebuild.md) — how product/category sync and Hugo rebuilds work.
7. [Security hardening](./security.md) — release blockers and route-level constraints to preserve.

## High-level map

- **Static storefront:** Hugo templates and themes under `hugo/`, output served from `pb_public/`.
- **Dynamic backend:** PocketBase hooks under `pb_hooks/`.
- **Schema and migrations:** `pb_migrations/` and the live PocketBase database in `pb_data/`.
- **Admin workflows:** CMS routes in `pb_hooks/routes/admin.pb.js` plus CMS templates in `hugo/layouts/cms/`.
- **User flows:** checkout, guest/member order management, comments, inquiries, and coupon handling.

## Key source references

- `README.md`
- `DESIGN.md`
- `docs/HUGO_ARCHITECTURE.md`
- `docs/LOCAL_POCKETBASE_HUGO_ENV.md`
- `docs/DATABASE.md`
- `docs/FRONTEND.md`
- `docs/PORTONE.md`
- `docs/SECURITY_HARDENING.md`
- `pb_hooks/main.pb.js`
- `pb_hooks/routes/main.pb.js`
- `pb_hooks/routes/admin.pb.js`
- `pb_hooks/routes/portone.pb.js`
- `pb_hooks/utils/cms.js`
- `hugo/hugo.toml`

## For future agents

- Treat `pb_hooks/main.pb.js` as the hook entrypoint; it loads the route modules.
- Assume `pb_public/` is generated output, not the source of truth.
- Rebuilds matter: changes to Hugo layouts or `hugo/hugo.toml` usually require `hugo --ignoreCache`.
- Review `docs/SECURITY_HARDENING.md` before changing auth, webhook, or order-state logic.
