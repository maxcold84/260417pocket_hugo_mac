# CMS and Rebuild Workflow

The CMS is where products, categories, orders, coupons, and rebuild-triggered content updates are managed.

## Core responsibilities

- Edit catalog products and images.
- Sync product/category data back into Hugo content.
- Apply theme settings in `hugo/hugo.toml`.
- Trigger Hugo rebuilds into `pb_public/`.
- Manage guarded order updates and archives.

## Rebuild pipeline

The rebuild route performs a few important steps:

1. Prune stale TOML category entries.
2. Sync category metadata from TOML into PocketBase.
3. Generate product Markdown under `hugo/content/products/`.
4. Remove stale outputs and orphaned assets.
5. Run `hugo --ignoreCache`.

That means the CMS is not just a content editor; it is also a build orchestrator.

## Theme handling

Themes are discovered from `hugo/themes/*/theme.toml`, and `hugo/hugo.toml` can select an active theme with fallback to `default`.

This matters because a selected theme may override only part of the storefront while inheriting the rest from the default theme.

## Order management constraints

CMS order screens are guarded. They must not bypass payment or refund flows by directly forcing terminal payment states.

## Common failure modes

- Missing `hugo/content/products/` can break rebuilds unless the hooks repair the tree.
- Category deletions must be synchronized so deleted categories do not reappear during rebuilds.
- Hugo rebuilds need `--ignoreCache` so static output reflects current PocketBase data.

## Source references

- `pb_hooks/routes/admin.pb.js`
- `pb_hooks/utils/cms.js`
- `docs/HUGO_ARCHITECTURE.md`
- `hugo/hugo.toml`
