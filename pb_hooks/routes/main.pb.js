// In a real scenario, use $apis.requireAuth() for protected paths

routerAdd("POST", "/api/orders/prep", (e) => {
    try {
        const env = require(`${__hooks}/utils/env.js`);
        const guestSecurity = require(`${__hooks}/utils/guest_security.js`);
        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        const data = e.requestInfo().body || {};
        const cart = data.cart;
        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return e.json(400, { error: "Cart is empty" });
        }

        const userId = (e.auth && e.auth.collection().name === "users") ? e.auth.id : null;
        let subtotal = 0;
        const itemsToSave = [];
        let cleanupNonce = "";

        for (let item of cart) {
            // Verify product against DB
            const products = $app.findRecordsByFilter("products", "id = {:id}", "", 1, 0, { "id": item.id });
            if (!products || products.length === 0) return e.json(404, { error: "Product not found: " + item.id });
            
            const product = products[0];
            const originalPrice = product.getInt("price");
            const discountPrice = product.getInt("discount_price");
            const price = (discountPrice > 0) ? discountPrice : originalPrice;
            const qty = parseInt(item.quantity) || 1;
            
            if (product.getInt("stock") < qty) {
                return e.json(400, { error: "Not enough stock for: " + product.getString("name") });
            }

            subtotal += price * qty;
            itemsToSave.push({ product: product, quantity: qty, unitPrice: price });
        }

        const requestedCouponId = String(data.couponId || "").trim();
        const couponValidation = couponUtil.validateCouponForUse($app, requestedCouponId, userId, subtotal);
        if (!couponValidation.ok) {
            const errorPayload = { error: couponValidation.error };
            if (requestedCouponId) {
                errorPayload.couponRejected = true;
                errorPayload.couponId = requestedCouponId;
                errorPayload.refreshCoupons = true;
            }
            return e.json(couponValidation.statusCode || 400, errorPayload);
        }
        const discountAmount = couponValidation.discountAmount || 0;
        const finalAmount = couponValidation.finalAmount || subtotal;

        // Create pending order
        const ordersCollection = $app.findCollectionByNameOrId("orders");
        const newOrder = new Record(ordersCollection);
        newOrder.set("subtotal_amount", subtotal);
        newOrder.set("total_amount", finalAmount);
        newOrder.set("status", "pending");
        newOrder.set("recipient_name", data.recipientName || "");
        newOrder.set("recipient_phone", data.recipientPhone || "");
        newOrder.set("shipping_address", data.shippingAddress || "");
        newOrder.set("shipping_address_detail", data.shippingAddressDetail || "");
        newOrder.set("shipping_memo", data.shippingMemo || "");
        if (userId) {
            const cleanupResult = guestSecurity.createCleanupNonce(env);
            if (!cleanupResult.ok) {
                return e.json(500, { error: cleanupResult.error });
            }
            cleanupNonce = cleanupResult.cleanupNonce;
            newOrder.set("user", userId);
            newOrder.set("guest_info", {
                checkout_cleanup_hash: cleanupResult.cleanupHash
            });
        } else {
            const guestResult = guestSecurity.createGuestInfo(data.guestInfo || {}, env);
            if (!guestResult.ok) {
                const statusCode = guestResult.error.indexOf("환경 변수") !== -1 ? 500 : 400;
                return e.json(statusCode, { error: guestResult.error });
            }
            cleanupNonce = guestResult.cleanupNonce;
            newOrder.set("guest_info", guestResult.guestInfo);
        }
        if (couponValidation.coupon) {
            newOrder.set("coupon", couponValidation.coupon.id);
            newOrder.set("coupon_discount_amount", discountAmount);
            newOrder.set("coupon_code_snapshot", couponValidation.coupon.getString("code"));
        } else {
            newOrder.set("coupon_discount_amount", 0);
            newOrder.set("coupon_code_snapshot", "");
        }
        $app.save(newOrder);

        let buildStage = "reservation";
        try {
            couponUtil.reserveCouponForOrder($app, couponValidation.coupon, newOrder);
            buildStage = "items";
            const orderItemsCollection = $app.findCollectionByNameOrId("order_items");
            for (let savedItem of itemsToSave) {
                const newItem = new Record(orderItemsCollection);
                newItem.set("order", newOrder.id);
                newItem.set("product", savedItem.product.id);
                newItem.set("quantity", savedItem.quantity);
                newItem.set("unit_price", savedItem.unitPrice);
                $app.save(newItem);
            }
        } catch (buildErr) {
            try {
                couponUtil.releaseCouponReservationForOrder($app, newOrder);
                $app.delete(newOrder);
            } catch (cleanupErr) {}
            const statusCode = buildStage === "reservation" ? 409 : 500;
            const errorPayload = { error: buildErr.toString() };
            if (buildStage === "reservation" && requestedCouponId) {
                errorPayload.error = "쿠폰이 방금 사용되었거나 만료되었습니다. 다른 쿠폰을 선택해 주세요.";
                errorPayload.couponRejected = true;
                errorPayload.couponId = requestedCouponId;
                errorPayload.refreshCoupons = true;
            }
            return e.json(statusCode, errorPayload);
        }

        return e.json(200, {
            orderId: newOrder.id,
            amount: finalAmount,
            subtotalAmount: subtotal,
            discountAmount: discountAmount,
            coupon: couponValidation.coupon ? couponUtil.exportCoupon(couponValidation.coupon) : null,
            cleanupNonce: cleanupNonce
        });
    } catch(err) {
        return e.json(500, { error: err.toString() });
    }
});


