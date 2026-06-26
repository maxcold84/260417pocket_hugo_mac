# Security Hardening Plan

This document records the security improvements required before this PocketBase + Hugo + PortOne storefront is used with real customers or real payments.

## Review Scope

- Backend custom routes: `pb_hooks/**/*.pb.js`, `pb_hooks/utils/*.js`, `pb_hooks/services/*.js`
- Static frontend and CMS flows: `hugo/layouts/**/*.html`
- Database rules and actual `pb_data/data.db` collection settings
- PortOne payment redirect, webhook, and refund flows

## Severity Levels

- **P0 - Release blocker**: exploitable in production or can corrupt payment/order state.
- **P1 - High priority**: security boundary is weak, incomplete, or hard to audit.
- **P2 - Hardening**: should be fixed before scale or external traffic.

## P0 Release Blockers

### 1. Remove or protect public test hooks

**Risk:** PocketBase automatically loads every root-level `.pb.js` file under `pb_hooks/`. Test hooks can remain public even when they are not imported from `pb_hooks/main.pb.js`.

**Required changes:**
- Delete test hook files from production builds, or move them outside `pb_hooks/`.
- Remove diagnostic imports from `pb_hooks/main.pb.js`.
- If a diagnostic endpoint is truly needed, gate it with `$apis.requireSuperuserAuth()` and an explicit environment flag such as `ENABLE_DEBUG_ROUTES=true`.

**Acceptance check:**
- `Select-String -Path 'pb_hooks/**/*.js','pb_hooks/*.js' -Pattern '/api/test|/api/debug|test-create|test-apis'` returns no production route registrations.

### 2. Verify payment amount on every server-side completion path

**Risk:** The PortOne webhook and `/payment/complete` redirect callback are both server-side completion paths. Neither path may mark an order paid without checking the PortOne payment against the order in the database.

**Required checks:**
- `paymentId` equals the PocketBase order id.
- PortOne status is `PAID`.
- PortOne total amount equals `orders.total_amount`.
- Currency is KRW.
- Store id matches `PORTONE_STORE_ID` when PortOne returns it.
- Current order status is `pending` before the first transition to `paid`.

**Acceptance check:**
- Both webhook and redirect code paths call the same amount-checking helper before `order.set("status", "paid")`.

### 3. Guard admin order status transitions

**Risk:** CMS order screens must not be able to mark orders `paid`, `refunded`, or `cancelled` without the corresponding PortOne verification or refund flow.

**Required checks:**
- `pending` can become `paid` only through the shared PortOne payment verification helper.
- `refunded` can be written only after the PortOne cancel API succeeds in `/api/cms/orders/{id}/approve-cancel`.
- CMS status/update routes reject direct creation of terminal payment states and reject moving out of terminal states.
- CMS frontend code calls guarded custom routes instead of `pb.collection('orders').update(id, { status })`.

**Acceptance check:**
- CMS list/detail status controls cannot perform `pending -> paid`, direct `paid -> refunded`, direct `paid -> cancelled`, or any transition out of `refunded`/`cancelled`.

## P1 High Priority

### 4. Verify PortOne webhooks with the exact raw request body

**Risk:** Webhook signatures are computed over the exact raw request payload. Rebuilding the body with `JSON.stringify(e.requestInfo().body)` can change spacing, key order, or encoding.

**Required changes:**
- Use the raw request body string for signature verification.
- Do not fall back to `"test_secret"` when `PORTONE_WEBHOOK_SECRET` is missing. Fail closed with a 500 configuration error.
- Reject old timestamps to reduce replay risk.
- Compare signatures without early-exit character comparisons.
- Log only non-sensitive metadata: webhook id, event type, payment id, and status.

### 5. Remove unverified JWT fallback for CMS superuser auth

**Risk:** `parseUnverifiedJWT()` only decodes claims; it does not prove the token was signed by PocketBase.

**Required changes:**
- Prefer `$apis.requireSuperuserAuth()` on CMS API routes.
- For SSR routes that need cookie-based auth, use signed token verification only.
- Avoid logging raw cookies, token prefixes, or parsed JWT claims.

**Acceptance check:**
- `Select-String -Path 'pb_hooks/**/*.js' -Pattern 'parseUnverifiedJWT'` finds no authorization fallback in production code.

### 6. Tighten guest order lookup credentials

**Risk:** Guest lookup must not accept order number-only login, partial identifiers, phone last-four matching, or "temporary id OR password" matching.

**Required changes:**
- Require exact temporary id (full guest phone number or guest email) and guest password.
- Do not use the PocketBase order id as the guest login credential.
- Do not use phone last-four digits as a default password.
- Store only a server-side hash/HMAC of the guest password in `guest_info`.
- Return generic failure messages so attackers cannot distinguish "order exists" from "bad password".

**Acceptance check:**
- A lookup with only phone last-four digits fails.
- A lookup with only order id fails.
- A lookup with exact guest phone or email plus valid guest password succeeds.

## P2 Hardening

### 7. Add ownership or nonce checks to pending-order cleanup

**Risk:** `/api/orders/{id}/cancel-pending` must not delete any pending order by id.

**Required changes:**
- For logged-in users, require `e.auth.id === order.user`.
- For guest orders, require a server-generated checkout cleanup nonce stored as a hash in `guest_info`.
- Consider a scheduled cleanup job that deletes expired pending orders after a short TTL.

