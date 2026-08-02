# Aurora Hugo Theme

Aurora is a home-only theme for this PocketBase + Hugo storefront. It replaces the
home layout with a 2026-leaning commerce design — aurora mesh gradient field, glass
surfaces, a bento pick grid, a scroll-snap product rail, and masked text reveals —
and inherits every other screen from the `default` theme.

## Scope

Aurora overrides exactly one layout:

```text
layouts/index.html
```

Catalog, product detail, login, profile, and order screens keep rendering from
`themes/default`. That is why `hugo.toml` must list Aurora *before* `default`:

```toml
theme = ["aurora", "default"]
```

Dropping `default` from that list will break every non-home route.

## Switching themes

Use the CMS **설정 → 사이트 테마** panel. It writes the `theme` line and rebuilds.
The panel lists `default` first and shows a **기본 디자인으로 되돌리기** button
whenever another theme is active, so the original design is always one click away.

## Structure

```text
assets/css/aurora.css              design tokens, surfaces, motion primitives
assets/icons/aurora/*.svg          leaf, sun, berry, sprout, basket
i18n/{ko-kr,en}.yaml               aurora_* strings
layouts/index.html                 home layout + reveal/rail scripts
layouts/partials/aurora/
  product-data.html                normalized product slice (returns a value)
  category-data.html               normalized category slice (returns a value)
  product-card.html                standard + "feature" card variants
  media-fallback.html              designed placeholder for image-less products
  icon.html                        category icon resolution
```

## Product data

`product-data.html` reads both product field shapes this storefront has shipped and
exposes one vocabulary:

| Normalized    | Source fields                  |
| ------------- | ------------------------------ |
| `price`       | `price`                        |
| `salePrice`   | `discount_price`, `sale_price` |
| `rating`      | `rating_average`, `rating`     |
| `reviewCount` | `rating_count`, `review_count` |

It also retries the list endpoint across sort keys (`sort_order`, `-created`, none)
because PocketBase answers `400` for a sort field the collection does not have, then
falls back to `content/products/*.md` if the API is unreachable.

Set `HUGO_POCKETBASE_INTERNAL_URL` when PocketBase is not on `baseURL`:

```bash
HUGO_POCKETBASE_INTERNAL_URL="http://127.0.0.1:8090/" hugo --ignoreCache
```

## Layout adapts to catalog size

The bento tile only tiles cleanly at five picks, so the section switches to an even
grid below that, and the category row narrows its column count. A three-product,
image-less catalog renders as a deliberate layout rather than a grid full of holes.

## Optional params

```toml
[params.aurora]
productLimit = 12     # products fetched for picks + rail
categoryLimit = 12    # categories in the category row
railIntervalMs = 5000 # rail autoplay; 0 disables it
```

Aurora also reads the existing site params: `heroTitle`, `heroSubtitle`,
`newArrivalLabel`, `exploreCollection`, `selectedForYou`, `featuredProducts`, and
`featuredProductSlideIntervalMs`.

## Motion and accessibility

- Reveal hidden states are applied only after JS adds `.aurora-js`, so a blocked
  script cannot blank the page.
- `prefers-reduced-motion: reduce` disables the mesh drift, marquee, pulse, word
  reveals, and rail autoplay, and switches smooth scrolling to instant.
- Rail autoplay pauses on hover, focus, and touch.
- Card overlay links carry `aria-label`; quick-add buttons are separate focusable
  controls above the overlay.
