# Database Schema & Security

## PocketBase Collections (DB Schema)
- `users` (auth collection): email, name, nickname, address, phone
- `products`: name, slug, description, price, images (file), stock, category (relation) — **listRule/viewRule: public**
- `categories`: name, slug, sort_order — **listRule/viewRule: public**
- `orders`: user (relation→users), status (pending/paid/cancelled/refunded/shipping/completed), total_amount, portone_tx_id, guest_info (JSON), tracking_number, courier_name, created
- `order_items`: order (relation→orders), product (relation→products), quantity, unit_price

> **Note:** `cart_items` collection은 더 이상 사용하지 않음. 장바구니는 클라이언트 localStorage로 관리.

## Access Rules
- Admin/superuser routes require `$apis.requireSuperuserAuth()`
- **PocketBase Collection API Access Rules**: 
    - Collections default to superuser-only access. 
    - **Public Read**: Set `listRule` and `viewRule` to `""` for public collections (products, categories).
    - **Owner-Only Restricted**: For user-specific data (orders, order_items), use strict rules with an auth guard:
        - `orders`: `@request.auth.id != "" && user = @request.auth.id`
        - `order_items`: `@request.auth.id != "" && order.user = @request.auth.id`
    - **Guard Requirement**: Always include `@request.auth.id != ""` in rules for collections that have relation fields with empty values (like `user = ""`), otherwise unauthenticated requests might match empty fields.
