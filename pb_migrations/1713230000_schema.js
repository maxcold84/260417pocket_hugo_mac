migrate((app) => {
    // Categories
    let categories = new Collection({
        name: "categories",
        type: "base"
    });
    let catSchema = new FieldsList();
    catSchema.add(new TextField({ name: "name", required: true }));
    catSchema.add(new TextField({ name: "slug", required: true }));
    catSchema.add(new NumberField({ name: "sort_order" }));
    categories.fields = catSchema;
    app.save(categories);

    // Products
    let products = new Collection({
        name: "products",
        type: "base"
    });
    let prodSchema = new FieldsList();
    prodSchema.add(new TextField({ name: "name", required: true }));
    prodSchema.add(new TextField({ name: "slug", required: true }));
    prodSchema.add(new EditorField({ name: "description" }));
    prodSchema.add(new NumberField({ name: "price", required: true }));
    prodSchema.add(new FileField({ name: "images", maxSelect: 5, maxSize: 5242880, mimeTypes: ["image/jpeg","image/png","image/webp"] }));
    prodSchema.add(new NumberField({ name: "stock" }));
    prodSchema.add(new RelationField({ name: "category", collectionId: categories.id, cascadeDelete: false }));
    products.fields = prodSchema;
    app.save(products);

    // Cart Items
    let cartItems = new Collection({
        name: "cart_items",
        type: "base"
    });
    let cartSchema = new FieldsList();
    cartSchema.add(new RelationField({ name: "user", required: false, collectionId: "_pb_users_auth_", cascadeDelete: true }));
    cartSchema.add(new RelationField({ name: "product", required: true, collectionId: products.id, cascadeDelete: true }));
    cartSchema.add(new NumberField({ name: "quantity", required: true }));
    cartSchema.add(new TextField({ name: "session_id" }));
    cartItems.fields = cartSchema;
    app.save(cartItems);

    // Orders
    let orders = new Collection({
        name: "orders",
        type: "base"
    });
    let orderSchema = new FieldsList();
    orderSchema.add(new RelationField({ name: "user", required: false, collectionId: "_pb_users_auth_", cascadeDelete: false }));
    orderSchema.add(new TextField({ name: "payment_id" }));
    orderSchema.add(new SelectField({ name: "status", values: ["pending", "paid", "cancelled", "refunded"], maxSelect: 1 }));
    orderSchema.add(new NumberField({ name: "total_amount", required: true }));
    orderSchema.add(new JSONField({ name: "items" }));
    orderSchema.add(new JSONField({ name: "guest_info" }));
    orderSchema.add(new TextField({ name: "portone_tx_id" }));
    orders.fields = orderSchema;
    app.save(orders);

    // Order Items
    let orderItems = new Collection({
        name: "order_items",
        type: "base"
    });
    let orderItemSchema = new FieldsList();
    orderItemSchema.add(new RelationField({ name: "order", required: true, collectionId: orders.id, cascadeDelete: true }));
    orderItemSchema.add(new RelationField({ name: "product", required: true, collectionId: products.id, cascadeDelete: false }));
    orderItemSchema.add(new NumberField({ name: "quantity", required: true }));
    orderItemSchema.add(new NumberField({ name: "unit_price", required: true }));
    orderItems.fields = orderItemSchema;
    app.save(orderItems);

}, (app) => {
    const collectionsToDelete = ["order_items", "orders", "cart_items", "products", "categories"];
    for (let c of collectionsToDelete) {
        try {
            app.delete(app.findCollectionByNameOrId(c));
        } catch(err) {
            console.log("Could not drop collection: " + c);
        }
    }
})
