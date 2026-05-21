migrate((app) => {
    let collection = app.findCollectionByNameOrId("orders");
    collection.fields.add(new TextField({ name: "courier_name", required: false }));
    collection.fields.add(new TextField({ name: "tracking_number", required: false }));
    app.save(collection);
}, (app) => {
    let collection = app.findCollectionByNameOrId("orders");
    collection.fields.removeByIdOrName("courier_name");
    collection.fields.removeByIdOrName("tracking_number");
    app.save(collection);
});