### 8. Fail closed when required payment secrets are missing

**Risk:** Defaults such as `"test_api_secret"` and `"test_secret"` make a broken payment configuration look usable.

**Required changes:**
- Require `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`, and `PORTONE_STORE_ID` for payment verification, webhook handling, and refunds.
- Require `GUEST_LOOKUP_SECRET` or `PORTONE_API_SECRET` before storing guest password hashes.
- Keep secrets out of `pb_public/`, Hugo frontmatter, logs, and client-side scripts.
- In production mode (`APP_ENV`, `POCKETBASE_ENV`, `PB_ENV`, or `NODE_ENV` set to `production`/`prod` in the OS process environment), disable `.env` file fallback and require secrets to come from the process environment.

### 9. Route-level security inventory

Every new `routerAdd()` should update this table.

| Route | Auth | Mutates DB | External call | Notes |
| --- | --- | --- | --- | --- |
| `POST /api/orders/prep` | optional user token; guest allowed with required password | yes | no | validates cart against DB, hashes guest password for guests, returns cleanup nonce for pending cleanup |
| `POST /api/orders/{id}/cancel-pending` | owner user token or cleanup nonce | yes | no | only deletes `pending` orders |
| `GET /checkout` | optional user token | no | no | server-renders PortOne public config and checkout form |
| `GET /payment/complete` | none | yes | PortOne verify | verifies shared helper before paid transition |
| `POST /api/payment/webhook` | PortOne signature | yes | PortOne verify | uses raw-body signature verification and shared paid verification |
| `POST /api/orders/{id}/request-cancel` | owner user token | yes | no | `paid` to `cancel_requested` |
| `POST /api/orders/{id}/withdraw-cancel` | owner user token | yes | no | `cancel_requested` to `paid` |
| `POST /api/guest/order-lookup` | exact temporary id (guest phone/email) + guest password | no | no | generic failures; no order-id login; no phone last-four fallback |
| `POST /api/guest/orders/{id}/request-cancel` | exact temporary id (guest phone/email) + guest password | yes | no | guest `paid` to `cancel_requested` |
| `POST /api/guest/orders/{id}/withdraw-cancel` | exact temporary id (guest phone/email) + guest password | yes | no | guest `cancel_requested` to `paid` |
| `POST /api/cms/rebuild` | superuser | filesystem + build | Hugo command | admin only |
| `GET /api/cms/settings` | superuser | no | no | admin only |
| `POST /api/cms/settings/update` | superuser | filesystem + build | Hugo command | admin only |
| `GET /cms/orders/{id}` | verified superuser cookie | no | no | SSR admin detail page |
| `POST /api/cms/orders/{id}/update` | verified superuser cookie | yes | no | admin shipping update plus guarded non-payment status transitions |
| `POST /api/cms/orders/{id}/status` | verified superuser cookie | yes | no | guarded CMS list status transitions; cannot directly create `paid`, `refunded`, or `cancelled` payment state |
| `POST /api/cms/orders/{id}/approve-cancel` | superuser | yes | PortOne cancel | idempotent for already refunded orders |
| `POST /api/cms/categories/add` | superuser | yes | Hugo command | updates `hugo.toml` and categories |
| `POST /api/cms/categories/delete` | superuser | yes | Hugo command | removes category and clears product relations |
| `POST /api/cms/products/reorder` | superuser | yes | no | transaction-based sort update |

### 10. Add basic abuse controls

Recommended next controls:
- Rate-limit guest order lookup, checkout prep, login, and password reset endpoints.
- Add short TTLs for pending orders.
- Keep audit logs for order state transitions: old status, new status, actor, request source, and PortOne payment id.
- Keep rejecting impossible status transitions server-side when new admin/user order actions are added.

## Implementation Order

This hardening should grow as a vertical slice: keep the app runnable, then strengthen the next live path.

1. Remove public test hooks.
2. Refactor PortOne verification into one shared helper and use it in webhook and redirect completion.
3. Guard CMS order status transitions so payment states require payment or refund flows.
4. Fix webhook raw-body signature verification and fail-closed secret handling.
5. Remove unverified JWT CMS auth fallback.
6. Replace guest lookup with exact guest phone/email temporary id plus hashed guest password.
7. Add pending-order cleanup ownership/nonce checks.
8. Add route inventory and regression tests.

## Regression Checklist

Run these checks before release:

- Public diagnostic routes return 404 or 401/403.
- A paid PortOne response with a mismatched amount does not mark the order paid.
- A valid webhook fixture passes signature verification.
- A tampered webhook body fails signature verification.
- CMS order detail/update routes reject forged or unsigned cookies.
- CMS status routes reject `pending -> paid`, direct refund/cancel terminal changes, and terminal-state exits.
- CMS order list does not call `pb.collection('orders').update(id, { status })` or request `sort: '-created'`.
- Guest lookup fails with phone last-four only.
- Guest lookup fails with order id only.
- Guest lookup succeeds with exact guest phone or email plus the valid guest password.
- Pending-order cleanup rejects anonymous deletion without nonce.
- `hugo --source hugo --renderToMemory --printPathWarnings` passes.
- `pocketbase serve --dev --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations --publicDir=pb_public` starts without hook errors.
