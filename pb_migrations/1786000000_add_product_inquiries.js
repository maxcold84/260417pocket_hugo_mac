migrate((app) => {
    const products = app.findCollectionByNameOrId("products");
    const users = app.findCollectionByNameOrId("users");

    const inquiries = new Collection({
        name: "product_inquiries",
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
    fields.add(new TextField({ name: "title", required: true }));
    fields.add(new TextField({ name: "content", required: true }));
    fields.add(new BoolField({ name: "is_secret", required: false }));
    fields.add(new SelectField({
        name: "status",
        required: true,
        values: ["pending", "answered", "hidden"],
        maxSelect: 1
    }));
    fields.add(new TextField({ name: "answer", required: false }));
    fields.add(new TextField({ name: "answered_at", required: false }));
    fields.add(new TextField({ name: "answered_by", required: false }));

    inquiries.fields = fields;
    inquiries.listRule = null;
    inquiries.viewRule = null;
    inquiries.createRule = null;
    inquiries.updateRule = null;
    inquiries.deleteRule = null;

    app.save(inquiries);
}, (app) => {
    try {
        app.delete(app.findCollectionByNameOrId("product_inquiries"));
    } catch (err) {
        console.log("Could not drop collection: product_inquiries");
    }
});
