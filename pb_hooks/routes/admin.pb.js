routerAdd("POST", "/api/cms/rebuild", (e) => {
    try {
        const cmsUtil = require(`${__hooks}/utils/cms.js`);

        // Step 0: Prune stale TOML categories first, then sync the remaining TOML metadata to DB.
        try {
            const categoryToml = cmsUtil.pruneCategoryTomlToDb($app);
            cmsUtil.syncCategoriesFromToml($app, categoryToml.toml);
            if (categoryToml.removed > 0) {
                console.log("[cms-rebuild] Removed " + categoryToml.removed + " stale category blocks from hugo.toml before rebuild.");
            }
        } catch (catErr) {
            console.error("Failed to reconcile categories during rebuild:", catErr);
        }

        // Step 1: Sync all current DB products to Hugo Markdown and clean stale outputs.
        const syncResult = cmsUtil.syncProductsToMarkdown($app);

        // Step 2: Run Hugo with --ignoreCache
        let hugoOutput = "";
        let hugoWarning = "";
        try {
            const hugoResult = cmsUtil.runHugo(e);
            if (hugoResult && hugoResult.output) {
                hugoOutput = hugoResult.output;
                // Hugo 출력에 WARN/ERROR가 있으면 경고로 포함
                if (hugoOutput.indexOf("WARN") !== -1 || hugoOutput.indexOf("ERROR") !== -1) {
                    hugoWarning = "[빌드 경고] " + hugoOutput.split("\n").filter(function(l) {
                        return l.indexOf("WARN") !== -1 || l.indexOf("ERROR") !== -1;
                    }).join(" | ");
                }
            }
        } catch (hugoErr) {
            const errMsg = String(hugoErr);
            console.error("Hugo build failed:", errMsg);
            return e.json(500, {
                error: "Hugo 빌드 실패",
                detail: errMsg,
                synced: syncResult.synced,
                deletedPages: syncResult.deletedPages,
                deletedImages: syncResult.deletedImages,
                clearedBrokenCategories: syncResult.clearedBrokenCategories
            });
        }

        const summary = syncResult.synced + "개 상품 동기화, " + syncResult.deletedPages + "개 페이지 삭제, " + syncResult.deletedImages + "개 고아 이미지 정리 완료.";
        return e.json(200, {
            message: "동기화 및 사이트 빌드 완료: " + summary + (hugoWarning ? " " + hugoWarning : ""),
            detail: hugoOutput
        });
    } catch (err) {
        console.error("Rebuild error:", err);
        return e.json(500, { error: "동기화 실패", detail: String(err) });
    }
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/api/cms/settings", (e) => {
    try {
        const cmsUtil = require(`${__hooks}/utils/cms.js`);
        return e.json(200, cmsUtil.resolveThemeSettings());
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/settings/theme", (e) => {
    try {
        const cmsUtil = require(`${__hooks}/utils/cms.js`);
        const body = e.requestInfo().body || {};
        const settings = cmsUtil.applyThemeSelection(body.theme);

        let hugoOutput = "";
        let hugoWarning = "";
        try {
            const hugoResult = cmsUtil.runHugo(e);
            if (hugoResult && hugoResult.output) {
                hugoOutput = hugoResult.output;
                if (hugoOutput.indexOf("WARN") !== -1 || hugoOutput.indexOf("ERROR") !== -1) {
                    hugoWarning = " [빌드 경고: " + hugoOutput.split("\n").filter(function(l) {
                        return l.indexOf("WARN") !== -1 || l.indexOf("ERROR") !== -1;
                    }).join(" | ") + "]";
                }
            }
        } catch (hugoErr) {
            const errMsg = String(hugoErr);
            console.error("Hugo build failed after theme update:", errMsg);
            return e.json(500, {
                error: "테마는 저장되었으나 Hugo 빌드 실패",
                detail: errMsg,
                toml: settings.toml,
                activeTheme: settings.activeTheme,
                themes: settings.themes
            });
        }

        return e.json(200, {
            message: "테마가 적용되었고 사이트가 재빌드되었습니다." + hugoWarning,
            detail: hugoOutput,
            toml: settings.toml,
            activeTheme: settings.activeTheme,
            themes: settings.themes
        });
    } catch (err) {
        const errMsg = String(err);
        const statusCode = errMsg.indexOf("유효하지 않은 테마") !== -1 || errMsg.indexOf("존재하지 않는 테마") !== -1 ? 400 : 500;
        return e.json(statusCode, { error: errMsg });
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
            const hugoResult = cmsUtil.runHugo(e);
            if (hugoResult && hugoResult.output) {
                const out = hugoResult.output;
                if (out.indexOf("WARN") !== -1 || out.indexOf("ERROR") !== -1) {
                    const warnLines = out.split("\n").filter(function(l) {
                        return l.indexOf("WARN") !== -1 || l.indexOf("ERROR") !== -1;
                    }).join(" | ");
                    hugoWarning = " [빌드 경고: " + warnLines + "]";
                }
            }
        } catch (hugoErr) {
            const errMsg = String(hugoErr);
            console.error("Hugo build failed after settings update:", errMsg);
            return e.json(500, {
                error: "설정은 저장되었으나 Hugo 빌드 실패",
                detail: errMsg
            });
        }
        
        return e.json(200, { message: "설정이 저장되었습니다." + hugoWarning });
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
        const fromTab = e.request.url.query().get("from");
        const returnTab = fromTab === "orderArchive" ? "orderArchive" : "orders";
        const archiveStatus = e.request.url.query().get("archiveStatus");
        const validArchiveStatus = archiveStatus === "completed" || archiveStatus === "purchase_confirmed" || archiveStatus === "refunded" || archiveStatus === "cancelled";
        const returnHref = returnTab === "orderArchive"
            ? "/cms/?tab=orderArchive" + (validArchiveStatus ? "&archiveStatus=" + archiveStatus : "")
            : "/cms/?tab=orders";
        const returnLabel = returnTab === "orderArchive" ? "보관함으로 돌아가기" : "목록으로 돌아가기";
        
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
        
        const items = $app.findRecordsByFilter("order_items", "order = {:id}", "", 100, 0, { id: orderId });
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
            isGuest: !order.getString("user") && guestInfo !== null,
            guestName: guestInfo ? (guestInfo.name || "") : "",
            guestPhone: guestInfo ? (guestInfo.phone || "") : "",
            guestEmail: guestInfo ? (guestInfo.email || "") : "",
            guestPasswordStored: guestInfo && guestInfo.password_hash ? "해시로 저장됨" : "미설정",
            memberName: memberName,
            memberPhone: memberPhone,
            memberEmail: memberEmail,
            displayRecipientName: displayRecipientName,
            displayRecipientPhone: displayRecipientPhone,
            displayShippingAddress: displayShippingAddress,
            returnTab: returnTab,
            returnHref: returnHref,
            returnLabel: returnLabel
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
            const value = bodyData && Object.prototype.hasOwnProperty.call(bodyData, key)
                ? bodyData[key]
                : e.request.formValue(key);
            if (Array.isArray(value)) {
                return value.length > 0 ? String(value[0]) : "";
            }
            if (value === null || value === undefined) {
                return "";
            }
            return String(value);
        };

        const order = $app.findRecordById("orders", orderId);

        const status = getVal("status");
        const validStatuses = ["pending", "paid", "cancel_requested", "cancelled", "refunded", "shipping", "completed", "purchase_confirmed"];
        if (validStatuses.indexOf(status) === -1) {
            return e.json(400, { error: "유효하지 않은 주문 상태입니다." });
        }
        const currentStatus = order.getString("status");
        const validateAdminStatusTransition = (fromStatus, toStatus) => {
            if (fromStatus === toStatus) return { ok: true };

            if (fromStatus === "purchase_confirmed" || fromStatus === "refunded" || fromStatus === "cancelled") {
                return { ok: false, error: "완료된 환불/취소 주문의 상태는 직접 변경할 수 없습니다." };
            }

            if (toStatus === "purchase_confirmed") {
                return { ok: false, error: "구매확정 상태는 회원 구매확정 경로로만 변경할 수 있습니다." };
            }

            if (toStatus === "refunded" || toStatus === "cancelled") {
                return { ok: false, error: "환불/취소 완료 상태는 환불 승인 경로로만 변경할 수 있습니다." };
            }

            if (fromStatus === "pending") {
                return { ok: false, error: "결제대기 주문은 결제 검증 후에만 진행 상태로 변경할 수 있습니다." };
            }

            if (toStatus === "paid") {
                return fromStatus === "cancel_requested"
                    ? { ok: true }
                    : { ok: false, error: "결제완료 상태는 결제 검증 또는 취소요청 철회 경로로만 변경할 수 있습니다." };
            }

            if (toStatus === "cancel_requested") {
                return fromStatus === "paid"
                    ? { ok: true }
                    : { ok: false, error: "결제완료 상태의 주문만 취소요청으로 변경할 수 있습니다." };
            }

            if (toStatus === "shipping") {
                return (fromStatus === "paid" || fromStatus === "shipping" || fromStatus === "completed")
                    ? { ok: true }
                    : { ok: false, error: "결제완료 또는 배송 관련 상태의 주문만 배송중으로 변경할 수 있습니다." };
            }

            if (toStatus === "completed") {
                return (fromStatus === "paid" || fromStatus === "shipping" || fromStatus === "completed")
                    ? { ok: true }
                    : { ok: false, error: "결제완료 또는 배송중 주문만 배송완료로 변경할 수 있습니다." };
            }

            return { ok: false, error: "허용되지 않은 주문 상태 변경입니다." };
        };
        const transition = validateAdminStatusTransition(currentStatus, status);
        if (!transition.ok) {
            return e.json(400, { error: transition.error });
        }

        // Update all standard order detail fields
        order.set("status", status);
        order.set("courier_name", getVal("courier_name").trim());
        order.set("tracking_number", getVal("tracking_number").trim());
        order.set("recipient_name", getVal("recipient_name").trim());
        order.set("recipient_phone", getVal("recipient_phone").trim());
        order.set("shipping_address", getVal("shipping_address").trim());
        order.set("shipping_address_detail", getVal("shipping_address_detail").trim());
        order.set("shipping_memo", getVal("shipping_memo").trim());
        
        $app.save(order);
        
        return e.json(200, { message: "Order updated successfully" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("POST", "/api/cms/orders/{id}/status", (e) => {
    try {
        const authUtil = require(`${__hooks}/utils/auth.js`);
        const superuser = authUtil.getSuperuserFromCookie(e);
        if (!superuser) {
            return e.json(401, { error: "인증되지 않은 사용자입니다." });
        }

        const orderId = e.request.pathValue("id");
        const bodyData = e.requestInfo().body || {};
        const nextStatus = String(bodyData.status || "").trim();
        const validStatuses = ["pending", "paid", "cancel_requested", "shipping", "completed", "purchase_confirmed"];
        if (validStatuses.indexOf(nextStatus) === -1) {
            return e.json(400, { error: "이 경로에서 변경할 수 없는 주문 상태입니다." });
        }

        const order = $app.findRecordById("orders", orderId);
        const currentStatus = order.getString("status");
        const validateAdminStatusTransition = (fromStatus, toStatus) => {
            if (fromStatus === toStatus) return { ok: true };

            if (fromStatus === "purchase_confirmed" || fromStatus === "refunded" || fromStatus === "cancelled") {
                return { ok: false, error: "완료된 환불/취소 주문의 상태는 직접 변경할 수 없습니다." };
            }

            if (toStatus === "purchase_confirmed") {
                return { ok: false, error: "구매확정 상태는 회원 구매확정 경로로만 변경할 수 있습니다." };
            }

            if (fromStatus === "pending") {
                return { ok: false, error: "결제대기 주문은 결제 검증 후에만 진행 상태로 변경할 수 있습니다." };
            }

            if (toStatus === "paid") {
                return fromStatus === "cancel_requested"
                    ? { ok: true }
                    : { ok: false, error: "결제완료 상태는 결제 검증 또는 취소요청 철회 경로로만 변경할 수 있습니다." };
            }

            if (toStatus === "cancel_requested") {
                return fromStatus === "paid"
                    ? { ok: true }
                    : { ok: false, error: "결제완료 상태의 주문만 취소요청으로 변경할 수 있습니다." };
            }

            if (toStatus === "shipping") {
                return (fromStatus === "paid" || fromStatus === "shipping" || fromStatus === "completed")
                    ? { ok: true }
                    : { ok: false, error: "결제완료 또는 배송 관련 상태의 주문만 배송중으로 변경할 수 있습니다." };
            }

            if (toStatus === "completed") {
                return (fromStatus === "paid" || fromStatus === "shipping" || fromStatus === "completed")
                    ? { ok: true }
                    : { ok: false, error: "결제완료 또는 배송중 주문만 배송완료로 변경할 수 있습니다." };
            }

            return { ok: false, error: "허용되지 않은 주문 상태 변경입니다." };
        };
        const transition = validateAdminStatusTransition(currentStatus, nextStatus);
        if (!transition.ok) {
            return e.json(400, { error: transition.error });
        }

        order.set("status", nextStatus);
        $app.save(order);

        return e.json(200, { message: "주문 상태가 변경되었습니다." });
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

        if (currentStatus === "refunded") {
            return e.json(200, { message: "이미 환불 처리된 주문입니다." });
        }

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
        const storeId = env.get("PORTONE_STORE_ID");
        if (!storeId) {
            return e.json(500, { error: "PORTONE_STORE_ID 환경 변수가 설정되지 않았습니다." });
        }

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
            cmsUtil.runHugo(e);
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
        let catRec;
        try {
            catRec = $app.findRecordById("categories", id);
        } catch (findErr) {
            return e.json(404, { error: "카테고리를 찾을 수 없습니다." });
        }
        const slug = catRec.getString("slug");

        const tomlResult = cmsUtil.removeCategoryFromTomlBySlug(slug);
        const clearedProducts = cmsUtil.clearProductsCategory($app, id);

        // Delete from database
        $app.delete(catRec);

        // Rebuild site and regenerate product Markdown so stale category frontmatter is removed.
        let hugoWarning = "";
        let syncResult = null;
        try {
            const rebuildResult = cmsUtil.syncProductsAndRunHugo($app, e);
            syncResult = rebuildResult.sync;
        } catch (hugoErr) {
            console.error("Hugo build failed after category delete:", hugoErr);
            hugoWarning = " (주의: 카테고리는 삭제되었으나 사이트 자동 빌드에 실패했습니다. 환경 설정을 확인하거나 수동 빌드를 시도하세요.)";
        }

        const syncNote = syncResult ? " 상품 " + syncResult.synced + "개를 다시 동기화했습니다." : "";
        const tomlNote = tomlResult.changed ? "" : " (hugo.toml에는 해당 카테고리 블록이 없었습니다.)";
        return e.json(200, { message: "카테고리가 삭제되었습니다. 연결된 상품 " + clearedProducts + "개의 카테고리를 해제했습니다." + syncNote + tomlNote + hugoWarning });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

// Batch reorder products in a single atomic transaction
routerAdd("POST", "/api/cms/products/reorder", (e) => {
    try {
        const bodyData = e.requestInfo().body || {};
        const ids = bodyData.ids || [];
        if (!Array.isArray(ids) || ids.length === 0) {
            return e.json(400, { error: "Product ID list is required." });
        }
        $app.runInTransaction((txApp) => {
            for (let i = 0; i < ids.length; i++) {
                const product = txApp.findRecordById("products", ids[i]);
                product.set("sort_order", i + 1);
                txApp.save(product);
            }
        });
        return e.json(200, { message: "Reorder successful" });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());
