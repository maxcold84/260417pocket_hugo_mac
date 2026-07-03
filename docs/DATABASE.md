# Database Schema & Security

## PocketBase Collections (DB Schema)
- `users` (auth collection): email, name, nickname, address, phone
- `products`: name, slug, description, price, images (file, max 5), stock, sort_order, category (optional relation→categories), rating_average, rating_count — **listRule/viewRule: public**
- `categories`: name, slug, sort_order — **listRule/viewRule: public**
- `orders`: user (relation→users), status (pending/paid/cancel_requested/cancelled/refunded/shipping/completed/purchase_confirmed), subtotal_amount, total_amount, coupon (relation→user_coupons), coupon_discount_amount, coupon_code_snapshot, purchase_confirmed_at, portone_tx_id, guest_info (JSON: guest contact, `email_lookup`, `phone_lookup`, password hash, cleanup nonce hash), tracking_number, courier_name, created
- `order_items`: order (relation→orders), product (relation→products), quantity, unit_price
- `product_comments`: product (relation→products, required, cascade delete), user (relation→users, required), author_name (text snapshot), rating (number, 1-5 enforced by custom routes), content (text), status (`published`/`hidden`)
- `product_inquiries`: product (relation→products, required, cascade delete), user (relation→users, required), author_name (text snapshot), title, content, is_secret, status (`pending`/`answered`/`hidden`), answer, answered_at, answered_by
- `coupon_settings`: key (`review_reward`), enabled, discount_type (`fixed`/`percent`), discount_value, expires_days, minimum_order_amount, max_discount_amount — **superuser-only**
- `user_coupons`: user (relation→users), code, status (`available`/`reserved`/`used`/`expired`/`void`), discount_type, discount_value, minimum_order_amount, max_discount_amount, source_type, source_product, source_comment, reserved_order, redeemed_order, issued_at, expires_at, used_at

> **Order Status Lifecycle:**
> `pending` → `paid` → `cancel_requested` (user request) → `refunded` (admin approval via PortOne) or back to `paid` (user withdrawal/admin rejection)
> `paid` → `shipping` → `completed` → `purchase_confirmed` (member owner action)

> **Payment-state guard:** `pending` may become `paid` only through the shared PortOne verification path (`/payment/complete` or webhook). CMS status routes may move non-payment workflow states such as `paid` ⇄ `cancel_requested` and `paid` → `shipping` → `completed`, but they must not directly create `paid`, `refunded`, `cancelled`, or `purchase_confirmed`. `purchase_confirmed` is written only by the member owner confirmation route after `completed`; `refunded` is written only after `/api/cms/orders/{id}/approve-cancel` succeeds against the PortOne cancel API.

> **Coupon lifecycle:** Review reward coupons are issued only to logged-in members after the first review for a product whose order is `purchase_confirmed`. Coupon use is server-calculated in `/api/orders/prep`: the order stores original `subtotal_amount`, final `total_amount`, discount snapshot, and coupon relation. A selected coupon moves `available` → `reserved` while the order is `pending`, then `used` after PortOne verification marks the order `paid`; failed or deleted pending orders release the reservation.

> **Note:** `cart_items` collection은 더 이상 사용하지 않음. 장바구니는 클라이언트 localStorage로 관리.

## Access Rules
- Admin/superuser routes require `$apis.requireSuperuserAuth()`
- **PocketBase Collection API Access Rules**: 
    - Collections default to superuser-only access. 
    - **Public Read**: Set `listRule` and `viewRule` to `""` for public collections (products, categories).
    - **Owner-Only Restricted**: For user-specific data (orders, order_items), use strict rules with an auth guard:
        - `orders`: `@request.auth.id != "" && user = @request.auth.id`
        - `order_items`: `@request.auth.id != "" && order.user = @request.auth.id`
        - `user_coupons`: `@request.auth.id != "" && user = @request.auth.id`
- **Guard Requirement**: Always include `@request.auth.id != ""` in rules for collections that have relation fields with empty values (like `user = ""`), otherwise unauthenticated requests might match empty fields.
- **Product Comments & Ratings**: `product_comments` collection API rules remain superuser-only. Public reads and member writes use custom routes only. `POST/PATCH/DELETE` routes validate logged-in `users` auth, `purchase_confirmed` product eligibility for create, one review per user/product, ownership for edit/delete, 1-5 rating values, and plain-text content length. Public product rating aggregates are stored on `products.rating_average` and `products.rating_count`, recalculated from published comments with ratings. The create route issues a review reward coupon at most once per member/product; edits, deletes, and re-created reviews do not issue another coupon.
- **Product Inquiries**: `product_inquiries` collection API rules remain superuser-only. Public reads and member writes use custom routes only. Logged-in `users` can create inquiries without purchase history, edit/delete only their own `pending` inquiries, and cannot modify answered or hidden inquiries. Secret inquiries are masked for everyone except the author and superusers; hidden inquiries are omitted from the product page API.

## Category Deletion Consistency
- Deleting a category through the custom CMS route (`POST /api/cms/categories/delete`) removes the matching `hugo.toml` category block, clears `products.category`, regenerates product Markdown, and rebuilds Hugo.
- Deleting a category directly through the PocketBase Admin/API is guarded by `pb_hooks/category_delete_guard.pb.js`. The hook clears affected product relations before the delete request continues, then removes the stale `hugo.toml` block after deletion. Static rebuild is intentionally deferred to the custom CMS **동기화 및 사이트 빌드** button.
- The CMS rebuild utility also self-heals products that still point at a missing category by clearing the broken relation and writing empty category frontmatter.
