routerAdd("GET", "/api/test-create", (c) => {
    try {
        const collection = $app.findCollectionByNameOrId("products");
        const record = new Record(collection);
        record.set("name", "Test Name");
        record.set("slug", "test-slug-123");
        record.set("price", 1000);
        $app.save(record);
        return c.json(200, { success: true, id: record.id });
    } catch(err) {
        return c.json(500, { error: err.toString() });
    }
});
