// Auto-set API rules for orders and order_items on bootstrap
onBootstrap((e) => {
    e.next();
    try {
        // Set orders collection rules: authenticated user can only view their own
        const orders = e.app.findCollectionByNameOrId("orders");
        orders.listRule = '@request.auth.id != "" && user = @request.auth.id';
        orders.viewRule = '@request.auth.id != "" && user = @request.auth.id';
        e.app.save(orders);

        // Set order_items collection rules
        const orderItems = e.app.findCollectionByNameOrId("order_items");
        orderItems.listRule = '@request.auth.id != "" && order.user = @request.auth.id';
        orderItems.viewRule = '@request.auth.id != "" && order.user = @request.auth.id';
        e.app.save(orderItems);

        console.log("[bootstrap] API rules set for orders & order_items");
    } catch (err) {
        console.error("[bootstrap] Failed to set API rules:", err);
    }
});
