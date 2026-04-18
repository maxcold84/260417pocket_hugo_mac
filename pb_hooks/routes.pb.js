// In a real scenario, use $apis.requireAuth() for protected paths


routerAdd("GET", "/cart", (c) => {
    try {
        const render = require(`${__hooks}/helpers/render.js`);
        const layout = require(`${__hooks}/templates/layout.js`);
        const cartView = require(`${__hooks}/templates/cart.js`);
        return c.html(200, render(layout, cartView(c)));
    } catch(err) { return c.json(500, { error: err.toString() }); }
});

routerAdd("GET", "/cart/view", (c) => {
    try {
        const cartFragment = require(`${__hooks}/templates/cart-fragment.js`);
        return c.html(200, cartFragment(c));
    } catch(err) { return c.json(500, { error: err.toString() }); }
});

routerAdd("GET", "/checkout", (c) => {
    try {
        const render = require(`${__hooks}/helpers/render.js`);
        const layout = require(`${__hooks}/templates/layout.js`);
        const checkoutView = require(`${__hooks}/templates/checkout.js`);
        return c.html(200, render(layout, checkoutView(c)));
    } catch(err) { return c.json(500, { error: err.toString() }); }
});

routerAdd("GET", "/payment/complete", (c) => {
    try {
        const render = require(`${__hooks}/helpers/render.js`);
        const layout = require(`${__hooks}/templates/layout.js`);
        const orderCompleteView = require(`${__hooks}/templates/order-complete.js`);
        return c.html(200, render(layout, orderCompleteView(c)));
    } catch(err) { return c.json(500, { error: err.toString() }); }
});

routerAdd("GET", "/my-orders", (c) => {
    try {
        const render = require(`${__hooks}/helpers/render.js`);
        const layout = require(`${__hooks}/templates/layout.js`);
        const myOrdersView = require(`${__hooks}/templates/my-orders.js`);
        return c.html(200, render(layout, myOrdersView(c)));
    } catch(err) { return c.json(500, { error: err.toString() }); }
});

routerAdd("POST", "/api/cart/add", (e) => {
    try {
        const data = e.requestInfo().body;
        const slug = data.slug;
        const qty = parseInt(data.quantity) || 1;
        const sessionId = data.session_id || "";
        
        const userId = e.auth ? e.auth.id : null;
        if (!userId && !sessionId) return e.json(400, { error: "No user or session provided." });

        let products = $app.findRecordsByFilter("products", `slug = {:slug}`, "", 1, 0, { "slug": slug });
        if (!products || products.length === 0) return e.json(404, { error: "Product not found" });
        const product = products[0];

        // Ensure stock is available
        if (product.getInt("stock") < qty) return e.json(400, { error: "Not enough stock" });

        // Check if already in cart
        const filterStr = userId ? "user = {:id} && product = {:prodId}" : "session_id = {:id} && product = {:prodId}";
        const filterID = userId || sessionId;
        let existing = $app.findRecordsByFilter("cart_items", filterStr, "", 1, 0, { "id": filterID, "prodId": product.id });
        
        if (existing && existing.length > 0) {
            let item = existing[0];
            item.set("quantity", item.getInt("quantity") + qty);
            $app.save(item);
        } else {
            let collection = $app.findCollectionByNameOrId("cart_items");
            let newItem = new Record(collection);
            newItem.set("product", product.id);
            newItem.set("quantity", qty);
            if (userId) newItem.set("user", userId);
            else newItem.set("session_id", sessionId);
            $app.save(newItem);
        }

        return e.json(200, { success: true });
    } catch(err) {
        return e.json(500, { error: err.toString() });
    }
});
