# Database Schema & Security

## PocketBase Collections (DB Schema)
- `users` (auth collection): email, name, nickname, address, phone
- `products`: name, slug, description, price, images (file), stock, category (relation) — **listRule/viewRule: public**
- `categories`: name, slug, sort_order — **listRule/viewRule: public**
- `orders`: user (relation→users), status (pending/paid/cancelled/refunded), total_amount, portone_tx_id, guest_info (JSON), created
- `order_items`: order (relation→orders), product (relation→products), quantity, unit_price

> **Note:** `cart_items` collection은 더 이상 사용하지 않음. 장바구니는 클라이언트 localStorage로 관리.

## Access Rules
- Admin/superuser routes require `$apis.requireSuperuserAuth()`
- **PocketBase Collection API Access Rules**: Collections default to superuser-only access. If the frontend needs to read data via REST API (e.g., product catalog), `listRule` and `viewRule` MUST be set to `""` (empty string = public). After creating collections, always verify API access rules. Use a migration script or the Admin UI (`/_/`) to set appropriate rules. Test with `curl` before relying on frontend fetch.