routerAdd("POST", "/api/orders/{id}/cancel-pending", (e) => {
    try {
        const env = require(`${__hooks}/utils/env.js`);
        const guestSecurity = require(`${__hooks}/utils/guest_security.js`);
        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        const data = e.requestInfo().body || {};
        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);
        
        if (order.getString("status") !== "pending") {
            return e.json(400, { error: "Only pending orders can be deleted" });
        }

        const orderUser = order.getString("user");
        const authUserId = (e.auth && e.auth.collection().name === "users") ? e.auth.id : "";
        const guestInfo = guestSecurity.parseGuestInfo(order.get("guest_info"));
        const cleanupNonce = String(data.cleanupNonce || "").trim();

        if (orderUser) {
            if (authUserId !== orderUser && !guestSecurity.verifyCleanupNonce(guestInfo, cleanupNonce, env)) {
                return e.json(403, { error: "Pending order cleanup is not allowed" });
            }
        } else {
            if (!guestSecurity.verifyCleanupNonce(guestInfo, cleanupNonce, env)) {
                return e.json(403, { error: "Pending order cleanup is not allowed" });
            }
        }

        couponUtil.releaseCouponReservationForOrder($app, order);
        $app.delete(order);
        return e.json(200, { message: "Pending order deleted successfully" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});



routerAdd("GET", "/checkout", (c) => {
    try {
        const renderUtil = require(`${__hooks}/utils/render.js`);
        const addressCompiler = require(`${__hooks}/utils/address_compiler.js`);
        const env = require(`${__hooks}/utils/env.js`);
        
        let partialHtml = $template.loadFiles(`${__hooks}/views/checkout.html`).render({
            portoneStoreId: env.get("PORTONE_STORE_ID") || "",
            channelKeyKakaopay: env.getAny(["PORTONE_CHANNEL_KEY_KAKAOPAY", "PORTONE_KAKAOPAY_CHANNEL_KEY"]) || "",
            channelKeyInicis: env.getAny(["PORTONE_CHANNEL_KEY_INICIS", "PORTONE_INICIS_CHANNEL_KEY"]) || "",
            channelKeyKcp: env.getAny(["PORTONE_CHANNEL_KEY_KCP", "PORTONE_KCP_CHANNEL_KEY"]) || "",
            userEmail: c.auth ? c.auth.getString("email") : "",
            userPhone: c.auth ? c.auth.getString("phone") : "",
            userId: c.auth ? c.auth.id : "",
            isLoggedInServerSide: !!c.auth
        });
        
        // Dynamic Lang selection & compile
        const lang = c.request.url.query().get("lang") || "ko-kr";
        const addressHtml = addressCompiler.compile("shippingAddress", "light", lang);
        
        // Inject Hugo compiled address search HTML into placeholder
        partialHtml = partialHtml.replace('<div id="address-form-placeholder"></div>', addressHtml);
        
        return renderUtil.render(c, partialHtml, { title: "Checkout - D'roll Shop" });
    } catch(err) { return c.json(500, { error: err.toString() }); }
});

routerAdd("GET", "/payment/complete", (c) => {
    try {
        const renderUtil = require(`${__hooks}/utils/render.js`);
        const portone = require(`${__hooks}/services/portone-verify.js`);
        const env = require(`${__hooks}/utils/env.js`);
        const guestSecurity = require(`${__hooks}/utils/guest_security.js`);
        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        const query = c.request.url.query();
        const paymentId = query.get("paymentId") || query.get("payment_id") || query.get("orderId") || "Unknown";
        const code = query.get("code");
        const message = query.get("message");
        const cleanupNonce = query.get("cleanupNonce") || "";

        const escapeHtml = (value) => {
            return String(value || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        };

        const renderFailure = (title, detail) => {
            const failHtml = '<div class="max-w-4xl mx-auto text-center py-20">' +
                '<div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-600 text-white mb-6">' +
                    '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>' +
                    '</svg>' +
                '</div>' +
                '<h1 class="text-4xl font-light mb-4 text-gray-900 dark:text-white">' + escapeHtml(title) + '</h1>' +
                '<p class="text-gray-500 dark:text-gray-400 mb-8">' + escapeHtml(detail) + '</p>' +
                '<div class="mt-12">' +
                    '<a href="/checkout" class="bg-bmw-blue text-white hover:bg-blue-700 px-8 py-3 uppercase tracking-widest text-sm font-medium transition duration-300">다시 결제하기</a>' +
                '</div>' +
            '</div>';
            return renderUtil.render(c, failHtml, { title: "Payment Failed - D'roll Shop" });
        };

        // If there's an error code or message in redirect, it means payment failed or was cancelled.
        if (code || message) {
            if (paymentId && paymentId !== "Unknown" && cleanupNonce) {
                try {
                    const order = $app.findRecordById("orders", paymentId);
                    const guestInfo = guestSecurity.parseGuestInfo(order.get("guest_info"));
                    if (order.getString("status") === "pending" && guestSecurity.verifyCleanupNonce(guestInfo, cleanupNonce, env)) {
                        couponUtil.releaseCouponReservationForOrder($app, order);
                        $app.delete(order);
                    }
                } catch (cleanupErr) {}
            }
            return renderFailure("PAYMENT CANCELLED", "결제가 취소되었거나 실패하였습니다: " + (message || "사용자 취소"));
        }

        if (!paymentId || paymentId === "Unknown") {
            return renderFailure("PAYMENT ERROR", "결제 식별자가 없어 주문을 검증할 수 없습니다.");
        }
        
        let isGuest = false;
        let guestContact = "";
        let order = null;
        try {
            order = $app.findRecordById("orders", paymentId);
        } catch (e) {
            console.error("Failed to load order for payment complete page:", e);
            return renderFailure("PAYMENT ERROR", "주문 정보를 찾을 수 없습니다.");
        }

        const verified = portone.verifyPaidPaymentForOrder(order, paymentId, env);
        if (!verified.ok) {
            return renderFailure("PAYMENT VERIFICATION FAILED", "결제 검증에 실패했습니다: " + verified.error);
        }

        if (!verified.alreadyPaid) {
            order.set("status", "paid");
            order.set("portone_tx_id", verified.transactionId);
            $app.save(order);
            console.log("Synced order status to paid via redirect callback: " + paymentId);
        }
        couponUtil.markCouponUsedForOrder($app, order);

        const guestInfo = guestSecurity.parseGuestInfo(order.get("guest_info"));
        if (!order.getString("user") && guestInfo) {
            isGuest = true;
            guestContact = guestInfo.phone || guestInfo.email || order.getString("recipient_phone") || "비회원";
        }

        let partialHtml = $template.loadFiles(`${__hooks}/views/order-complete.html`).render({
            paymentId: paymentId
        });

        let guestHtml = "";
        if (isGuest) {
            guestHtml = '<div class="mt-6 bg-blue-50/50 dark:bg-bmw-blue/10 border border-blue-200 dark:border-bmw-blue/30 p-6 rounded-sm text-left max-w-md mx-auto">' +
                '<h3 class="text-sm font-bold text-gray-900 dark:text-white mb-3">비회원 주문 안내 (Guest Order Info)</h3>' +
                '<div class="space-y-2 text-xs text-gray-600 dark:text-gray-400">' +
                    '<div>• <strong>임시 아이디:</strong> <span class="font-mono text-gray-900 dark:text-white text-sm">' + escapeHtml(guestContact) + '</span></div>' +
                    '<div>• <strong>주문 비밀번호:</strong> 결제 전 직접 설정한 비밀번호</div>' +
                    '<div class="pt-2 text-[11px] text-gray-500">• <strong>[주문 내역(YOUR ORDERS)]</strong> 조회 시 임시 아이디(전화번호 또는 이메일)와 주문 비밀번호가 모두 필요합니다.</div>' +
                '</div>' +
            '</div>';
        }
        partialHtml = partialHtml.replace('<div id="guest-info-placeholder"></div>', guestHtml);
        
        return renderUtil.render(c, partialHtml, { title: "주문 완료 - D'roll Shop" });
    } catch(err) { return c.json(500, { error: err.toString() }); }
});



// User: Request order cancellation (paid -> cancel_requested)
routerAdd("POST", "/api/orders/{id}/request-cancel", (e) => {
    try {
        if (!e.auth) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);

        // Verify ownership
        if (order.getString("user") !== e.auth.id) {
            return e.json(403, { error: "본인의 주문만 취소 요청할 수 있습니다." });
        }

        // Only 'paid' orders can be cancelled
        if (order.getString("status") !== "paid") {
            return e.json(400, { error: "결제완료 상태의 주문만 취소 요청할 수 있습니다." });
        }

        order.set("status", "cancel_requested");
        $app.save(order);

        return e.json(200, { message: "취소 요청이 접수되었습니다." });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

// User: Withdraw cancellation request (cancel_requested -> paid)
routerAdd("POST", "/api/orders/{id}/withdraw-cancel", (e) => {
    try {
        if (!e.auth) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);

        // Verify ownership
        if (order.getString("user") !== e.auth.id) {
            return e.json(403, { error: "본인의 주문만 철회할 수 있습니다." });
        }

        // Only 'cancel_requested' orders can be withdrawn
        if (order.getString("status") !== "cancel_requested") {
            return e.json(400, { error: "취소 요청 상태의 주문만 철회할 수 있습니다." });
        }

        order.set("status", "paid");
        $app.save(order);

        return e.json(200, { message: "취소 요청이 철회되었습니다." });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});


routerAdd("GET", "/api/orders/review-state", (e) => {
    try {
        const commentUtil = require(`${__hooks}/utils/comments.js`);
        const couponUtil = require(`${__hooks}/utils/coupons.js`);

        if (!e.auth || e.auth.collection().name !== "users") {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const userId = e.auth.id;
        const productIds = {};
        const orderPageSize = 100;
        const itemPageSize = 100;

        for (let orderOffset = 0; ; orderOffset += orderPageSize) {
            const orders = $app.findRecordsByFilter(
                "orders",
                "user = {:userId}",
                "",
                orderPageSize,
                orderOffset,
                { userId: userId }
            ) || [];

            for (const order of orders) {
                if (order.getString("status") !== "purchase_confirmed") {
                    continue;
                }

                for (let itemOffset = 0; ; itemOffset += itemPageSize) {
                    const items = $app.findRecordsByFilter(
                        "order_items",
                        "order = {:orderId}",
                        "",
                        itemPageSize,
                        itemOffset,
                        { orderId: order.id }
                    ) || [];

                    for (const item of items) {
                        const productId = item.getString("product");
                        if (productId) {
                            productIds[productId] = true;
                        }
                    }

                    if (items.length < itemPageSize) break;
                }
            }

            if (orders.length < orderPageSize) break;
        }

        const byProduct = {};
        const items = [];
        const sortedProductIds = Object.keys(productIds).sort();

        for (const productId of sortedProductIds) {
            const existingComment = commentUtil.findUserComment($app, productId, userId);
            const reward = couponUtil.reviewRewardCouponState($app, userId, productId);
            const state = {
                productId: productId,
                canReview: !existingComment,
                hasReview: !!existingComment,
                commentId: existingComment ? existingComment.id : "",
                commentStatus: existingComment ? existingComment.getString("status") : "",
                couponState: reward.status,
                coupon: reward.coupon
            };
            byProduct[productId] = state;
            items.push(state);
        }

        return e.json(200, {
            items: items,
            byProduct: byProduct
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});


routerAdd("POST", "/api/orders/{id}/confirm-purchase", (e) => {
    try {
        if (!e.auth || e.auth.collection().name !== "users") {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);

        if (order.getString("user") !== e.auth.id) {
            return e.json(403, { error: "본인 주문만 구매확정할 수 있습니다." });
        }

        const status = order.getString("status");
        if (status === "purchase_confirmed") {
            return e.json(200, {
                message: "이미 구매확정된 주문입니다.",
                order: {
                    id: order.id,
                    status: status,
                    purchase_confirmed_at: order.getString("purchase_confirmed_at")
                }
            });
        }
        if (status !== "completed") {
            return e.json(400, { error: "배송완료 주문만 구매확정할 수 있습니다." });
        }

        order.set("status", "purchase_confirmed");
        order.set("purchase_confirmed_at", new Date().toISOString());
        $app.save(order);

        return e.json(200, {
            message: "구매가 확정되었습니다. 이제 리뷰를 작성할 수 있습니다.",
            order: {
                id: order.id,
                status: order.getString("status"),
                purchase_confirmed_at: order.getString("purchase_confirmed_at")
            }
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});



// Guest: Lookup guest order securely
routerAdd("POST", "/api/guest/order-lookup", (e) => {
    try {
        const env = require(`${__hooks}/utils/env.js`);
        const guestSecurity = require(`${__hooks}/utils/guest_security.js`);
        const data = e.requestInfo().body || {};
        const identifier = (data.identifier || data.orderId || "").trim();
        const password = (data.password || "").trim();

        if (!guestSecurity.isValidGuestIdentifier(identifier) || !password) {
            return e.json(400, { error: "임시 아이디와 주문 비밀번호를 모두 입력해 주세요." });
        }

        const matchedOrders = [];
        const pageSize = 100;

        for (let offset = 0; ; offset += pageSize) {
            const orders = $app.findRecordsByFilter("orders", "1=1", "", pageSize, offset) || [];
            for (const order of orders) {
                if (order.getString("user") !== "") continue;

                const guestInfo = guestSecurity.parseGuestInfo(order.get("guest_info"));
                if (!guestSecurity.matchesGuestIdentifier(guestInfo, identifier)) continue;
                if (!guestSecurity.verifyGuestPasswordForOrder(order, guestInfo, password, env, $app)) continue;

                matchedOrders.push({
                    order: order,
                    guestInfo: guestInfo
                });
            }

            if (orders.length < pageSize) break;
        }

        if (matchedOrders.length === 0) {
            return e.json(401, { error: "주문 정보 또는 비밀번호가 일치하지 않습니다." });
        }

        matchedOrders.sort((left, right) => {
            return String(right.order.getString("created")).localeCompare(String(left.order.getString("created")));
        });

        const responseItems = [];
        for (const matched of matchedOrders) {
            const order = matched.order;
            const guestInfo = matched.guestInfo;
            const orderItems = $app.findRecordsByFilter("order_items", "order = {:orderId}", "", 100, 0, { orderId: order.id });
            const items = [];
            for (const item of orderItems) {
                let productData = null;
                try {
                    const product = $app.findRecordById("products", item.getString("product"));
                    productData = {
                        id: product.id,
                        name: product.getString("name"),
                        price: product.getInt("price"),
                        images: product.get("images"),
                        collectionId: product.collection().id
                    };
                } catch (err) {
                    console.error("Product fetch error in guest lookup:", err);
                }
                items.push({
                    id: item.id,
                    quantity: item.getInt("quantity"),
                    unit_price: item.getInt("unit_price"),
                    expand: {
                        product: productData
                    }
                });
            }

            responseItems.push({
                id: order.id,
                created: order.getString("created"),
                status: order.getString("status"),
                total_amount: order.getInt("total_amount"),
                recipient_name: order.getString("recipient_name") || (guestInfo ? guestInfo.name : "") || "",
                recipient_phone: order.getString("recipient_phone") || (guestInfo ? guestInfo.phone : "") || "",
                shipping_address: order.getString("shipping_address") || "",
                shipping_address_detail: order.getString("shipping_address_detail") || "",
                shipping_memo: order.getString("shipping_memo") || "",
                courier_name: order.getString("courier_name") || "",
                tracking_number: order.getString("tracking_number") || "",
                expand: {
                    order_items_via_order: items
                }
            });
        }

        return e.json(200, {
            items: responseItems
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

// Guest: Request order cancellation
routerAdd("POST", "/api/guest/orders/{id}/request-cancel", (e) => {
    try {
        const env = require(`${__hooks}/utils/env.js`);
        const guestSecurity = require(`${__hooks}/utils/guest_security.js`);
        const orderId = e.request.pathValue("id");
        const data = e.requestInfo().body || {};
        const identifier = (data.identifier || "").trim();
        const password = (data.password || "").trim();

        if (!guestSecurity.isValidGuestIdentifier(identifier) || !password) {
            return e.json(400, { error: "임시 아이디와 주문 비밀번호를 입력해주세요." });
        }

        let order = null;
        try {
            order = $app.findRecordById("orders", orderId);
        } catch (err) {
            return e.json(401, { error: "권한이 없습니다." });
        }
        
        if (order.getString("user") !== "") {
            return e.json(400, { error: "비회원 주문이 아닙니다." });
        }

        const guestInfo = guestSecurity.parseGuestInfo(order.get("guest_info"));
        if (!guestInfo) {
            return e.json(404, { error: "비회원 주문 정보를 찾을 수 없습니다." });
        }

        if (!guestSecurity.matchesGuestIdentifier(guestInfo, identifier) || !guestSecurity.verifyGuestPasswordForOrder(order, guestInfo, password, env, $app)) {
            return e.json(401, { error: "권한이 없습니다." });
        }

        if (order.getString("status") !== "paid") {
            return e.json(400, { error: "결제완료 상태의 주문만 취소 요청할 수 있습니다." });
        }

        order.set("status", "cancel_requested");
        $app.save(order);

        return e.json(200, { message: "취소 요청이 접수되었습니다." });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

// Guest: Withdraw cancellation request
routerAdd("POST", "/api/guest/orders/{id}/withdraw-cancel", (e) => {
    try {
        const env = require(`${__hooks}/utils/env.js`);
        const guestSecurity = require(`${__hooks}/utils/guest_security.js`);
        const orderId = e.request.pathValue("id");
        const data = e.requestInfo().body || {};
        const identifier = (data.identifier || "").trim();
        const password = (data.password || "").trim();

        if (!guestSecurity.isValidGuestIdentifier(identifier) || !password) {
            return e.json(400, { error: "임시 아이디와 주문 비밀번호를 입력해주세요." });
        }

        let order = null;
        try {
            order = $app.findRecordById("orders", orderId);
        } catch (err) {
            return e.json(401, { error: "권한이 없습니다." });
        }
        
        if (order.getString("user") !== "") {
            return e.json(400, { error: "비회원 주문이 아닙니다." });
        }

        const guestInfo = guestSecurity.parseGuestInfo(order.get("guest_info"));
        if (!guestInfo) {
            return e.json(404, { error: "비회원 주문 정보를 찾을 수 없습니다." });
        }

        if (!guestSecurity.matchesGuestIdentifier(guestInfo, identifier) || !guestSecurity.verifyGuestPasswordForOrder(order, guestInfo, password, env, $app)) {
            return e.json(401, { error: "권한이 없습니다." });
        }

        if (order.getString("status") !== "cancel_requested") {
            return e.json(400, { error: "취소 요청 상태의 주문만 철회할 수 있습니다." });
        }

        order.set("status", "paid");
        $app.save(order);

        return e.json(200, { message: "취소 요청이 철회되었습니다." });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});
