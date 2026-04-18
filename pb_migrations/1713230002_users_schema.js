migrate((app) => {
    let users = app.findCollectionByNameOrId("users");
    
    // Check if fields exist to avoid duplicate panics, though strictly not necessary since we know base users doesn't have them yet.
    users.fields.add(new TextField({ name: "nickname" }));
    users.fields.add(new TextField({ name: "phone" }));
    users.fields.add(new TextField({ name: "address" }));

    app.save(users);
}, (app) => {
    let users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("nickname");
    users.fields.removeByName("phone");
    users.fields.removeByName("address");
    app.save(users);
});
