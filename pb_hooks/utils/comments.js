function normalizeLimit(value) {
    const parsed = parseInt(value, 10);
    if (!parsed || parsed < 1) return 20;
    return Math.min(parsed, 50);
}

function normalizeOffset(value) {
    const parsed = parseInt(value, 10);
    if (!parsed || parsed < 0) return 0;
    return parsed;
}

function normalizeContent(value) {
    return String(value || "").trim();
}

function validateContent(content) {
    if (!content) {
        return { ok: false, error: "댓글 내용을 입력해 주세요." };
    }
    if (content.length > 1000) {
        return { ok: false, error: "댓글은 1000자 이하로 입력해 주세요." };
    }
    return { ok: true };
}

function normalizeRating(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed);
}

function validateRating(rating) {
    if (rating < 1 || rating > 5) {
        return { ok: false, error: "평점은 1점부터 5점까지 선택해 주세요." };
    }
    return { ok: true };
}

function resolveProduct(app, productKey) {
    const key = String(productKey || "").trim();
    if (!key) return null;

    try {
        return app.findRecordById("products", key);
    } catch (err) {
        const records = app.findRecordsByFilter(
            "products",
            "slug = {:slug}",
            "",
            1,
            0,
            { slug: key }
        ) || [];
        return records.length > 0 ? records[0] : null;
    }
}

function isUserAuth(authRecord) {
    return !!(authRecord && authRecord.collection && authRecord.collection().name === "users");
}

function displayName(userRecord) {
    if (!userRecord) return "회원";
    const nickname = userRecord.getString("nickname");
    if (nickname) return nickname;
    const name = userRecord.getString("name");
    if (name) return name;
    const email = userRecord.getString("email");
    if (email) return email.split("@")[0] || email;
    return "회원";
}

function userCanEdit(comment, authRecord) {
    return isUserAuth(authRecord) && comment.getString("user") === authRecord.id;
}

function exportComment(comment, authRecord) {
    const canEdit = userCanEdit(comment, authRecord);
    return {
        id: comment.id,
        authorName: comment.getString("author_name") || "회원",
        rating: normalizeRating(comment.get("rating")),
        content: comment.getString("content"),
        created: comment.getString("created"),
        updated: comment.getString("updated"),
        canEdit: canEdit,
        canDelete: canEdit
    };
}

function compareCreatedDesc(left, right) {
    return String(right.getString("created") || "").localeCompare(String(left.getString("created") || ""));
}

function hasPurchasedProduct(app, userId, productId) {
    if (!userId || !productId) return false;

    const pageSize = 100;

    for (let offset = 0; ; offset += pageSize) {
        const orders = app.findRecordsByFilter("orders", "user = {:userId}", "", pageSize, offset, { userId: userId }) || [];
        for (const order of orders) {
            if (order.getString("status") !== "purchase_confirmed") {
                continue;
            }

            const items = app.findRecordsByFilter(
                "order_items",
                "order = {:orderId} && product = {:productId}",
                "",
                1,
                0,
                { orderId: order.id, productId: productId }
            ) || [];
            if (items.length > 0) {
                return true;
            }
        }

        if (orders.length < pageSize) break;
    }

    return false;
}

function findUserComment(app, productId, userId) {
    if (!productId || !userId) return null;
    const records = app.findRecordsByFilter(
        "product_comments",
        "product = {:productId} && user = {:userId}",
        "",
        1,
        0,
        { productId: productId, userId: userId }
    ) || [];
    return records.length > 0 ? records[0] : null;
}

function calculateRatingSummary(app, productId) {
    const records = [];
    const pageSize = 100;

    for (let pageOffset = 0; ; pageOffset += pageSize) {
        const page = app.findRecordsByFilter(
            "product_comments",
            "product = {:productId} && status = \"published\"",
            "",
            pageSize,
            pageOffset,
            { productId: productId }
        ) || [];

        for (const record of page) {
            records.push(record);
        }

        if (page.length < pageSize) break;
    }

    let sum = 0;
    let count = 0;
    for (const record of records) {
        const rating = normalizeRating(record.get("rating"));
        if (rating >= 1 && rating <= 5) {
            sum += rating;
            count += 1;
        }
    }

    return {
        average: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
        count: count
    };
}

function updateProductRatingSummary(app, productId) {
    const summary = calculateRatingSummary(app, productId);
    try {
        const product = app.findRecordById("products", productId);
        product.set("rating_average", summary.average);
        product.set("rating_count", summary.count);
        app.save(product);
    } catch (err) {
        console.error("[comments] Failed to update product rating summary for " + productId + ":", err);
    }
    return summary;
}

function listPublishedComments(app, productId, authRecord, offset, limit) {
    const records = [];
    const pageSize = 100;

    for (let pageOffset = 0; ; pageOffset += pageSize) {
        const page = app.findRecordsByFilter(
            "product_comments",
            "product = {:productId} && status = \"published\"",
            "",
            pageSize,
            pageOffset,
            { productId: productId }
        ) || [];

        for (const record of page) {
            records.push(record);
        }

        if (page.length < pageSize) break;
    }

    records.sort(compareCreatedDesc);

    const start = normalizeOffset(offset);
    const count = normalizeLimit(limit);
    const items = records.slice(start, start + count).map(function(record) {
        return exportComment(record, authRecord);
    });

    return {
        items: items,
        total: records.length,
        offset: start,
        limit: count,
        summary: calculateRatingSummary(app, productId)
    };
}

module.exports = {
    normalizeLimit: normalizeLimit,
    normalizeOffset: normalizeOffset,
    normalizeContent: normalizeContent,
    validateContent: validateContent,
    normalizeRating: normalizeRating,
    validateRating: validateRating,
    resolveProduct: resolveProduct,
    isUserAuth: isUserAuth,
    displayName: displayName,
    exportComment: exportComment,
    hasPurchasedProduct: hasPurchasedProduct,
    findUserComment: findUserComment,
    calculateRatingSummary: calculateRatingSummary,
    updateProductRatingSummary: updateProductRatingSummary,
    listPublishedComments: listPublishedComments
};
