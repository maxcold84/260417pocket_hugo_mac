// In a real scenario, use $apis.requireAuth() for protected paths

routerAdd("POST", "/api/orders/prep", (e) => {
    try {
        const data = e.requestInfo().body;
        const cart = data.cart;
        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return e.json(400, { error: "Cart is empty" });
        }

        const userId = e.auth ? e.auth.id : null;
        let subtotal = 0;
        let itemsToSave = [];

        for (let item of cart) {
            // Verify product against DB
            const products = $app.findRecordsByFilter("products", "id = {:id}", "", 1, 0, { "id": item.id });
            if (!products || products.length === 0) return e.json(404, { error: "Product not found: " + item.id });
            
            const product = products[0];
            const price = product.getInt("price");
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


routerAdd("GET", "/checkout", (c) => {
    try {
        const renderUtil = require(`${__hooks}/utils/render.js`);
        const partialHtml = $template.loadFiles(`${__hooks}/views/checkout.html`).render({
            portoneStoreId: $os.getenv("PORTONE_STORE_ID") || "store-placeholder",
            channelKeyKakaopay: $os.getenv("PORTONE_CHANNEL_KEY_KAKAOPAY") || "",
            channelKeyInicis: $os.getenv("PORTONE_CHANNEL_KEY_INICIS") || "",
            channelKeyKcp: $os.getenv("PORTONE_CHANNEL_KEY_KCP") || "",
            userEmail: c.auth ? c.auth.getString("email") : "",
            userPhone: c.auth ? c.auth.getString("phone") : ""
        });
        return renderUtil.render(c, partialHtml, { title: "Checkout - D'roll Shop" });
    } catch(err) { return c.json(500, { error: err.toString() }); }
});

routerAdd("GET", "/payment/complete", (c) => {
    try {
        const renderUtil = require(`${__hooks}/utils/render.js`);
        let partialHtml = $template.loadFiles(`${__hooks}/views/order-complete.html`).render({});
        
        const paymentId = c.request.url.query().get("paymentId") || "Unknown";
        partialHtml = partialHtml.replace("{{.paymentId}}", paymentId);
        
        return renderUtil.render(c, partialHtml, { title: "Order Complete - D'roll Shop" });
    } catch(err) { return c.json(500, { error: err.toString() }); }
});



