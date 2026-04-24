migrate((app) => {
    // 1. Update collection rules to public
    const products = app.findCollectionByNameOrId("products");
    products.listRule = "";
    products.viewRule = "";
    app.save(products);

    const categories = app.findCollectionByNameOrId("categories");
    categories.listRule = "";
    categories.viewRule = "";
    app.save(categories);

    // 2. Insert test product if empty
    try {
        let existingProducts = app.findRecordsByFilter("products", "1=1", "", 1, 0, {});
        if (!existingProducts || existingProducts.length === 0) {
            let newRecord = new Record(products);
            newRecord.set("name", "BMW Leather M Sport Wallet");
            newRecord.set("slug", "bmw-leather-wallet");
            newRecord.set("price", 125000);
            newRecord.set("stock", 50);
            app.save(newRecord);

            let newRecord2 = new Record(products);
            newRecord2.set("name", "BMW Performance Keychain");
            newRecord2.set("slug", "bmw-keychain");
            newRecord2.set("price", 35000);
            newRecord2.set("stock", 0); // Sold out test
            app.save(newRecord2);
            
            let newRecord3 = new Record(products);
            newRecord3.set("name", "BMW M Series Model 1:18");
            newRecord3.set("slug", "bmw-m-model");
            newRecord3.set("price", 280000);
            newRecord3.set("stock", 10);
            app.save(newRecord3);
        }
    } catch(err) {
        console.log("Error inserting test products: " + err);
    }
}, (app) => {
    const products = app.findCollectionByNameOrId("products");
    products.listRule = null;
    products.viewRule = null;
    app.save(products);

    const categories = app.findCollectionByNameOrId("categories");
    categories.listRule = null;
    categories.viewRule = null;
    app.save(categories);
});
