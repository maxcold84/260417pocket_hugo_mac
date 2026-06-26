# PortOne Integration Rules

## Flow
- Payment initiation: 100% client-side via PortOne Browser SDK CDN script
- Use forceRedirect: true for all payments (unified PC + mobile flow)
- Server verification: `$http.send()` GET to `https://api.portone.io/payments/{paymentId}`
- Auth header format: `"Authorization": "PortOne " + API_SECRET`
- Webhook endpoint: `routerAdd("POST", "/api/payment/webhook", handler)`
- Webhook verification: Standard Webhooks spec (HMAC-SHA256 manual implementation)
- Webhook headers to check: `webhook-id`, `webhook-timestamp`, `webhook-signature`
- NEVER use `@portone/server-sdk` in JSVM — it requires Node.js

## Security Rules
- NEVER hardcode PortOne API_SECRET — read from environment or PocketBase settings
- Always verify payment amount server-side (compare DB order total vs PortOne response)
- Webhook signature must be verified BEFORE processing any payment state change
- /api/orders/prep endpoint validates cart items against DB prices/stock before creating pending order
- CMS order status updates must not mark an order `paid`, `refunded`, or `cancelled` directly. `paid` belongs to payment verification, and `refunded` belongs to the PortOne cancel approval flow.

## Checkout Flow — localStorage Cart to Server Order
- The checkout process sends the client-side `localStorage` cart array to `POST /api/orders/prep`.
- **Auth Header:** When calling `/api/orders/prep`, the frontend MUST manually attach `Authorization: Bearer <token>` from `localStorage` to ensure the order is correctly linked to the authenticated user ID.
- The server validates each item against the DB (price, stock), creates a `pending` order + order_items, and returns `{ orderId, amount, cleanupNonce }`.
- Guest orders store the checkout phone/email as the temporary lookup id and store only a server-side hash of the guest password.
- The client then calls PortOne SDK with the returned orderId and amount.
- The client must pass `forceRedirect: true` and include `orderId` + `cleanupNonce` in the redirect URL so failed/cancelled redirect flows can clean up only the matching pending order.
- On successful payment, the client clears localStorage cart and redirects to `/payment/complete`.
- PortOne webhook independently verifies and updates order status to `paid`.

## Cancel / Refund Flow
- User requests cancellation from `/my-orders` → order status changes to `cancel_requested`.
- Admin approves via CMS (`/cms`) → server calls PortOne V2 cancel API.
- **Cancel API:** `POST https://api.portone.io/payments/{paymentId}/cancel`
- **Auth header:** `"Authorization": "PortOne " + API_SECRET`
- **Request body (JSON):** `{ "reason": "관리자 취소 승인" }`
- On success, order status updates to `refunded`.
- Admin rejection or user withdrawal may move `cancel_requested` back to `paid`, but only while the order is still in `cancel_requested`.
- Generic CMS update/status routes are guarded workflow routes. They may manage shipping/completion or cancellation-request handling, but cannot bypass PortOne verification or cancel API calls.
- **Environment variables required:** `PORTONE_API_SECRET`, `PORTONE_STORE_ID`
- **Rule:** Always use `$http.send()` in JSVM for the cancel API call — never `fetch()` or npm packages.

## Environment Variables
- `PORTONE_STORE_ID`: PortOne store id injected into the browser SDK and checked during server verification.
- `PORTONE_CHANNEL_KEY_KAKAOPAY`: KakaoPay channel key for `PortOne.requestPayment()`.
- `PORTONE_CHANNEL_KEY_INICIS`: KG Inicis channel key for `PortOne.requestPayment()`.
- `PORTONE_CHANNEL_KEY_KCP`: NHN KCP channel key for `PortOne.requestPayment()`.
- `PORTONE_API_SECRET`: Server-only API secret for payment verification and refunds.
- `PORTONE_WEBHOOK_SECRET`: Server-only secret for webhook signature verification.
- Optional aliases supported by the checkout route: `PORTONE_KAKAOPAY_CHANNEL_KEY`, `PORTONE_INICIS_CHANNEL_KEY`, `PORTONE_KCP_CHANNEL_KEY`.
- In production, set one of `APP_ENV=production`, `POCKETBASE_ENV=production`, `PB_ENV=production`, or `NODE_ENV=production` as an OS/process environment variable. This disables `.env` file fallback, so all required PortOne secrets must be provided by the process environment.
- For non-production runs, `.env` fallback can also be explicitly controlled with `ALLOW_DOTENV_FALLBACK=true|false` or `DOTENV_FALLBACK=true|false`.
