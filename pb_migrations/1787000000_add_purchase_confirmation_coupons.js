migrate((app) => {
    const orders = app.findCollectionByNameOrId("orders");
    const users = app.findCollectionByNameOrId("users");
    const products = app.findCollectionByNameOrId("products");
    const comments = app.findCollectionByNameOrId("product_comments");

    const settings = new Collection({
        name: "coupon_settings",
        type: "base"
    });
    const settingFields = new FieldsList();
    settingFields.add(new TextField({ name: "key", required: true }));
    settingFields.add(new BoolField({ name: "enabled", required: false }));
    settingFields.add(new SelectField({
        name: "discount_type",
        required: true,
        values: ["fixed", "percent"],
        maxSelect: 1
    }));
    settingFields.add(new NumberField({ name: "discount_value", required: false }));
    settingFields.add(new NumberField({ name: "expires_days", required: false }));
    settingFields.add(new NumberField({ name: "minimum_order_amount", required: false }));
    settingFields.add(new NumberField({ name: "max_discount_amount", required: false }));
    settings.fields = settingFields;
    settings.listRule = null;
    settings.viewRule = null;
    settings.createRule = null;
    settings.updateRule = null;
    settings.deleteRule = null;
    app.save(settings);

    const userCoupons = new Collection({
        name: "user_coupons",
        type: "base"
    });
    const couponFields = new FieldsList();
    couponFields.add(new RelationField({
        name: "user",
        required: true,
        collectionId: users.id,
        cascadeDelete: true
    }));
    couponFields.add(new TextField({ name: "code", required: true }));
    couponFields.add(new SelectField({
        name: "status",
        required: true,
        values: ["available", "reserved", "used", "expired", "void"],
        maxSelect: 1
    }));
    couponFields.add(new SelectField({
        name: "discount_type",
        required: true,
        values: ["fixed", "percent"],
        maxSelect: 1
    }));
    couponFields.add(new NumberField({ name: "discount_value", required: false }));
    couponFields.add(new NumberField({ name: "minimum_order_amount", required: false }));
    couponFields.add(new NumberField({ name: "max_discount_amount", required: false }));
    couponFields.add(new TextField({ name: "source_type", required: false }));
    couponFields.add(new RelationField({
        name: "source_product",
        required: false,
        collectionId: products.id,
        cascadeDelete: false
    }));
    couponFields.add(new RelationField({
        name: "source_comment",
        required: false,
        collectionId: comments.id,
        cascadeDelete: false
    }));
    couponFields.add(new RelationField({
        name: "reserved_order",
        required: false,
        collectionId: orders.id,
        cascadeDelete: false
    }));
    couponFields.add(new RelationField({
        name: "redeemed_order",
        required: false,
        collectionId: orders.id,
        cascadeDelete: false
    }));
    couponFields.add(new TextField({ name: "issued_at", required: false }));
    couponFields.add(new TextField({ name: "expires_at", required: false }));
    couponFields.add(new TextField({ name: "used_at", required: false }));
    userCoupons.fields = couponFields;
    userCoupons.listRule = '@request.auth.id != "" && user = @request.auth.id';
    userCoupons.viewRule = '@request.auth.id != "" && user = @request.auth.id';
    userCoupons.createRule = null;
    userCoupons.updateRule = null;
    userCoupons.deleteRule = null;
    app.save(userCoupons);

    const orderFields = orders.fields;
    for (let i = 0; i < orderFields.length; i++) {
        const field = orderFields[i];
        if (field.name === "status" && field.values && field.values.indexOf("purchase_confirmed") === -1) {
            field.values.push("purchase_confirmed");
            break;
        }
    }
    orders.fields.add(new TextField({ name: "purchase_confirmed_at", required: false }));
    orders.fields.add(new NumberField({ name: "subtotal_amount", required: false }));
    orders.fields.add(new RelationField({
        name: "coupon",
        required: false,
        collectionId: userCoupons.id,
        cascadeDelete: false
    }));
    orders.fields.add(new NumberField({ name: "coupon_discount_amount", required: false }));
    orders.fields.add(new TextField({ name: "coupon_code_snapshot", required: false }));
    app.save(orders);

    const record = new Record(settings);
    record.set("key", "review_reward");
    record.set("enabled", true);
    record.set("discount_type", "fixed");
    record.set("discount_value", 5000);
    record.set("expires_days", 30);
    record.set("minimum_order_amount", 0);
    record.set("max_discount_amount", 0);
    app.save(record);
}, (app) => {
    const orders = app.findCollectionByNameOrId("orders");
    const orderFields = orders.fields;
    for (let i = 0; i < orderFields.length; i++) {
        const field = orderFields[i];
        if (field.name === "status" && field.values) {
            const idx = field.values.indexOf("purchase_confirmed");
            if (idx > -1) field.values.splice(idx, 1);
            break;
        }
    }
    orders.fields.removeByIdOrName("purchase_confirmed_at");
    orders.fields.removeByIdOrName("subtotal_amount");
    orders.fields.removeByIdOrName("coupon");
    orders.fields.removeByIdOrName("coupon_discount_amount");
    orders.fields.removeByIdOrName("coupon_code_snapshot");
    app.save(orders);

    try {
        app.delete(app.findCollectionByNameOrId("user_coupons"));
    } catch (err) {
        console.log("Could not drop collection: user_coupons");
    }
    try {
        app.delete(app.findCollectionByNameOrId("coupon_settings"));
    } catch (err) {
        console.log("Could not drop collection: coupon_settings");
    }
});
