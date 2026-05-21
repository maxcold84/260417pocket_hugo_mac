// In a real scenario, use $apis.requireAuth() for protected paths

routerAdd("POST", "/api/orders/prep", (e) => {
    try {
        const data = e.requestInfo().body;
        const cart = data.cart;
        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return e.json(400, { error: "Cart is empty" });
        }

        const userId = (e.auth && e.auth.collection().name === "users") ? e.auth.id : null;
        let subtotal = 0;
        let itemsToSave = [];

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

        // Create pending order
        let ordersCollection = $app.findCollectionByNameOrId("orders");
        let newOrder = new Record(ordersCollection);
        newOrder.set("total_amount", subtotal);
        newOrder.set("status", "pending");
        newOrder.set("recipient_name", data.recipientName || "");
        newOrder.set("recipient_phone", data.recipientPhone || "");
        newOrder.set("shipping_address", data.shippingAddress || "");
        newOrder.set("shipping_address_detail", data.shippingAddressDetail || "");
        newOrder.set("shipping_memo", data.shippingMemo || "");
        if (userId) {
            newOrder.set("user", userId);
        } else {
            const gInfo = data.guestInfo || {};
            // Set order password fallback (last 4 digits of phone) if empty
            if (!gInfo.password) {
                const phoneStr = gInfo.phone || data.recipientPhone || "";
                const cleanPhone = phoneStr.replace(/[^0-9]/g, "");
                gInfo.password = cleanPhone.slice(-4) || "0000";
            }
            newOrder.set("guest_info", gInfo);
        }
        $app.save(newOrder);

        // Create order items
        let orderItemsCollection = $app.findCollectionByNameOrId("order_items");
        for (let savedItem of itemsToSave) {
            let newItem = new Record(orderItemsCollection);
            newItem.set("order", newOrder.id);
            newItem.set("product", savedItem.product.id);
            newItem.set("quantity", savedItem.quantity);
            newItem.set("unit_price", savedItem.unitPrice);
            $app.save(newItem);
        }

        return e.json(200, { orderId: newOrder.id, amount: subtotal });
    } catch(err) {
        return e.json(500, { error: err.toString() });
    }
});


