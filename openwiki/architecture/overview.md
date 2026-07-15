# Architecture Overview

This app combines a **PocketBase runtime** with a **Hugo-generated storefront**.

## Runtime model

- PocketBase serves both as the application backend and the static file server.
- Hugo compiles the storefront into `pb_public/`, which PocketBase serves directly.
- Dynamic endpoints are implemented as PocketBase JSVM routes in `pb_hooks/`.
- The repo intentionally avoids a React/Vue-style SPA or a Node build pipeline.

## Important entrypoints

- `pb_hooks/main.pb.js` is the hook loader. PocketBase loads root-level `.pb.js` files automatically, so this file `require()`s the route modules in subdirectories.
- `pb_hooks/routes/main.pb.js` handles user-facing checkout, order cleanup, and payment completion flows.
- `pb_hooks/routes/admin.pb.js` handles CMS rebuild, settings, and order management routes.
- `pb_hooks/routes/portone.pb.js` handles PortOne webhook and verification logic.
- `hugo/hugo.toml` controls site output, languages, themes, and category metadata.

## Source tree shape

- `pb_hooks/` — JSVM route logic, templates, and utilities.
- `pb_migrations/` — schema and data migrations.
- `hugo/` — Hugo source, layouts, themes, and generated content inputs.
- `pb_public/` — generated site output.
- `pb_data/` — live PocketBase database and uploads.

## Why this layout exists

The architecture separates responsibilities cleanly:

- **Hugo** renders the mostly static storefront and CMS shell pages.
- **PocketBase** handles authenticated state, API routes, payments, order transitions, coupon logic, and admin actions.
- **Alpine.js/HTMX** provide interactivity without a heavy frontend framework.

This is why many workflows require both a server-side route change and a Hugo rebuild.

## What to watch out for

- Editing `hugo/layouts/**` or `hugo/themes/**` does not update the live site until Hugo is rebuilt into `pb_public/`.
- `hugo/hugo.toml` theme changes can affect template fallback behavior.
- Payment and admin routes are guarded by server-side checks; do not reimplement them as direct collection updates.
- `pb_hooks/main.pb.js` is only the loader; the real logic lives in the route modules.

## Useful references

- `docs/HUGO_ARCHITECTURE.md`
- `pb_hooks/main.pb.js`
- `pb_hooks/routes/main.pb.js`
- `pb_hooks/routes/admin.pb.js`
- `pb_hooks/routes/portone.pb.js`
- `pb_hooks/utils/cms.js`
