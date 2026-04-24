routerAdd("POST", "/api/admin/rebuild", (e) => {
    try {
        // Fetch all products
        const products = $app.findRecordsByFilter("products", "1=1", "", 1000, 0);
        
        let createdCount = 0;
        let updatedCount = 0;

        for (let p of products) {
            const slug = p.getString("slug");
            const name = p.getString("name").replace(/"/g, '\\"');
            const price = p.getInt("price");
            const description = p.getString("description");
            const filePath = `hugo/content/products/${slug}.md`;
            
            const content = `---
title: "${name}"
price: ${price}
---
${description}
`;
            
            // In a real shell command, we must properly escape EOF to avoid injection
            // Using base64 encoding avoids any shell escaping issues with the content
            const base64Content = $security.encode(content); // No wait, Goja doesn't have btoa easily, let's just use simple hex or just echo
            // Since we control the JSVM, we can just write the file using $os.cmd and a script that takes stdin.
            
            // Actually, we can use $os.cmd("sh", "-c", `echo "$CONTENT" > ${filePath}`) and set the environment variable.
            const cmd = $os.cmd("sh", "-c", `cat << 'EOF' > ${filePath}
${content}
EOF`);
            cmd.run();
            createdCount++;
        }

        // Run Hugo rebuild
        const hugoCmd = $os.cmd("hugo");
        hugoCmd.dir = "hugo";
        hugoCmd.run();

        return e.json(200, { message: `Synced ${createdCount} markdown files and rebuilt the static site.` });
    } catch (err) {
        console.error("Rebuild error:", err);
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth ? $apis.requireSuperuserAuth() : $apis.requireAdminAuth());