routerAdd("POST", "/api/orders/{id}/cancel-pending", (e) => {
    try {
        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);
        
        // Only allow deleting 'pending' orders
        if (order.getString("status") === "pending") {
            $app.delete(order);
            return e.json(200, { message: "Pending order deleted successfully" });
        }
        return e.json(400, { error: "Only pending orders can be deleted" });
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
            portoneStoreId: env.get("PORTONE_STORE_ID") || "store-placeholder",
            channelKeyKakaopay: env.get("PORTONE_CHANNEL_KEY_KAKAOPAY") || "",
            channelKeyInicis: env.get("PORTONE_CHANNEL_KEY_INICIS") || "",
            channelKeyKcp: env.get("PORTONE_CHANNEL_KEY_KCP") || "",
            userEmail: c.auth ? c.auth.getString("email") : "",
            userPhone: c.auth ? c.auth.getString("phone") : ""
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
        const query = c.request.url.query();
        const paymentId = query.get("paymentId") || query.get("payment_id") || "Unknown";
        const code = query.get("code");
        const message = query.get("message");

        // If there's an error code or message in redirect, it means payment failed or was cancelled.
        if (code || message) {
            if (paymentId && paymentId !== "Unknown") {
                try {
                    const order = $app.findRecordById("orders", paymentId);
                    if (order && order.getString("status") === "pending") {
                        $app.delete(order);
                    }
                } catch (e) {
                    console.error("Failed to delete pending order on payment failure:", e);
                }
            }
            
            const renderUtil = require(`${__hooks}/utils/render.js`);
            const failHtml = '<div class="max-w-4xl mx-auto text-center py-20">' +
                '<div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-600 text-white mb-6">' +
                    '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>' +
                    '</svg>' +
                '</div>' +
                '<h1 class="text-4xl font-light mb-4 text-gray-900 dark:text-white">PAYMENT CANCELLED</h1>' +
                '<p class="text-gray-500 dark:text-gray-400 mb-8">결제가 취소되었거나 실패하였습니다: ' + (message || "사용자 취소") + '</p>' +
                '<div class="mt-12">' +
                    '<a href="/checkout" class="bg-bmw-blue text-white hover:bg-blue-700 px-8 py-3 uppercase tracking-widest text-sm font-medium transition duration-300">다시 결제하기</a>' +
                '</div>' +
            '</div>';
            return renderUtil.render(c, failHtml, { title: "Payment Failed - D'roll Shop" });
        }

        const renderUtil = require(`${__hooks}/utils/render.js`);
        
        let isGuest = false;
        let tempId = "";
        let guestPasswordHint = "";
        try {
            if (paymentId && paymentId !== "Unknown") {
                const order = $app.findRecordById("orders", paymentId);
                const guestInfo = order.get("guest_info");
                if (!order.getString("user") && guestInfo) {
                    isGuest = true;
                    tempId = guestInfo.phone || guestInfo.email || order.getString("recipient_phone") || "Unknown";
                    
                    if (guestInfo.password) {
                        const rawPhone = guestInfo.phone || order.getString("recipient_phone") || "";
                        const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
                        const last4 = cleanPhone.slice(-4) || "0000";
                        if (guestInfo.password === last4) {
                            guestPasswordHint = "휴대폰 번호 뒷 4자리 (" + last4 + ")";
                        } else {
                            guestPasswordHint = "설정하신 주문 비밀번호";
                        }
                    } else {
                        guestPasswordHint = "휴대폰 번호 뒷 4자리";
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load order for payment complete page:", e);
        }

        let partialHtml = $template.loadFiles(`${__hooks}/views/order-complete.html`).render({});
        partialHtml = partialHtml.replace("{{.paymentId}}", paymentId);

        let guestHtml = "";
        if (isGuest) {
            guestHtml = '<div class="mt-6 bg-blue-50/50 dark:bg-bmw-blue/10 border border-blue-200 dark:border-bmw-blue/30 p-6 rounded-sm text-left max-w-md mx-auto">' +
                '<h3 class="text-sm font-bold text-gray-900 dark:text-white mb-3">비회원 주문 안내 (Guest Order Info)</h3>' +
                '<div class="space-y-2 text-xs text-gray-600 dark:text-gray-400">' +
                    '<div>• <strong>임시 아이디 (연락처/이메일):</strong> <span class="font-mono text-gray-900 dark:text-white text-sm">' + tempId + '</span></div>' +
                    '<div>• <strong>주문 번호:</strong> <span class="font-mono text-gray-900 dark:text-white text-sm">' + paymentId + '</span></div>' +
                    '<div>• <strong>주문 비밀번호:</strong> <span class="font-mono text-gray-900 dark:text-white text-sm">' + guestPasswordHint + '</span></div>' +
                    '<div class="pt-2 text-[11px] text-gray-500">• 위 정보로 <strong>[주문 내역(YOUR ORDERS)]</strong> 페이지에서 비회원 주문을 조회하실 수 있습니다.</div>' +
                '</div>' +
            '</div>';
        }
        partialHtml = partialHtml.replace('<div id="guest-info-placeholder"></div>', guestHtml);
        
        return renderUtil.render(c, partialHtml, { title: "Order Complete - D'roll Shop" });
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



// Guest: Lookup guest order securely
routerAdd("POST", "/api/guest/order-lookup", (e) => {
    try {
        const data = e.requestInfo().body;
        const tempId = (data.tempId || "").trim();
        const orderId = (data.orderId || "").trim();
        const password = (data.password || "").trim();

        if (!tempId || !orderId || !password) {
            return e.json(400, { error: "모든 필드를 입력해 주세요." });
        }

        // Fetch order
        const orders = $app.findRecordsByFilter("orders", "id = {:orderId}", "", 1, 0, { orderId: orderId });
        if (!orders || orders.length === 0) {
            return e.json(404, { error: "일치하는 주문을 찾을 수 없습니다." });
        }

        const order = orders[0];
        
        // Ensure it is a guest order (no user field set)
        if (order.getString("user") !== "") {
            return e.json(400, { error: "회원 주문 건입니다. 로그인 후 조회해 주세요." });
        }

        const guestInfo = order.get("guest_info");
        if (!guestInfo) {
            return e.json(404, { error: "비회원 주문 정보를 찾을 수 없습니다." });
        }

        // Compare details (clean phone number and normalize emails)
        const normalizePhone = (num) => (num || "").replace(/[^0-9]/g, "");
        const inputTempIdNormalized = tempId.toLowerCase();
        
        const dbPhoneClean = normalizePhone(guestInfo.phone || order.getString("recipient_phone"));
        const dbEmail = (guestInfo.email || "").toLowerCase();
        const dbTempId = (guestInfo.temp_id || "").toLowerCase();

        const inputCleanPhone = normalizePhone(tempId);
        const matchTempId = (inputTempIdNormalized === dbPhoneClean || 
                             inputTempIdNormalized === dbEmail || 
                             inputTempIdNormalized === dbTempId ||
                             normalizePhone(tempId) === dbPhoneClean ||
                             (inputCleanPhone.length === 4 && dbPhoneClean.endsWith(inputCleanPhone)));

        const matchPassword = (password === guestInfo.password);

        if (!matchTempId || !matchPassword) {
            return e.json(401, { error: "주문 정보 또는 비밀번호가 일치하지 않습니다." });
        }

        // Fetch order items and products
        const orderItems = $app.findRecordsByFilter("order_items", "order = {:orderId}", "", 100, 0, { orderId: orderId });
        const items = [];
        for (let item of orderItems) {
            let productData = null;
            try {
                const product = $app.findRecordById("products", item.getString("product"));
                productData = {
                    id: product.id,
                    name: product.getString("name"),
                    price: product.getInt("price"),
                    images: product.get("images"),
                    collectionId: product.collectionId
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

        // Format result matching client expectation
        const result = {
            id: order.id,
            created: order.getString("created"),
            status: order.getString("status"),
            total_amount: order.getInt("total_amount"),
            recipient_name: order.getString("recipient_name") || guestInfo.name || "",
            recipient_phone: order.getString("recipient_phone") || guestInfo.phone || "",
            shipping_address: order.getString("shipping_address") || "",
            shipping_address_detail: order.getString("shipping_address_detail") || "",
            shipping_memo: order.getString("shipping_memo") || "",
            courier_name: order.getString("courier_name") || "",
            tracking_number: order.getString("tracking_number") || "",
            expand: {
                order_items_via_order: items
            }
        };

        return e.json(200, { items: [result] }); // Return in an items array to match getList result
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

// Guest: Request order cancellation
routerAdd("POST", "/api/guest/orders/{id}/request-cancel", (e) => {
    try {
        const orderId = e.request.pathValue("id");
        const data = e.requestInfo().body;
        const tempId = (data.tempId || "").trim();
        const password = (data.password || "").trim();

        if (!tempId || !password) {
            return e.json(400, { error: "임시 아이디와 비밀번호를 입력해주세요." });
        }

        const order = $app.findRecordById("orders", orderId);
        
        if (order.getString("user") !== "") {
            return e.json(400, { error: "비회원 주문이 아닙니다." });
        }

        const guestInfo = order.get("guest_info");
        if (!guestInfo) {
            return e.json(404, { error: "비회원 주문 정보를 찾을 수 없습니다." });
        }

        const normalizePhone = (num) => (num || "").replace(/[^0-9]/g, "");
        const inputTempIdNormalized = tempId.toLowerCase();
        const dbPhoneClean = normalizePhone(guestInfo.phone || order.getString("recipient_phone"));
        const dbEmail = (guestInfo.email || "").toLowerCase();
        
        const inputCleanPhone = normalizePhone(tempId);
        const matchTempId = (inputTempIdNormalized === dbPhoneClean || 
                             inputTempIdNormalized === dbEmail || 
                             normalizePhone(tempId) === dbPhoneClean ||
                             (inputCleanPhone.length === 4 && dbPhoneClean.endsWith(inputCleanPhone)));
        const matchPassword = (password === guestInfo.password);

        if (!matchTempId || !matchPassword) {
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
        const orderId = e.request.pathValue("id");
        const data = e.requestInfo().body;
        const tempId = (data.tempId || "").trim();
        const password = (data.password || "").trim();

        if (!tempId || !password) {
            return e.json(400, { error: "임시 아이디와 비밀번호를 입력해주세요." });
        }

        const order = $app.findRecordById("orders", orderId);
        
        if (order.getString("user") !== "") {
            return e.json(400, { error: "비회원 주문이 아닙니다." });
        }

        const guestInfo = order.get("guest_info");
        if (!guestInfo) {
            return e.json(404, { error: "비회원 주문 정보를 찾을 수 없습니다." });
        }

        const normalizePhone = (num) => (num || "").replace(/[^0-9]/g, "");
        const inputTempIdNormalized = tempId.toLowerCase();
        const dbPhoneClean = normalizePhone(guestInfo.phone || order.getString("recipient_phone"));
        const dbEmail = (guestInfo.email || "").toLowerCase();
        
        const inputCleanPhone = normalizePhone(tempId);
        const matchTempId = (inputTempIdNormalized === dbPhoneClean || 
                             inputTempIdNormalized === dbEmail || 
                             normalizePhone(tempId) === dbPhoneClean ||
                             (inputCleanPhone.length === 4 && dbPhoneClean.endsWith(inputCleanPhone)));
        const matchPassword = (password === guestInfo.password);

        if (!matchTempId || !matchPassword) {
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
