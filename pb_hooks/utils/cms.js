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
    runHugo: runHugo
};
