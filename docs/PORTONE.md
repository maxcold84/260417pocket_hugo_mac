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

## Checkout Flow — localStorage Cart to Server Order
- The checkout process sends the client-side `localStorage` cart array to `POST /api/orders/prep`.
- **Auth Header:** When calling `/api/orders/prep`, the frontend MUST manually attach `Authorization: Bearer <token>` from `localStorage` to ensure the order is correctly linked to the authenticated user ID.
- The server validates each item against the DB (price, stock), creates a `pending` order + order_items, and returns `{ orderId, amount }`.
- The client then calls PortOne SDK with the returned orderId and amount.
- On successful payment, the client clears localStorage cart and redirects to `/payment/complete`.
- PortOne webhook independently verifies and updates order status to `paid`.

## Cancel / Refund Flow
- User requests cancellation from `/my-orders` → order status changes to `cancel_requested`.
- Admin approves via CMS (`/cms`) → server calls PortOne V2 cancel API.
- **Cancel API:** `POST https://api.portone.io/payments/{paymentId}/cancel`
- **Auth header:** `"Authorization": "PortOne " + API_SECRET`
- **Request body (JSON):** `{ "reason": "관리자 취소 승인" }`
- On success, order status updates to `refunded`.
- **Environment variables required:** `PORTONE_API_SECRET`, `PORTONE_STORE_ID`
- **Rule:** Always use `$http.send()` in JSVM for the cancel API call — never `fetch()` or npm packages.
