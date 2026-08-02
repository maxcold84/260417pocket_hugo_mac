# Them Aroma Hugo Theme

Them Aroma is a portable Hugo commerce theme extracted from this PocketBase + Hugo storefront. The theme contains its own base layout, home layout, partials, CSS asset, static hero image, and i18n strings so it can be copied into another Hugo project as `themes/them-aroma`.

## Install In Another Hugo Site

1. Copy this directory to the target site:

   ```text
   themes/them-aroma/
   ```

2. Set the target site's Hugo config:

   ```toml
   theme = "them-aroma"
   ```

3. If the target site does not use PocketBase, render products from Markdown:

   ```toml
   [params.aroma]
   productSource = "markdown"
   heroImage = "/images/aroma-hero.png"
   heroCtaURL = "/products/"
   ```

4. Add product files under `content/products/*.md` with frontmatter like:

   ```yaml
   ---
   title: "Sample Aroma Kit"
   id: "sample-aroma-kit"
   price: 39000
   discount_price: 32000
   stock: 8
   weight: 1
   images:
     - "/images/aroma-hero.png"
   category: "sample"
   rating_average: 4.8
   rating_count: 12
   ---
   ```

For a working reference, see `exampleSite/hugo.toml`.

## Product Sources

- `productSource = "markdown"` uses `content/products` and does not call a remote API.
- `productSource = "auto"` tries PocketBase first, then falls back to Markdown if the API call fails.
- `HUGO_POCKETBASE_INTERNAL_URL` can override the PocketBase base URL during builds.

## Expected Theme Surface

The theme provides:

- `layouts/_default/baseof.html`
- `layouts/index.html`
- reusable partials under `layouts/partials/them-aroma/`
- `assets/css/them-aroma.css`
- `static/images/aroma-hero.png`
- Korean and English i18n defaults
