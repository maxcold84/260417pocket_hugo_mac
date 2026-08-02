# Data Model and Access Rules

The PocketBase schema models a storefront with users, products, categories, orders, order items, comments, inquiries, and coupons.

## Main collections

- `users` — auth collection for members.
- `products` — public catalog records with price, stock, images, category, and rating aggregates.
- `categories` — public category metadata.
- `orders` — checkout and payment state, including guest info and coupon snapshots.
- `order_items` — line items attached to an order.
- `product_comments` — review records with ratings.
- `product_inquiries` — customer inquiries with secret/answered/hidden state.
- `coupon_settings` — review reward coupon configuration.
- `user_coupons` — member coupon inventory and lifecycle state.

## Order state model

The documented lifecycle centers on these states:

- `pending`
- `paid`
- `cancel_requested`
- `cancelled`
- `refunded`
- `shipping`
- `completed`
- `purchase_confirmed`

Important rule: `paid`, `refunded`, and `purchase_confirmed` are not generic CMS edits. They are only supposed to be written by the payment verification, refund approval, or member confirmation flows.

## Coupon lifecycle

Coupons are part of checkout and review rewards:

- Review reward coupons are issued after a member’s first eligible review.
- Checkout may reserve a coupon while an order is pending.
- A successful payment marks the reserved coupon as used.
- Failed or deleted pending orders release the reservation.

## Guest checkout data

Guest checkout stores temporary lookup data in `orders.guest_info`, including contact details and server-side hashes for password/cleanup protection. The raw password is not meant to be kept as plaintext.

## Access rules

- Public read: `products`, `categories`
- Owner-restricted: `orders`, `order_items`, `user_coupons`
- Superuser-only / custom routes: `product_comments`, `product_inquiries`, `coupon_settings`, admin order routes

## Why this matters for future changes

If you change payment, review, guest lookup, or CMS behavior, you are usually changing the order, coupon, or state machine rules indirectly. Update the docs and hardening notes together.

## Source references

- `docs/DATABASE.md`
- `pb_hooks/routes/main.pb.js`
- `pb_hooks/routes/admin.pb.js`
- `pb_hooks/routes/portone.pb.js`
- `pb_hooks/utils/coupons.js`
