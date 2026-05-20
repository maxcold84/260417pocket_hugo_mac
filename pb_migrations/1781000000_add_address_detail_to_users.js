migrate((app) => {
    let users = app.findCollectionByNameOrId("users");
    users.fields.add(new TextField({ name: "address_detail", required: false }));
    app.save(users);
}, (app) => {
    let users = app.findCollectionByNameOrId("users");
    users.fields.removeByIdOrName("address_detail");
    app.save(users);
});
