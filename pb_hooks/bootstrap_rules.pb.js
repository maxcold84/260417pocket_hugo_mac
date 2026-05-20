// Auto-set API rules and ensure cancel_requested status option exists
onBootstrap((e) => {
    e.next();
    try {
        // Set orders collection rules: authenticated user can only view their own
        const orders = e.app.findCollectionByNameOrId("orders");

        // Ensure 'cancel_requested' is in the status field options
        const fields = orders.fields;
        for (let i = 0; i < fields.length; i++) {
            const f = fields[i];
            if (f.name === "status" && f.values) {
                const hasOption = f.values.indexOf("cancel_requested") >= 0;
                if (!hasOption) {
                    f.values.push("cancel_requested");
                    console.log("[bootstrap] Added 'cancel_requested' to orders.status options");
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

        console.log("[bootstrap] API rules set for orders & order_items");
    } catch (err) {
        console.error("[bootstrap] Failed to set API rules:", err);
    }
});
