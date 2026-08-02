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

function normalizeTitle(value) {
    return String(value || "").trim();
}

function normalizeContent(value) {
    return String(value || "").trim();
}

function normalizeSecret(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}

function validateTitle(title) {
    if (!title) {
        return { ok: false, error: "문의 제목을 입력해 주세요." };
    }
    if (title.length > 120) {
        return { ok: false, error: "문의 제목은 120자 이하로 입력해 주세요." };
    }
    return { ok: true };
}

function validateContent(content) {
    if (!content) {
        return { ok: false, error: "문의 내용을 입력해 주세요." };
    }
    if (content.length > 2000) {
        return { ok: false, error: "문의 내용은 2000자 이하로 입력해 주세요." };
    }
    return { ok: true };
}

function validateAnswer(answer) {
    if (!answer) {
        return { ok: false, error: "답변 내용을 입력해 주세요." };
    }
    if (answer.length > 2000) {
        return { ok: false, error: "답변은 2000자 이하로 입력해 주세요." };
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

function displayAdminName(authRecord) {
    if (!authRecord) return "관리자";
    const name = authRecord.getString("name");
    if (name) return name;
    const email = authRecord.getString("email");
    if (email) return email;
    return "관리자";
}

function isSecret(inquiry) {
    return normalizeSecret(inquiry.get("is_secret"));
}

function hasAnswer(inquiry) {
    return !!String(inquiry.getString("answer") || "").trim();
}

function isOwner(inquiry, authRecord) {
    return isUserAuth(authRecord) && inquiry.getString("user") === authRecord.id;
}

function canEditInquiry(inquiry, authRecord) {
    return isOwner(inquiry, authRecord) && inquiry.getString("status") === "pending";
}

function canViewPrivate(inquiry, authRecord) {
    return !isSecret(inquiry) || isOwner(inquiry, authRecord);
}

function compareCreatedDesc(left, right) {
    return String(right.getString("created") || "").localeCompare(String(left.getString("created") || ""));
}

function exportInquiry(inquiry, authRecord) {
    const canEdit = canEditInquiry(inquiry, authRecord);
    const secret = isSecret(inquiry);
    const viewPrivate = canViewPrivate(inquiry, authRecord);
    const answered = hasAnswer(inquiry);
    const masked = secret && !viewPrivate;

    return {
        id: inquiry.id,
        title: masked ? "비밀 문의입니다." : inquiry.getString("title"),
        content: masked ? "" : inquiry.getString("content"),
        isSecret: secret,
        isMasked: masked,
        status: inquiry.getString("status"),
        hasAnswer: answered,
        answer: masked ? "" : inquiry.getString("answer"),
        answeredAt: masked ? "" : inquiry.getString("answered_at"),
        authorName: masked ? "비공개" : (inquiry.getString("author_name") || "회원"),
        created: inquiry.getString("created"),
        updated: inquiry.getString("updated"),
        canEdit: canEdit,
        canDelete: canEdit
    };
}

function exportCmsInquiry(inquiry) {
    return {
        id: inquiry.id,
        product: inquiry.getString("product"),
        user: inquiry.getString("user"),
        author_name: inquiry.getString("author_name"),
        title: inquiry.getString("title"),
        content: inquiry.getString("content"),
        is_secret: isSecret(inquiry),
        status: inquiry.getString("status"),
        answer: inquiry.getString("answer"),
        answered_at: inquiry.getString("answered_at"),
        answered_by: inquiry.getString("answered_by"),
        created: inquiry.getString("created"),
        updated: inquiry.getString("updated")
    };
}

function listVisibleInquiries(app, productId, authRecord, offset, limit) {
    const records = [];
    const pageSize = 100;

    for (let pageOffset = 0; ; pageOffset += pageSize) {
        const page = app.findRecordsByFilter(
            "product_inquiries",
            "product = {:productId}",
            "",
            pageSize,
            pageOffset,
            { productId: productId }
        ) || [];

        for (const record of page) {
            if (record.getString("status") !== "hidden") {
                records.push(record);
            }
        }

        if (page.length < pageSize) break;
    }

    records.sort(compareCreatedDesc);

    const start = normalizeOffset(offset);
    const count = normalizeLimit(limit);
    const items = records.slice(start, start + count).map(function(record) {
        return exportInquiry(record, authRecord);
    });

    return {
        items: items,
        total: records.length,
        offset: start,
        limit: count
    };
}

function restoreStatus(inquiry) {
    return hasAnswer(inquiry) ? "answered" : "pending";
}

module.exports = {
    normalizeLimit: normalizeLimit,
    normalizeOffset: normalizeOffset,
    normalizeTitle: normalizeTitle,
    normalizeContent: normalizeContent,
    normalizeSecret: normalizeSecret,
    validateTitle: validateTitle,
    validateContent: validateContent,
    validateAnswer: validateAnswer,
    resolveProduct: resolveProduct,
    isUserAuth: isUserAuth,
    displayName: displayName,
    displayAdminName: displayAdminName,
    exportInquiry: exportInquiry,
    exportCmsInquiry: exportCmsInquiry,
    listVisibleInquiries: listVisibleInquiries,
    restoreStatus: restoreStatus
};
