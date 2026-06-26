# Database Schema & Security

## PocketBase Collections (DB Schema)
- `users` (auth collection): email, name, nickname, address, phone
- `products`: name, slug, description, price, images (file, max 5), stock, sort_order, category (optional relation→categories) — **listRule/viewRule: public**
- `categories`: name, slug, sort_order — **listRule/viewRule: public**
- `orders`: user (relation→users), status (pending/paid/cancel_requested/cancelled/refunded/shipping/completed), total_amount, portone_tx_id, guest_info (JSON: guest contact, `email_lookup`, `phone_lookup`, password hash, cleanup nonce hash), tracking_number, courier_name, created
- `order_items`: order (relation→orders), product (relation→products), quantity, unit_price

> **Order Status Lifecycle:**
> `pending` → `paid` → `cancel_requested` (user request) → `refunded` (admin approval via PortOne) or back to `paid` (user withdrawal/admin rejection)
> `paid` → `shipping` → `completed`

> **Payment-state guard:** `pending` may become `paid` only through the shared PortOne verification path (`/payment/complete` or webhook). CMS status routes may move non-payment workflow states such as `paid` ⇄ `cancel_requested` and `paid` → `shipping` → `completed`, but they must not directly create `paid`, `refunded`, or `cancelled`. `refunded` is written only after `/api/cms/orders/{id}/approve-cancel` succeeds against the PortOne cancel API.

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

## Category Deletion Consistency
- Deleting a category through the custom CMS route (`POST /api/cms/categories/delete`) removes the matching `hugo.toml` category block, clears `products.category`, regenerates product Markdown, and rebuilds Hugo.
- Deleting a category directly through the PocketBase Admin/API is guarded by `pb_hooks/category_delete_guard.pb.js`. The hook clears affected product relations before the delete request continues, then removes the stale `hugo.toml` block after deletion. Static rebuild is intentionally deferred to the custom CMS **동기화 및 사이트 빌드** button.
- The CMS rebuild utility also self-heals products that still point at a missing category by clearing the broken relation and writing empty category frontmatter.
