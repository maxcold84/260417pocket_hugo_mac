migrate((app) => {
    let collection = app.findCollectionByNameOrId("orders");
    
    // Ensure "shipping" and "completed" values exist in status SelectField
    const fields = collection.fields;
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (f.name === "status" && f.values) {
            if (f.values.indexOf("shipping") === -1) f.values.push("shipping");
            if (f.values.indexOf("completed") === -1) f.values.push("completed");
            break;
        }
    }
    
    app.save(collection);
}, (app) => {
    let collection = app.findCollectionByNameOrId("orders");
    
    const fields = collection.fields;
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (f.name === "status" && f.values) {
            const idx1 = f.values.indexOf("shipping");
            if (idx1 > -1) f.values.splice(idx1, 1);
            const idx2 = f.values.indexOf("completed");
            if (idx2 > -1) f.values.splice(idx2, 1);
            break;
        }
    }
    
    app.save(collection);
});
