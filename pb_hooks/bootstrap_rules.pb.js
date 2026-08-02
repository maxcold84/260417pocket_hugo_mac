onBootstrap((e) => {
    e.next();
    try {
        // Sync categories from TOML first using the new utility module
        try {
            const cmsUtil = require(`${__hooks}/utils/cms.js`);
            cmsUtil.syncCategoriesFromToml(e.app);
        } catch (catErr) {
            console.error("[bootstrap] Failed to sync categories from TOML:", catErr);
        }

        // Set orders collection rules: authenticated user can only view their own
        const orders = e.app.findCollectionByNameOrId("orders");

        const fields = orders.fields;
        for (let i = 0; i < fields.length; i++) {
            const f = fields[i];
            if (f.name === "status" && f.values) {
                if (f.values.indexOf("cancel_requested") === -1) {
                    f.values.push("cancel_requested");
                    console.log("[bootstrap] Added 'cancel_requested' to orders.status options");
                }
                if (f.values.indexOf("purchase_confirmed") === -1) {
                    f.values.push("purchase_confirmed");
                    console.log("[bootstrap] Added 'purchase_confirmed' to orders.status options");
                }
                break;
            }
        }

        // Ensure 'created' and 'updated' autodate fields exist
        let hasCreated = false;
        let hasUpdated = false;
        for (let i = 0; i < fields.length; i++) {
            if (fields[i].name === "created") hasCreated = true;
            if (fields[i].name === "updated") hasUpdated = true;
        }
        if (!hasCreated) {
            orders.fields.add(new AutodateField({
                id: "autodate_created",
                name: "created",
                onCreate: true,
                onUpdate: false,
            }));
            console.log("[bootstrap] Added 'created' autodate field to orders");
        }
        if (!hasUpdated) {
            orders.fields.add(new AutodateField({
                id: "autodate_updated",
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }));
            console.log("[bootstrap] Added 'updated' autodate field to orders");
        }

        orders.listRule = '@request.auth.id != "" && user = @request.auth.id';
        orders.viewRule = '@request.auth.id != "" && user = @request.auth.id';
        e.app.save(orders);

        // Set order_items collection rules
        const orderItems = e.app.findCollectionByNameOrId("order_items");
        orderItems.listRule = '@request.auth.id != "" && order.user = @request.auth.id';
        orderItems.viewRule = '@request.auth.id != "" && order.user = @request.auth.id';
        e.app.save(orderItems);

        try {
            const userCoupons = e.app.findCollectionByNameOrId("user_coupons");
            userCoupons.listRule = '@request.auth.id != "" && user = @request.auth.id';
            userCoupons.viewRule = '@request.auth.id != "" && user = @request.auth.id';
            userCoupons.createRule = null;
            userCoupons.updateRule = null;
            userCoupons.deleteRule = null;
            e.app.save(userCoupons);
        } catch (couponErr) {}

        console.log("[bootstrap] API rules set for orders & order_items");
    } catch (err) {
        console.error("[bootstrap] Failed to set API rules:", err);
    }
});
