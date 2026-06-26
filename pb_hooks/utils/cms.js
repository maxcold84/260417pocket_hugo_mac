function syncCategoriesFromToml(app, tomlStr) {
    const activeApp = app || $app;
    // If tomlStr is not provided, read it from hugo/hugo.toml
    if (!tomlStr) {
        try {
            const tomlBytes = $os.readFile("hugo/hugo.toml");
            const tomlBinaryStr = Array.from(tomlBytes).map(b => String.fromCharCode(b)).join('');
            tomlStr = decodeURIComponent(escape(tomlBinaryStr));
        } catch (err) {
            console.error("[cms-util] Failed to read hugo.toml:", err);
            return;
        }
    }

    const parsedCategories = [];
    const parts = tomlStr.split(/\[\[params\.categories\]\]/);
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const nameMatch = part.match(/name\s*=\s*"([^"]+)"/);
        const nameEnMatch = part.match(/nameEn\s*=\s*"([^"]+)"/);
        const slugMatch = part.match(/slug\s*=\s*"([^"]+)"/);
        const iconMatch = part.match(/icon\s*=\s*"([^"]+)"/);
        
        if (nameMatch && slugMatch) {
            parsedCategories.push({
                name: nameMatch[1],
                nameEn: nameEnMatch ? nameEnMatch[1] : nameMatch[1],
                slug: slugMatch[1],
                icon: iconMatch ? iconMatch[1] : "lightning",
                sort_order: i
            });
        }
    }

    if (parsedCategories.length === 0) {
        return;
    }

    const categoriesCollection = activeApp.findCollectionByNameOrId("categories");
    const dbCategories = activeApp.findRecordsByFilter("categories", "1=1", "sort_order", 100, 0);
    const dbCatMap = {};
    for (let cat of dbCategories) {
        dbCatMap[cat.getString("slug")] = cat;
    }

    // Insert or update categories from TOML
    for (let pCat of parsedCategories) {
        let record = dbCatMap[pCat.slug];
        if (!record) {
            record = new Record(categoriesCollection);
        }
        record.set("name", pCat.name);
        record.set("slug", pCat.slug);
        record.set("sort_order", pCat.sort_order);
        activeApp.save(record);
    }
    console.log("[cms-util] Successfully synced " + parsedCategories.length + " categories to DB.");
}

function readUtf8File(path) {
    const bytes = $os.readFile(path);
    const binaryStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return decodeURIComponent(escape(binaryStr));
}

function removeCategoryFromTomlBySlug(slug) {
    if (!slug) {
        return { changed: false, toml: "" };
    }

    const tomlStr = readUtf8File("hugo/hugo.toml");
    const parts = tomlStr.split("[[params.categories]]");
    if (parts.length <= 1) {
        return { changed: false, toml: tomlStr };
    }

    const header = parts[0];
    const remainingBlocks = [];
    let removed = false;

    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const slugMatch = block.match(/slug\s*=\s*"([^"]+)"/);
        if (slugMatch && slugMatch[1] === slug) {
            removed = true;
            continue;
        }
        remainingBlocks.push(block);
    }

    if (!removed) {
        return { changed: false, toml: tomlStr };
    }

    let updatedToml = header;
    if (remainingBlocks.length > 0) {
        updatedToml += "[[params.categories]]" + remainingBlocks.join("[[params.categories]]");
    }

    $os.writeFile("hugo/hugo.toml", updatedToml, 0o644);
    return { changed: true, toml: updatedToml };
}

function clearRelationFieldReferences(app, collectionName, fieldName, relationId) {
    if (!collectionName || !fieldName || !relationId) {
        return 0;
    }

    const activeApp = app || $app;
    let offset = 0;
    let clearedCount = 0;

    while (true) {
        const records = activeApp.findRecordsByFilter(collectionName, "1=1", "", 1000, offset);
        if (!records || records.length === 0) {
            break;
        }

        for (const record of records) {
            if (record.getString(fieldName) === relationId) {
                record.set(fieldName, "");
                activeApp.save(record);
                clearedCount++;
            }
        }

        if (records.length < 1000) {
            break;
        }
        offset += records.length;
    }

    return clearedCount;
}

function clearProductsCategory(app, categoryId) {
    return clearRelationFieldReferences(app, "products", "category", categoryId);
}

function ensureDir(path, label) {
    try {
        $os.mkdirAll(path, 0o755);
    } catch (err) {
        const name = label || path;
        throw new Error("필수 디렉터리 생성 실패: " + name + " (" + path + "): " + String(err));
    }
}

