# Frontend Patterns

The frontend is intentionally lightweight: **HTMX + Alpine.js + Hugo** with Tailwind CDN styling.

## Core pattern

- Hugo renders the page shell and most static content.
- Alpine.js manages local UI state and client-side interactions.
- PocketBase custom routes provide fresh data for dynamic islands.
- `localStorage` stores the cart on the client; there is no backend cart collection.

## Important implementation rules

- Use plain functions for Alpine component initialization when script order matters.
- Keep UI state on the Alpine component, not on fetched record objects.
- Prefer inline confirmation UI over `confirm()` and `alert()`.
- Use `x-text` for user-provided content.
- Be careful with teleported templates and `x-ref` limitations.
- When calling custom API routes from the browser, attach the auth token manually if the route expects it.

## Dynamic page patterns

A few pages are static shells with dynamic islands on top:

- Product detail pages: static Hugo content plus dynamic comments/inquiries.
- My orders: static page plus dynamic order history and purchase confirmation actions.
- Checkout: static form plus live coupon/order-prep/payment data.

## Layout and design guidance

The repo’s `DESIGN.md` is the canonical source for the visual system: BMW-blue primary actions, dense commerce spacing, compact admin panels, and responsive behavior down to mobile widths.

## Important gotchas

- `crypto.randomUUID()` may not be available on localhost HTTP in some browsers; use fallbacks when generating local identifiers.
- PocketBase v0.36 REST sorting has limitations; client-side sort is sometimes required.
- Alpine’s `x-if` and `x-teleport` combinations are easy to break if they don’t have the expected DOM shape.

## Where to read next

- `DESIGN.md`
- `docs/FRONTEND.md`
- `hugo/themes/default/layouts/`
- `hugo/layouts/products/single.html`
- `hugo/layouts/my-orders/list.html`
- `pb_hooks/views/checkout.html`
