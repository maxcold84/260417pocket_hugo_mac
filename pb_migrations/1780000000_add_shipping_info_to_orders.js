migrate((app) => {
    let collection = app.findCollectionByNameOrId("orders");
    collection.fields.add(new TextField({ name: "recipient_name", required: false }));
    collection.fields.add(new TextField({ name: "recipient_phone", required: false }));
    collection.fields.add(new TextField({ name: "shipping_address", required: false }));
    collection.fields.add(new TextField({ name: "shipping_address_detail", required: false }));
    collection.fields.add(new TextField({ name: "shipping_memo", required: false }));
    app.save(collection);
}, (app) => {
    let collection = app.findCollectionByNameOrId("orders");
    collection.fields.removeByIdOrName("recipient_name");
    collection.fields.removeByIdOrName("recipient_phone");
    collection.fields.removeByIdOrName("shipping_address");
    collection.fields.removeByIdOrName("shipping_address_detail");
    collection.fields.removeByIdOrName("shipping_memo");
    app.save(collection);
});
