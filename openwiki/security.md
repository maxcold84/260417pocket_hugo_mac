# Security Hardening

This repo has a number of security-sensitive workflows that should be treated as release blockers if changed incorrectly.

## Main concerns

- Public test hooks that may still be loaded by PocketBase.
- Payment verification that must compare the PortOne result to the database order total.
- Webhook signature verification over the raw request body.
- CMS routes that must not bypass payment/refund state transitions.
- Guest order lookup and cleanup rules.
- Avoiding unverified JWT fallbacks for superuser auth.

## Important rules

- `paid` should only come from PortOne verification paths.
- `refunded` should only come from approved cancel/refund handling.
- `purchase_confirmed` should only come from the member confirmation route.
- Guest lookup should require exact credentials, not partial identifiers or order ID shortcuts.
- Pending order cleanup should be ownership- or nonce-protected.
- Required payment secrets should fail closed when missing.

## What future agents should check before editing

1. Read `docs/SECURITY_HARDENING.md`.
2. Check whether the route change affects order status, coupon issuance, or guest lookup.
3. Verify whether the route is public, authenticated, or superuser-only.
4. Confirm that webhook or payment code still uses the shared verification helper.
5. Ensure no new route can be used to skip the normal business flow.

## High-signal files

- `pb_hooks/routes/main.pb.js`
- `pb_hooks/routes/admin.pb.js`
- `pb_hooks/routes/portone.pb.js`
- `pb_hooks/utils/guest_security.js`
- `pb_hooks/utils/coupons.js`
- `docs/SECURITY_HARDENING.md`
- `docs/PORTONE.md`

## Practical advice

If a change touches money movement, order ownership, guest access, or admin actions, assume it needs both source review and doc updates. This repo’s security model is mostly enforced by custom routes, not just collection rules.
