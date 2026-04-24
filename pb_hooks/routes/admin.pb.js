routerAdd("POST", "/api/admin/rebuild", (e) => {
    try {
        const products = $app.findRecordsByFilter("products", "1=1", "", 1000, 0);
        let createdCount = 0;
        for (let p of products) {
            const slug = p.getString("slug");
            const name = p.getString("name").replace(/"/g, '\\"');
            const price = p.getInt("price");
            const description = p.getString("description");
            const filePath = `hugo/content/products/${slug}.md`;
            const content = `---\ntitle: "${name}"\nprice: ${price}\n---\n${description}\n`;
            const cmd = $os.cmd("sh", "-c", `cat << 'INNER_EOF' > ${filePath}\n${content}\nINNER_EOF`);
            cmd.run();
            createdCount++;
        }
        const hugoCmd = $os.cmd("hugo");
        hugoCmd.dir = "hugo";
        hugoCmd.run();
        return e.json(200, { message: `Synced ${createdCount} markdown files and rebuilt the static site.` });
    } catch (err) {
        console.error("Rebuild error:", err);
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());
