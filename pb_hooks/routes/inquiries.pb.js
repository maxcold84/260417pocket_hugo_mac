routerAdd("GET", "/api/products/{productId}/inquiries", (e) => {
    try {
        const inquiryUtil = require(`${__hooks}/utils/inquiries.js`);
        const productKey = e.request.pathValue("productId");
        const query = e.request.url.query();

        const product = inquiryUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        const authRecord = inquiryUtil.isUserAuth(e.auth) ? e.auth : null;
        const result = inquiryUtil.listVisibleInquiries(
            $app,
            product.id,
            authRecord,
            query.get("offset"),
            query.get("limit")
        );

        const loggedIn = !!authRecord;
        return e.json(200, {
            items: result.items,
            total: result.total,
            offset: result.offset,
            limit: result.limit,
            viewer: {
                loggedIn: loggedIn,
                canWrite: loggedIn
            }
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("POST", "/api/products/{productId}/inquiries", (e) => {
    try {
        const inquiryUtil = require(`${__hooks}/utils/inquiries.js`);
        const productKey = e.request.pathValue("productId");
        const data = e.requestInfo().body || {};

        if (!inquiryUtil.isUserAuth(e.auth)) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const product = inquiryUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        const title = inquiryUtil.normalizeTitle(data.title);
        const titleValidation = inquiryUtil.validateTitle(title);
        if (!titleValidation.ok) {
            return e.json(400, { error: titleValidation.error });
        }

        const content = inquiryUtil.normalizeContent(data.content);
        const contentValidation = inquiryUtil.validateContent(content);
        if (!contentValidation.ok) {
            return e.json(400, { error: contentValidation.error });
        }

        const collection = $app.findCollectionByNameOrId("product_inquiries");
        const inquiry = new Record(collection);
        inquiry.set("product", product.id);
        inquiry.set("user", e.auth.id);
        inquiry.set("author_name", inquiryUtil.displayName(e.auth));
        inquiry.set("title", title);
        inquiry.set("content", content);
        inquiry.set("is_secret", inquiryUtil.normalizeSecret(data.isSecret));
        inquiry.set("status", "pending");
        inquiry.set("answer", "");
        inquiry.set("answered_at", "");
        inquiry.set("answered_by", "");
        $app.save(inquiry);

        return e.json(200, { item: inquiryUtil.exportInquiry(inquiry, e.auth) });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("PATCH", "/api/products/{productId}/inquiries/{inquiryId}", (e) => {
    try {
        const inquiryUtil = require(`${__hooks}/utils/inquiries.js`);
        const productKey = e.request.pathValue("productId");
        const inquiryId = e.request.pathValue("inquiryId");
        const data = e.requestInfo().body || {};

        if (!inquiryUtil.isUserAuth(e.auth)) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const product = inquiryUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        let inquiry = null;
        try {
            inquiry = $app.findRecordById("product_inquiries", inquiryId);
        } catch (err) {
            return e.json(404, { error: "문의글을 찾을 수 없습니다." });
        }

        if (inquiry.getString("product") !== product.id) {
            return e.json(404, { error: "문의글을 찾을 수 없습니다." });
        }

        if (inquiry.getString("user") !== e.auth.id) {
            return e.json(403, { error: "본인이 작성한 문의만 수정할 수 있습니다." });
        }

        if (inquiry.getString("status") !== "pending") {
            return e.json(409, { error: "답변 전 문의만 수정할 수 있습니다." });
        }

        const title = inquiryUtil.normalizeTitle(data.title);
        const titleValidation = inquiryUtil.validateTitle(title);
        if (!titleValidation.ok) {
            return e.json(400, { error: titleValidation.error });
        }

        const content = inquiryUtil.normalizeContent(data.content);
        const contentValidation = inquiryUtil.validateContent(content);
        if (!contentValidation.ok) {
            return e.json(400, { error: contentValidation.error });
        }

        inquiry.set("title", title);
        inquiry.set("content", content);
        inquiry.set("is_secret", inquiryUtil.normalizeSecret(data.isSecret));
        if (!inquiry.getString("author_name")) {
            inquiry.set("author_name", inquiryUtil.displayName(e.auth));
        }
        $app.save(inquiry);

        return e.json(200, { item: inquiryUtil.exportInquiry(inquiry, e.auth) });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("DELETE", "/api/products/{productId}/inquiries/{inquiryId}", (e) => {
    try {
        const inquiryUtil = require(`${__hooks}/utils/inquiries.js`);
        const productKey = e.request.pathValue("productId");
        const inquiryId = e.request.pathValue("inquiryId");

        if (!inquiryUtil.isUserAuth(e.auth)) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const product = inquiryUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        let inquiry = null;
        try {
            inquiry = $app.findRecordById("product_inquiries", inquiryId);
        } catch (err) {
            return e.json(404, { error: "문의글을 찾을 수 없습니다." });
        }

        if (inquiry.getString("product") !== product.id) {
            return e.json(404, { error: "문의글을 찾을 수 없습니다." });
        }

        if (inquiry.getString("user") !== e.auth.id) {
            return e.json(403, { error: "본인이 작성한 문의만 삭제할 수 있습니다." });
        }

        if (inquiry.getString("status") !== "pending") {
            return e.json(409, { error: "답변 전 문의만 삭제할 수 있습니다." });
        }

        $app.delete(inquiry);
        return e.json(200, { message: "문의글이 삭제되었습니다." });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("POST", "/api/cms/inquiries/{inquiryId}/answer", (e) => {
    try {
        const inquiryUtil = require(`${__hooks}/utils/inquiries.js`);
        const inquiryId = e.request.pathValue("inquiryId");
        const data = e.requestInfo().body || {};
        const answer = inquiryUtil.normalizeContent(data.answer);

        const validation = inquiryUtil.validateAnswer(answer);
        if (!validation.ok) {
            return e.json(400, { error: validation.error });
        }

        const inquiry = $app.findRecordById("product_inquiries", inquiryId);
        inquiry.set("answer", answer);
        inquiry.set("answered_at", new Date().toISOString());
        inquiry.set("answered_by", inquiryUtil.displayAdminName(e.auth));
        inquiry.set("status", "answered");
        $app.save(inquiry);

        return e.json(200, { item: inquiryUtil.exportCmsInquiry(inquiry) });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/inquiries/{inquiryId}/status", (e) => {
    try {
        const inquiryUtil = require(`${__hooks}/utils/inquiries.js`);
        const inquiryId = e.request.pathValue("inquiryId");
        const data = e.requestInfo().body || {};
        const nextStatus = String(data.status || "").trim();

        const inquiry = $app.findRecordById("product_inquiries", inquiryId);
        if (nextStatus === "restore") {
            inquiry.set("status", inquiryUtil.restoreStatus(inquiry));
        } else if (nextStatus === "hidden" || nextStatus === "pending" || nextStatus === "answered") {
            inquiry.set("status", nextStatus);
        } else {
            return e.json(400, { error: "문의 상태가 올바르지 않습니다." });
        }

        $app.save(inquiry);
        return e.json(200, { item: inquiryUtil.exportCmsInquiry(inquiry) });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/inquiries/{inquiryId}/delete", (e) => {
    try {
        const inquiryId = e.request.pathValue("inquiryId");
        const inquiry = $app.findRecordById("product_inquiries", inquiryId);

        $app.delete(inquiry);
        return e.json(200, { message: "문의글이 삭제되었습니다." });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());
