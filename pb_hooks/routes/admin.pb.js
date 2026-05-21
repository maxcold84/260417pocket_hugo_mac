routerAdd("POST", "/api/cms/rebuild", (e) => {
    try {
        const cmsUtil = require(`${__hooks}/utils/cms.js`);

        // Step 0: Sync categories from hugo.toml to DB first
        try {
            const tomlBytes = $os.readFile("hugo/hugo.toml");
            const tomlBinaryStr = Array.from(tomlBytes).map(b => String.fromCharCode(b)).join('');
            const tomlStr = decodeURIComponent(escape(tomlBinaryStr));
            cmsUtil.syncCategoriesFromToml($app, tomlStr);
        } catch (catErr) {
            console.error("Failed to sync categories during rebuild:", catErr);
        }

        // Step 1: Get all current products from DB — collect slugs and image filenames
        const products = $app.findRecordsByFilter("products", "1=1", "sort_order", 1000, 0);
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

            const sortOrder = p.getInt("sort_order");
            const discountPrice = p.getInt("discount_price");
            const categoryId = p.getString("category");
            let categorySlug = "";
            if (categoryId) {
                try {
                    const catRec = $app.findRecordById("categories", categoryId);
                    categorySlug = catRec.getString("slug");
                } catch (e) {
                    console.error("Failed to find category for product", e);
                }
            }
            const content = '---\nid: "' + p.id + '"\ntitle: "' + name + '"\nprice: ' + price + '\ndiscount_price: ' + discountPrice + '\nweight: ' + sortOrder + '\ncategory: "' + categorySlug + '"' + imageLine + '\n---\n' + description + '\n';
            $os.writeFile("hugo/content/products/" + slug + ".md", content, 0o644);
            syncedCount++;
        }

        // Step 6: Run Hugo with --ignoreCache
        cmsUtil.runHugo();

        return e.json(200, {
            message: "Sync complete: " + syncedCount + " products synced, " + deletedProductCount + " pages removed, " + deletedImageCount + " orphaned images cleaned."
        });
    } catch (err) {
        console.error("Rebuild error:", err);
        return e.json(500, { error: String(err) });
    }
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/api/cms/settings", (e) => {
    try {
        let tomlStr = "";
        try {
            const bytes = $os.readFile("hugo/hugo.toml");
            const binaryStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
            tomlStr = decodeURIComponent(escape(binaryStr));
        } catch (err) {
            console.error("Failed to read hugo.toml", err);
        }
        return e.json(200, { toml: tomlStr });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/settings/update", (e) => {
    try {
        const cmsUtil = require(`${__hooks}/utils/cms.js`);
        const formData = e.requestInfo().body;
        const newToml = formData.toml;
        if (typeof newToml !== "string") {
            return e.json(400, { error: "Invalid TOML data" });
        }
        
        $os.writeFile("hugo/hugo.toml", newToml, 0o644);

        // Sync categories to database!
        try {
            cmsUtil.syncCategoriesFromToml($app, newToml);
        } catch (catErr) {
            console.error("Failed to sync categories from TOML:", catErr);
        }
        
        // Trigger Hugo rebuild
        let hugoWarning = "";
        try {
            cmsUtil.runHugo();
        } catch (hugoErr) {
            console.error("Hugo build failed after settings update:", hugoErr);
            hugoWarning = " (주의: 설정이 저장되었으나 사이트 자동 빌드에 실패했습니다. 환경 설정을 확인하거나 수동 빌드를 시도하세요.)";
        }
        
        return e.json(200, { message: "Settings saved successfully." + hugoWarning });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/cms/orders/{id}", (e) => {
    try {
        const authUtil = require(`${__hooks}/utils/auth.js`);
        const superuser = authUtil.getSuperuserFromCookie(e);
        if (!superuser) {
            return e.json(401, { error: "The request requires valid record authorization token." });
        }
        const renderUtil = require(`${__hooks}/utils/render.js`);
        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);
        
        // Expand user
        $app.expandRecord(order, ["user"], null);
        const plainOrder = order.publicExport();
        
        // Read and parse guest_info directly into a native JS object
        let guestInfo = null;
        const rawGuest = order.get("guest_info");
        if (rawGuest) {
            try {
                let jsonStr = "";
                if (typeof rawGuest === "string") {
                    jsonStr = rawGuest;
                } else {
                    jsonStr = rawGuest.toString();
                }
                if (jsonStr) {
                    guestInfo = JSON.parse(jsonStr);
                }
            } catch (err) {
                console.error("Failed to parse guest_info:", err);
            }
        }
        
        const userRec = order.expandedOne("user");
        const memberName = userRec ? userRec.getString("name") : "";
        const memberPhone = userRec ? userRec.getString("phone") : "";
        const memberEmail = userRec ? userRec.getString("email") : "";
        const memberAddress = userRec ? userRec.getString("address") : "";
        
        plainOrder.expand = {
            user: userRec ? {
                name: memberName,
                phone: memberPhone,
                email: memberEmail,
                address: memberAddress
            } : null
        };

        // Standardize recipient / shipping fields for template (avoids complex nil-checks in Go HTML Engine)
        let displayRecipientName = "";
        if (plainOrder.recipient_name) {
            displayRecipientName = plainOrder.recipient_name;
        } else if (memberName) {
            displayRecipientName = memberName;
        } else if (guestInfo) {
            displayRecipientName = guestInfo.name || "";
        }

        let displayRecipientPhone = "";
        if (plainOrder.recipient_phone) {
            displayRecipientPhone = plainOrder.recipient_phone;
        } else if (memberPhone) {
            displayRecipientPhone = memberPhone;
        } else if (guestInfo) {
            displayRecipientPhone = guestInfo.phone || "";
        }

        let displayShippingAddress = "";
        if (plainOrder.shipping_address) {
            displayShippingAddress = plainOrder.shipping_address + " " + (plainOrder.shipping_address_detail || "");
        } else if (memberAddress) {
            displayShippingAddress = memberAddress;
        } else if (guestInfo) {
            displayShippingAddress = guestInfo.address || "";
        }
        
        const items = $app.findRecordsByFilter("order_items", "order = {:id}", "-id", 100, 0, { id: orderId });
        const itemsWithTotals = items.map(item => {
            $app.expandRecord(item, ["product"], null);
            const plain = item.publicExport();
            plain.expand = {
                product: item.expandedOne("product") ? item.expandedOne("product").publicExport() : null
            };
            plain.total_price = item.getInt("unit_price") * item.getInt("quantity");
            return plain;
        });

        const fullHtml = $template.loadFiles(`${__hooks}/views/admin/order-detail.html`).render({
            order: plainOrder,
            items: itemsWithTotals,
            userInfo: userRec ? {
                name: memberName,
                phone: memberPhone,
                email: memberEmail,
                address: memberAddress
            } : null,
            isGuest: guestInfo !== null,
            guestName: guestInfo ? (guestInfo.name || "") : "",
            guestPhone: guestInfo ? (guestInfo.phone || "") : "",
            guestEmail: guestInfo ? (guestInfo.email || "") : "",
            guestPassword: guestInfo ? (guestInfo.password || "") : "",
            memberName: memberName,
            memberPhone: memberPhone,
            memberEmail: memberEmail,
            displayRecipientName: displayRecipientName,
            displayRecipientPhone: displayRecipientPhone,
            displayShippingAddress: displayShippingAddress
        });
        return e.html(200, fullHtml);
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("POST", "/api/cms/orders/{id}/update", (e) => {
    try {
        const authUtil = require(`${__hooks}/utils/auth.js`);
        const superuser = authUtil.getSuperuserFromCookie(e);
        if (!superuser) {
            return e.json(401, { error: "인증되지 않은 사용자입니다." });
        }

        const orderId = e.request.pathValue("id");
        const bodyData = e.requestInfo().body || {};

        // Helper to retrieve fields from both JSON body and URL-encoded form values
        const getVal = (key) => {
            if (bodyData && key in bodyData) {
                return bodyData[key];
            }
            return e.request.formValue(key);
        };

        const order = $app.findRecordById("orders", orderId);
        
        // Update all standard order detail fields
        order.set("status", getVal("status"));
        order.set("courier_name", getVal("courier_name"));
        order.set("tracking_number", getVal("tracking_number"));
        order.set("recipient_name", getVal("recipient_name"));
        order.set("recipient_phone", getVal("recipient_phone"));
        order.set("shipping_address", getVal("shipping_address"));
        order.set("shipping_address_detail", getVal("shipping_address_detail"));
        order.set("shipping_memo", getVal("shipping_memo"));
        
        $app.save(order);
        
        return e.json(200, { message: "Order updated successfully" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

// Admin: Approve cancellation and process refund via PortOne
routerAdd("POST", "/api/cms/orders/{id}/approve-cancel", (e) => {
    try {
        const env = require(`${__hooks}/utils/env.js`);
        const orderId = e.request.pathValue("id");
        const order = $app.findRecordById("orders", orderId);
        const currentStatus = order.getString("status");

        // Only cancel_requested or paid orders can be approved for cancellation
        if (currentStatus !== "cancel_requested" && currentStatus !== "paid") {
            return e.json(400, { error: "취소 요청 상태이거나 결제완료 상태의 주문만 취소 승인할 수 있습니다." });
        }

        // Call PortOne V2 cancel API
        const apiSecret = env.get("PORTONE_API_SECRET");
        if (!apiSecret) {
            return e.json(500, { error: "PORTONE_API_SECRET 환경 변수가 설정되지 않았습니다." });
        }

        // The payment ID used with PortOne is the order ID itself
        const paymentId = orderId;
        const storeId = env.get("PORTONE_STORE_ID") || "";

        const cancelBody = JSON.stringify({
            reason: "관리자 취소 승인",
            storeId: storeId
        });

        const res = $http.send({
            url: "https://api.portone.io/payments/" + encodeURIComponent(paymentId) + "/cancel",
            method: "POST",
            headers: {
                "Authorization": "PortOne " + apiSecret,
                "Content-Type": "application/json"
            },
            body: cancelBody
        });

        if (res.statusCode !== 200) {
            const errMsg = res.json ? (res.json.message || JSON.stringify(res.json)) : "Unknown error";
            return e.json(400, { error: "PortOne 환불 처리 실패: " + errMsg });
        }

        // Change order status to refunded and save to database
        order.set("status", "refunded");
        $app.save(order);

        return e.json(200, { message: "환불이 완료되었습니다." });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/categories/add", (e) => {
    try {
        const cmsUtil = require(`${__hooks}/utils/cms.js`);
        const formData = e.requestInfo().body;
        const name = formData.name;
        const nameEn = formData.nameEn || name;
        const slug = formData.slug ? formData.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-') : "";
        const icon = formData.icon || "lightning";

        if (!name || !slug) {
            return e.json(400, { error: "카테고리 명과 슬러그는 필수 입력 항목입니다." });
        }

        // Read hugo.toml
        const tomlBytes = $os.readFile("hugo/hugo.toml");
        const tomlBinaryStr = Array.from(tomlBytes).map(b => String.fromCharCode(b)).join('');
        const tomlStr = decodeURIComponent(escape(tomlBinaryStr));

        // Check duplicate slug
        if (tomlStr.includes('slug = "' + slug + '"')) {
            return e.json(400, { error: "이미 존재하는 카테고리 슬러그입니다." });
        }

        // Append new category block
        const newBlock = `\n[[params.categories]]\nname = "${name}"\nnameEn = "${nameEn}"\nslug = "${slug}"\nicon = "${icon}"\n`;
        const updatedToml = tomlStr + newBlock;
        $os.writeFile("hugo/hugo.toml", updatedToml, 0o644);

        // Sync and Rebuild
        cmsUtil.syncCategoriesFromToml($app, updatedToml);

        let hugoWarning = "";
        try {
            cmsUtil.runHugo();
        } catch (hugoErr) {
            console.error("Hugo build failed after category add:", hugoErr);
            hugoWarning = " (주의: 카테고리는 DB와 hugo.toml에 추가되었으나 사이트 자동 빌드에 실패했습니다. 환경 설정을 확인하거나 수동 빌드를 시도하세요.)";
        }

        return e.json(200, { message: "카테고리가 추가되었습니다." + hugoWarning });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/categories/delete", (e) => {
    try {
        const cmsUtil = require(`${__hooks}/utils/cms.js`);
        const formData = e.requestInfo().body;
        const id = formData.id;

        if (!id) {
            return e.json(400, { error: "카테고리 ID가 제공되지 않았습니다." });
        }

        // Find database record
        const catRec = $app.findRecordById("categories", id);
        const slug = catRec.getString("slug");

        // Read hugo.toml
        const tomlBytes = $os.readFile("hugo/hugo.toml");
        const tomlBinaryStr = Array.from(tomlBytes).map(b => String.fromCharCode(b)).join('');
        const tomlStr = decodeURIComponent(escape(tomlBinaryStr));

        // Remove block matching slug
        const parts = tomlStr.split("[[params.categories]]");
        const header = parts[0];
        const remainingBlocks = [];
        for (let i = 1; i < parts.length; i++) {
            const block = parts[i];
            const slugMatch = block.match(/slug\s*=\s*"([^"]+)"/);
            if (slugMatch && slugMatch[1] === slug) {
                continue; // Skip this block (delete)
            }
            remainingBlocks.push(block);
        }

        let updatedToml = header;
        if (remainingBlocks.length > 0) {
            updatedToml += "[[params.categories]]" + remainingBlocks.join("[[params.categories]]");
        }

        $os.writeFile("hugo/hugo.toml", updatedToml, 0o644);

        // Clear category relation on products
        const products = $app.findRecordsByFilter("products", "category = '" + id + "'", "", 1000, 0);
        for (let p of products) {
            p.set("category", "");
            $app.save(p);
        }

        // Delete from database
        $app.delete(catRec);

        // Rebuild site
        let hugoWarning = "";
        try {
            cmsUtil.runHugo();
        } catch (hugoErr) {
            console.error("Hugo build failed after category delete:", hugoErr);
            hugoWarning = " (주의: 카테고리는 삭제되었으나 사이트 자동 빌드에 실패했습니다. 환경 설정을 확인하거나 수동 빌드를 시도하세요.)";
        }

        return e.json(200, { message: "카테고리가 삭제되었습니다." + hugoWarning });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());