function prepareHugoContentTree() {
    ensureDir("hugo/content/products", "상품 Markdown 디렉터리");
}

function isImageUsed(filename, usedImagePrefixes) {
    for (const prefix of usedImagePrefixes) {
        if (filename.indexOf(prefix) === 0) {
            return true;
        }
    }
    return false;
}

function syncProductsToMarkdown(app) {
    const activeApp = app || $app;

    prepareHugoContentTree();

    const products = activeApp.findRecordsByFilter("products", "1=1", "sort_order", 1000, 0);
    const dbSlugs = {};
    const usedImagePrefixes = [];

    for (const p of products) {
        const slug = p.getString("slug");
        if (slug) {
            dbSlugs[slug] = true;
        }

        const images = p.getStringSlice("images");
        if (images && images.length > 0) {
            for (const img of images) {
                const base = img.replace(/\.[^.]+$/, "");
                usedImagePrefixes.push(base);
            }
        }
    }

    let deletedProductCount = 0;
    try {
        const entries = $os.readDir("hugo/content/products");
        for (const entry of entries) {
            const filename = entry.name();
            if (!filename.endsWith(".md")) {
                continue;
            }
            const slug = filename.slice(0, -3);
            if (!dbSlugs[slug]) {
                try { $os.remove("hugo/content/products/" + filename); } catch (e) {}
                try { $os.removeAll("pb_public/products/" + slug); } catch (e) {}
                deletedProductCount++;
            }
        }
    } catch (err) {
        console.error("readDir (products) error:", err);
    }

    let deletedImageCount = 0;
    try {
        const resEntries = $os.readDir("hugo/resources/_gen/images");
        for (const entry of resEntries) {
            const filename = entry.name();
            if (!isImageUsed(filename, usedImagePrefixes)) {
                try { $os.remove("hugo/resources/_gen/images/" + filename); } catch (e) {}
                deletedImageCount++;
            }
        }
    } catch (err) {
        console.error("readDir (resources/_gen/images) error:", err);
    }

    try {
        const pubEntries = $os.readDir("pb_public");
        for (const entry of pubEntries) {
            const filename = entry.name();
            if (!filename.endsWith(".webp") && !filename.endsWith(".jpg") && !filename.endsWith(".png")) {
                continue;
            }
            if (!isImageUsed(filename, usedImagePrefixes)) {
                try { $os.remove("pb_public/" + filename); } catch (e) {}
                deletedImageCount++;
            }
        }
    } catch (err) {
        console.error("readDir (pb_public) error:", err);
    }

    let syncedCount = 0;
    let clearedBrokenCategoryCount = 0;
    for (const p of products) {
        const slug = p.getString("slug");
        if (!slug) {
            continue;
        }

        const name = p.getString("name").replace(/"/g, '\\"');
        const price = p.getInt("price");
        const description = p.getString("description");

        const images = p.getStringSlice("images");
        let imageLine = "";
        if (images && images.length > 0) {
            const collectionId = p.collection().id;
            const recordId = p.id;
            const imageUrls = [];
            for (const img of images) {
                imageUrls.push('"/api/files/' + collectionId + '/' + recordId + '/' + img + '"');
            }
            imageLine = '\nimages: [' + imageUrls.join(', ') + ']\nimage: ' + imageUrls[0];
        }

        const sortOrder = p.getInt("sort_order");
        const discountPrice = p.getInt("discount_price");
        const categoryId = p.getString("category");
        let categorySlug = "";
        if (categoryId) {
            try {
                const catRec = activeApp.findRecordById("categories", categoryId);
                categorySlug = catRec.getString("slug");
            } catch (err) {
                console.error("[cms-util] Clearing missing category relation for product " + p.id + ":", err);
                try {
                    p.set("category", "");
                    activeApp.save(p);
                    clearedBrokenCategoryCount++;
                } catch (saveErr) {
                    console.error("[cms-util] Failed to clear missing category relation for product " + p.id + ":", saveErr);
                }
            }
        }

        const content = '---\nid: "' + p.id + '"\ntitle: "' + name + '"\nprice: ' + price + '\ndiscount_price: ' + discountPrice + '\nweight: ' + sortOrder + '\ncategory: "' + categorySlug + '"' + imageLine + '\n---\n' + description + '\n';
        $os.writeFile("hugo/content/products/" + slug + ".md", content, 0o644);
        syncedCount++;
    }

    return {
        synced: syncedCount,
        deletedPages: deletedProductCount,
        deletedImages: deletedImageCount,
        clearedBrokenCategories: clearedBrokenCategoryCount
    };
}

function syncProductsAndRunHugo(app, e) {
    const syncResult = syncProductsToMarkdown(app);
    const hugoResult = runHugo(e);
    return {
        sync: syncResult,
        hugo: hugoResult
    };
}

function runHugo(e) {
    let baseURL = "";
    let internalURL = "";

    // 1. Resolve internal URL
    try {
        const envUtil = require(`${__hooks}/utils/env.js`);
        internalURL = envUtil.get("POCKETBASE_INTERNAL_URL") || "http://127.0.0.1:8090/";
    } catch (err) {
        internalURL = "http://127.0.0.1:8090/";
    }

    // Ensure trailing slash for internalURL
    if (internalURL && !internalURL.endsWith("/")) {
        internalURL += "/";
    }

    // 2. Resolve external baseURL
    if (e && e.request) {
        try {
            let scheme = "http";
            const proto = e.request.header.get("X-Forwarded-Proto") || "";
            if (proto.indexOf("https") !== -1 || e.request.tls) {
                scheme = "https";
            }
            const host = e.request.host || "localhost:8090";
            baseURL = scheme + "://" + host + "/";
        } catch (err) {
            console.warn("[runHugo] Failed to parse request host:", err);
        }
    }

    // If still empty, fall back to environment variable or site default
    if (!baseURL) {
        try {
            const envUtil = require(`${__hooks}/utils/env.js`);
            baseURL = envUtil.get("HUGO_BASEURL") || "http://localhost:8090/";
        } catch (err) {
            baseURL = "http://localhost:8090/";
        }
    }

    // Ensure trailing slash for baseURL
    if (baseURL && !baseURL.endsWith("/")) {
        baseURL += "/";
    }

    console.log("[runHugo] Building site with baseURL: " + baseURL + ", internalURL: " + internalURL);

    const envPrefix = [];
    envPrefix.push("HUGO_POCKETBASE_INTERNAL_URL=" + internalURL);
    envPrefix.push("POCKETBASE_INTERNAL_URL=" + internalURL);
    envPrefix.push("HUGO_BASEURL=" + baseURL);

    const paths = ["/opt/homebrew/bin/hugo", "/usr/local/bin/hugo", "hugo"];
    let lastErr = null;
    let lastOutput = "";
    for (let p of paths) {
        try {
            // Build dynamic command prepended with environment variables
            const cmdStr = envPrefix.join(" ") + " " + p + " --ignoreCache -b " + baseURL;
            const cmd = $os.cmd("sh", "-c", cmdStr);
            cmd.dir = "hugo";

            // CombinedOutput()으로 stdout + stderr 모두 캡처
            let outputBytes;
            try {
                outputBytes = cmd.output();
            } catch (outputErr) {
                // output()이 없는 경우(구 버전) run()으로 폴백
                cmd.run();
                console.log("[runHugo] Successfully executed (run): " + cmdStr);
                return { success: true, output: "" };
            }

            // Go []byte → JS string 변환
            const outputStr = Array.from(outputBytes).map(b => String.fromCharCode(b)).join('');
            console.log("[runHugo] Successfully executed: " + cmdStr);
            console.log("[runHugo] Hugo output:\n" + outputStr);
            return { success: true, output: outputStr };
        } catch (err) {
            lastErr = err;
            // 에러 객체에서 출력 캡처 시도 (Go exec.ExitError에 Stderr 포함)
            const errStr = String(err);
            lastOutput = errStr;
            console.warn("[runHugo] Failed execution for '" + p + "': " + errStr);
        }
    }
    throw new Error("Hugo 빌드 실패. 마지막 오류:\n" + lastOutput);
}

module.exports = {
    syncCategoriesFromToml: syncCategoriesFromToml,
    removeCategoryFromTomlBySlug: removeCategoryFromTomlBySlug,
    clearRelationFieldReferences: clearRelationFieldReferences,
    clearProductsCategory: clearProductsCategory,
    prepareHugoContentTree: prepareHugoContentTree,
    syncProductsToMarkdown: syncProductsToMarkdown,
    syncProductsAndRunHugo: syncProductsAndRunHugo,
    runHugo: runHugo
};
