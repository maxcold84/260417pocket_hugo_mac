migrate((app) => {
    let collection = app.findCollectionByNameOrId("products");
    
    // Find the images field and update maxSize to 20MB (20971520 bytes)
    let imagesField = collection.fields.getByName("images");
    if (imagesField) {
        imagesField.maxSize = 20971520;
        app.save(collection);
    }
}, (app) => {
    let collection = app.findCollectionByNameOrId("products");
    
    let imagesField = collection.fields.getByName("images");
    if (imagesField) {
        imagesField.maxSize = 5242880;
        app.save(collection);
    }
});
