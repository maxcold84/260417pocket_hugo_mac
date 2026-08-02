migrate((app) => {
    const products = app.findCollectionByNameOrId("products");
    const users = app.findCollectionByNameOrId("users");

    const comments = new Collection({
        name: "product_comments",
        type: "base"
    });

    const fields = new FieldsList();
    fields.add(new RelationField({
        name: "product",
        required: true,
        collectionId: products.id,
        cascadeDelete: true
    }));
    fields.add(new RelationField({
        name: "user",
        required: true,
        collectionId: users.id,
        cascadeDelete: false
    }));
    fields.add(new TextField({ name: "author_name", required: false }));
    fields.add(new TextField({ name: "content", required: true }));
    fields.add(new SelectField({
        name: "status",
        required: true,
        values: ["published", "hidden"],
        maxSelect: 1
    }));

    comments.fields = fields;
    comments.listRule = null;
    comments.viewRule = null;
    comments.createRule = null;
    comments.updateRule = null;
    comments.deleteRule = null;

    app.save(comments);
}, (app) => {
    try {
        app.delete(app.findCollectionByNameOrId("product_comments"));
    } catch (err) {
        console.log("Could not drop collection: product_comments");
    }
});
