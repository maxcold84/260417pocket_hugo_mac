routerAdd("POST", "/api/admin/rebuild", (e) => {
    try {
        const products = $app.findRecordsByFilter("products", "1=1", "", 1000, 0);
        let createdCount = 0;

        for (let p of products) {
            const slug = p.getString("slug");
            if (!slug) {
                continue; // skip products without slug
            }

            const name = p.getString("name").replace(/"/g, '\\"');
            const price = p.getInt("price");
            const description = p.getString("description");

            // Build image frontmatter line if the product has uploaded images
            const images = p.getStringSlice("images");
            let imageLine = "";
            if (images && images.length > 0) {
                const collectionId = p.collection().id;
                const recordId = p.id;
                imageLine = '\nimage: "http://127.0.0.1:8090/api/files/' + collectionId + '/' + recordId + '/' + images[0] + '"';
            }

            const content = '---\ntitle: "' + name + '"\nprice: ' + price + '\nid: "' + p.id + '"' + imageLine + '\n---\n' + description + '\n';
            const filePath = "hugo/content/products/" + slug + ".md";

            // Use $os.writeFile for safe file creation (handles Korean/spaces in paths)
            $os.writeFile(filePath, content, 0o644);
            createdCount++;
        }

        // Run Hugo with --ignoreCache to ensure fresh remote resource fetches
        const hugoCmd = $os.cmd("hugo", "--ignoreCache");
        hugoCmd.dir = "hugo";
        hugoCmd.run();

        return e.json(200, { message: "Synced " + createdCount + " markdown files and rebuilt the static site." });
    } catch (err) {
        console.error("Rebuild error:", err);
        return e.json(500, { error: String(err) });
    }
}, $apis.requireSuperuserAuth());
