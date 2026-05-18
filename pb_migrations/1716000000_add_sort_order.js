migrate((app) => {
    const products = app.findCollectionByNameOrId("products");
    const fields = products.fields;
    fields.add(new NumberField({ name: "sort_order" }));
    products.fields = fields;
    app.save(products);
}, (app) => {
    const products = app.findCollectionByNameOrId("products");
    products.fields.removeByName("sort_order");
    app.save(products);
});
