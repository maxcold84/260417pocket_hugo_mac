# Payments and Checkout

Checkout is a multi-step flow that starts in the browser, is validated on the server, and is finalized by PortOne verification.

## High-level flow

1. The browser submits the local cart to `POST /api/orders/prep`.
2. The server validates products, stock, coupons, and order totals against PocketBase data.
3. A `pending` order and order items are created.
4. PortOne payment is initiated client-side using the server-returned amount.
5. PortOne redirect and webhook flows verify payment on the server.
6. Successful payment moves the order to `paid`.
7. Refunds and cancellations go through dedicated guarded flows.

## Why `/api/orders/prep` matters

This route is the authoritative place where the server recalculates:

- subtotal
- coupon eligibility
- discount amount
- final payable amount
- pending order creation

The client may show estimates, but the server decides the true amount.

## PortOne rules

- Payments are initiated client-side.
- Server verification uses PortOne’s payment API.
- Webhooks must be verified with the exact raw body and expected headers.
- Refunds use the PortOne cancel API from guarded CMS approval routes.

## Coupon behavior during checkout

- Logged-in users may load available coupons.
- A coupon can be reserved while checkout is pending.
- If payment succeeds, the coupon is marked used.
- If the pending order fails or is deleted, the reservation is released.

## Guest checkout

Guest orders are supported, but guest lookup and cleanup use server-generated protected data in `guest_info`. The docs recommend treating guest order lookup as a separate security-sensitive flow, not as a casual order-number login.

## Files to inspect when changing checkout

- `pb_hooks/routes/main.pb.js`
- `pb_hooks/routes/portone.pb.js`
- `pb_hooks/utils/coupons.js`
- `pb_hooks/utils/guest_security.js`
- `pb_hooks/services/portone-verify.js`
- `docs/PORTONE.md`
- `docs/SECURITY_HARDENING.md`

## Cautions for future edits

- Do not let the CMS directly set payment terminal states.
- Do not trust client-calculated coupon totals.
- Do not weaken webhook signature validation.
- Keep refund behavior behind explicit approval logic.
