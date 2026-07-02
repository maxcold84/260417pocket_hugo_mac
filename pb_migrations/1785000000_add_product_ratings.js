migrate((app) => {
    const products = app.findCollectionByNameOrId("products");
    products.fields.add(new NumberField({
        name: "rating_average",
        required: false
    }));
    products.fields.add(new NumberField({
        name: "rating_count",
        required: false
    }));
    app.save(products);

    const comments = app.findCollectionByNameOrId("product_comments");
    comments.fields.add(new NumberField({
        name: "rating",
        required: false
    }));
    app.save(comments);

    const pageSize = 100;
    for (let productOffset = 0; ; productOffset += pageSize) {
        const productPage = app.findRecordsByFilter("products", "1=1", "", pageSize, productOffset) || [];

        for (const product of productPage) {
            let sum = 0;
            let count = 0;

            for (let commentOffset = 0; ; commentOffset += pageSize) {
                const commentPage = app.findRecordsByFilter(
                    "product_comments",
                    "product = {:productId} && status = \"published\"",
                    "",
                    pageSize,
                    commentOffset,
                    { productId: product.id }
                ) || [];

                for (const comment of commentPage) {
                    const rating = Math.round(Number(comment.get("rating") || 0));
                    if (rating >= 1 && rating <= 5) {
                        sum += rating;
                        count += 1;
                    }
                }

                if (commentPage.length < pageSize) break;
            }

            product.set("rating_average", count > 0 ? Math.round((sum / count) * 10) / 10 : 0);
            product.set("rating_count", count);
            app.save(product);
        }

        if (productPage.length < pageSize) break;
    }
}, (app) => {
    const comments = app.findCollectionByNameOrId("product_comments");
    comments.fields.removeByIdOrName("rating");
    app.save(comments);

    const products = app.findCollectionByNameOrId("products");
    products.fields.removeByIdOrName("rating_average");
    products.fields.removeByIdOrName("rating_count");
    app.save(products);
});
