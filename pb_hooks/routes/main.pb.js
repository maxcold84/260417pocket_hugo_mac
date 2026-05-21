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
            newOrder.set("guest_info", data.guestInfo || {});
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
        let partialHtml = $template.loadFiles(`${__hooks}/views/order-complete.html`).render({});
        partialHtml = partialHtml.replace("{{.paymentId}}", paymentId);
        
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
