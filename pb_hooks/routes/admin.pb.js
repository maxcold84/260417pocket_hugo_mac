routerAdd("POST", "/api/cms/rebuild", (e) => {
    try {
        // Step 1: Get all current products from DB — collect slugs and image filenames
        const products = $app.findRecordsByFilter("products", "1=1", "", 1000, 0);
        const dbSlugs = {};
        const usedImagePrefixes = []; // original image filenames used by active products
        for (let p of products) {
            const slug = p.getString("slug");
            if (slug) dbSlugs[slug] = true;
            const images = p.getStringSlice("images");
            if (images && images.length > 0) {
                for (let img of images) {
                    const base = img.replace(/\.[^.]+$/, "");
                    usedImagePrefixes.push(base);
                }
            }
        }

        // Step 2: Remove orphaned product markdown + static output folder
        let deletedProductCount = 0;
        try {
            const entries = $os.readDir("hugo/content/products");
            for (let entry of entries) {
                const filename = entry.name();
                if (!filename.endsWith(".md")) continue;
                const slug = filename.slice(0, -3);
                if (!dbSlugs[slug]) {
                    try { $os.remove("hugo/content/products/" + filename); } catch (e) {}
                    try { $os.removeAll("pb_public/products/" + slug); } catch (e) {}
                    deletedProductCount++;
                }
            }
        } catch (e) {
            console.error("readDir (products) error:", e);
        }

        // Helper: check if a generated image file is still used by an active product
        function isImageUsed(filename) {
            for (let prefix of usedImagePrefixes) {
                if (filename.indexOf(prefix) === 0) return true;
            }
            return false;
        }

        // Step 3: Remove orphaned Hugo-generated images from hugo/resources/_gen/images/
        let deletedImageCount = 0;
        try {
            const resEntries = $os.readDir("hugo/resources/_gen/images");
            for (let entry of resEntries) {
                const filename = entry.name();
                if (!isImageUsed(filename)) {
                    try { $os.remove("hugo/resources/_gen/images/" + filename); } catch (e) {}
                    deletedImageCount++;
                }
            }
        } catch (e) {
            console.error("readDir (resources/_gen/images) error:", e);
        }

        // Step 4: Remove orphaned published images from pb_public/
        try {
            const pubEntries = $os.readDir("pb_public");
            for (let entry of pubEntries) {
                const filename = entry.name();
                if (!filename.endsWith(".webp") && !filename.endsWith(".jpg") && !filename.endsWith(".png")) continue;
                if (!isImageUsed(filename)) {
                    try { $os.remove("pb_public/" + filename); } catch (e) {}
                    deletedImageCount++;
                }
            }
        } catch (e) {
            console.error("readDir (pb_public) error:", e);
        }

        // Step 5: Write/update markdown files for all current DB products
        let syncedCount = 0;
        for (let p of products) {
            const slug = p.getString("slug");
            if (!slug) continue;

            const name = p.getString("name").replace(/"/g, '\\"');
            const price = p.getInt("price");
            const description = p.getString("description");

            const images = p.getStringSlice("images");
            let imageLine = "";
            if (images && images.length > 0) {
                const collectionId = p.collection().id;
                const recordId = p.id;
                let imageUrls = [];
                for (let img of images) {
                    imageUrls.push('"http://127.0.0.1:8090/api/files/' + collectionId + '/' + recordId + '/' + img + '"');
                }
                imageLine = '\nimages: [' + imageUrls.join(', ') + ']\nimage: ' + imageUrls[0];
            }

            const content = '---\nid: "' + p.id + '"\ntitle: "' + name + '"\nprice: ' + price + imageLine + '\n---\n' + description + '\n';
            $os.writeFile("hugo/content/products/" + slug + ".md", content, 0o644);
            syncedCount++;
        }

        // Step 6: Run Hugo with --ignoreCache
        const hugoCmd = $os.cmd("hugo", "--ignoreCache");
        hugoCmd.dir = "hugo";
        hugoCmd.run();

        return e.json(200, {
            message: "Sync complete: " + syncedCount + " products synced, " + deletedProductCount + " pages removed, " + deletedImageCount + " orphaned images cleaned."
        });
    } catch (err) {
        console.error("Rebuild error:", err);
        return e.json(500, { error: String(err) });
    }
}, $apis.requireSuperuserAuth());
routerAdd("GET", "/cms", (e) => {
    try {
        const renderUtil = require(`${__hooks}/utils/render.js`);
        const partialHtml = $template.loadFiles(`${__hooks}/views/admin/dashboard.html`).render({});
        return renderUtil.render(e, partialHtml, { title: "CMS 통합 관리" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/cms/orders", (e) => {
    try {
        const renderUtil = require(`${__hooks}/utils/render.js`);
        const orders = $app.findRecordsByFilter("orders", "1=1", "-created", 100, 0);
        for (let order of orders) {
            try { $app.expandRecord(order, ["user"], null); } catch (e) {}
        }
        const partialHtml = $template.loadFiles(`${__hooks}/views/admin/order-list.html`).render({
            orders: orders
        });
        return renderUtil.render(e, partialHtml, { title: "주문 관리 - CMS" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/cms/orders/:id", (e) => {
    try {
        const renderUtil = require(`${__hooks}/utils/render.js`);
        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);
        
        // Expand user and order items
        $app.expandRecord(order, ["user"], null);
        
        const items = $app.findRecordsByFilter("order_items", "order = {:id}", "created", 100, 0, { id: orderId });
        const itemsWithTotals = items.map(item => {
            $app.expandRecord(item, ["product"], null);
            const plain = item.publicExport();
            // Manually re-add expanded product because publicExport might not include it nicely in some Goja versions
            plain.expand = {
                product: item.expandedOne("product") ? item.expandedOne("product").publicExport() : null
            };
            plain.total_price = item.getInt("unit_price") * item.getInt("quantity");
            return plain;
        });

        const partialHtml = $template.loadFiles(`${__hooks}/views/admin/order-detail.html`).render({
            order: order,
            items: itemsWithTotals
        });
        return renderUtil.render(e, partialHtml, { title: "주문 상세 - CMS" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/orders/:id/update", (e) => {
    try {
        const orderId = e.request.pathValue("id");
        const data = e.requestInfo().body;
        
        const order = $app.findRecordById("orders", orderId);
        if (data.status) order.set("status", data.status);
        if (data.courier_name) order.set("courier_name", data.courier_name);
        if (data.tracking_number) order.set("tracking_number", data.tracking_number);
        
        $app.save(order);
        
        return e.json(200, { message: "Order updated successfully" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());
