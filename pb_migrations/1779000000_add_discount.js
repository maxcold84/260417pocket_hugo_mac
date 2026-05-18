migrate((app) => {
    let collection = app.findCollectionByNameOrId("products");
    collection.fields.add(new NumberField({
        name: "discount_price",
        required: false
    }));
    app.save(collection);
}, (app) => {
    let collection = app.findCollectionByNameOrId("products");
    collection.fields.removeByIdOrName("discount_price");
    app.save(collection);
});
