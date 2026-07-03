const REVIEW_REWARD_KEY = "review_reward";
const REVIEW_REWARD_SOURCE = "review_reward";

function nowIso() {
    return new Date().toISOString();
}

function addDaysIso(days) {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(1, parseInt(days, 10) || 30));
    return date.toISOString();
}

function recordInt(record, field) {
    return Math.max(0, parseInt(record.get(field) || 0, 10) || 0);
}

function isExpired(coupon) {
    const expiresAt = coupon.getString("expires_at");
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now();
}

function createDefaultSetting(app) {
    const collection = app.findCollectionByNameOrId("coupon_settings");
    const record = new Record(collection);
    record.set("key", REVIEW_REWARD_KEY);
    record.set("enabled", true);
    record.set("discount_type", "fixed");
    record.set("discount_value", 5000);
    record.set("expires_days", 30);
    record.set("minimum_order_amount", 0);
    record.set("max_discount_amount", 0);
    app.save(record);
    return record;
}

function getReviewRewardSetting(app) {
    const records = app.findRecordsByFilter(
        "coupon_settings",
        "key = {:key}",
        "",
        1,
        0,
        { key: REVIEW_REWARD_KEY }
    ) || [];
    return records.length > 0 ? records[0] : createDefaultSetting(app);
}

function exportSetting(record) {
    return {
        id: record.id,
        key: record.getString("key"),
        enabled: !!record.getBool("enabled"),
        discountType: record.getString("discount_type") || "fixed",
        discountValue: recordInt(record, "discount_value"),
        expiresDays: recordInt(record, "expires_days") || 30,
        minimumOrderAmount: recordInt(record, "minimum_order_amount"),
        maxDiscountAmount: recordInt(record, "max_discount_amount")
    };
}

function parseEnabled(value) {
    if (value === false || value === "false" || value === 0 || value === "0") return false;
    return true;
}

function parseDiscountType(value) {
    const type = String(value || "fixed");
    return type === "percent" ? "percent" : "fixed";
}

function hasInput(data, camelName, snakeName) {
    return Object.prototype.hasOwnProperty.call(data, camelName)
        || Object.prototype.hasOwnProperty.call(data, snakeName);
}

function inputValue(data, camelName, snakeName, fallback) {
    if (Object.prototype.hasOwnProperty.call(data, camelName)) return data[camelName];
    if (Object.prototype.hasOwnProperty.call(data, snakeName)) return data[snakeName];
    return fallback;
}

function parseIntegerInput(value, label, minValue) {
    if (value === undefined || value === null || value === "") {
        return { ok: false, error: label + " 값을 입력해 주세요." };
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || Math.floor(parsed) !== parsed) {
        return { ok: false, error: label + " 값은 정수로 입력해 주세요." };
    }
    if (parsed < minValue) {
        return { ok: false, error: label + " 값은 " + minValue + " 이상이어야 합니다." };
    }
    return { ok: true, value: parsed };
}

function updateReviewRewardSetting(app, data) {
    const setting = getReviewRewardSetting(app);
    const discountType = parseDiscountType(data.discountType || data.discount_type);
    const discountValueResult = parseIntegerInput(inputValue(data, "discountValue", "discount_value", undefined), "쿠폰 할인값", 1);
    if (!discountValueResult.ok) {
        return { ok: false, error: discountValueResult.error };
    }

    const expiresDaysResult = parseIntegerInput(inputValue(data, "expiresDays", "expires_days", undefined), "쿠폰 유효기간", 1);
    if (!expiresDaysResult.ok) {
        return { ok: false, error: expiresDaysResult.error };
    }

    const minimumInput = hasInput(data, "minimumOrderAmount", "minimum_order_amount")
        ? inputValue(data, "minimumOrderAmount", "minimum_order_amount", 0)
        : 0;
    const minimumResult = parseIntegerInput(minimumInput, "최소 주문금액", 0);
    if (!minimumResult.ok) {
        return { ok: false, error: minimumResult.error };
    }

    const maxInput = hasInput(data, "maxDiscountAmount", "max_discount_amount")
        ? inputValue(data, "maxDiscountAmount", "max_discount_amount", 0)
        : 0;
    const maxResult = parseIntegerInput(maxInput, "최대 할인액", 0);
    if (!maxResult.ok) {
        return { ok: false, error: maxResult.error };
    }

    const discountValue = discountValueResult.value;
    const expiresDays = expiresDaysResult.value;
    const minimumOrderAmount = minimumResult.value;
    const maxDiscountAmount = maxResult.value;

    if (discountValue < 1) {
        return { ok: false, error: "쿠폰 할인값은 1 이상이어야 합니다." };
    }
    if (discountType === "percent" && discountValue > 100) {
        return { ok: false, error: "정률 쿠폰 할인율은 100%를 넘을 수 없습니다." };
    }

    setting.set("enabled", parseEnabled(data.enabled));
    setting.set("discount_type", discountType);
    setting.set("discount_value", discountValue);
    setting.set("expires_days", expiresDays);
    setting.set("minimum_order_amount", minimumOrderAmount);
    setting.set("max_discount_amount", maxDiscountAmount);
    app.save(setting);
    return { ok: true, setting: exportSetting(setting) };
}

function couponPayload(record) {
    return {
        discount_type: record.getString("discount_type") || "fixed",
        discount_value: recordInt(record, "discount_value"),
        minimum_order_amount: recordInt(record, "minimum_order_amount"),
        max_discount_amount: recordInt(record, "max_discount_amount")
    };
}

function calculateDiscount(source, subtotal) {
    const amount = Math.max(0, parseInt(subtotal, 10) || 0);
    const minimum = Math.max(0, parseInt(source.minimum_order_amount || 0, 10) || 0);
    const discountValue = Math.max(0, parseInt(source.discount_value || 0, 10) || 0);
    const maxDiscount = Math.max(0, parseInt(source.max_discount_amount || 0, 10) || 0);
    const discountType = source.discount_type === "percent" ? "percent" : "fixed";

    if (amount < minimum) {
        return { ok: false, error: "쿠폰 최소 주문금액을 충족하지 않습니다.", discountAmount: 0 };
    }

    const rawDiscount = discountType === "percent"
        ? Math.floor(amount * discountValue / 100)
        : discountValue;
    const cappedDiscount = maxDiscount > 0 ? Math.min(rawDiscount, maxDiscount) : rawDiscount;
    const discountAmount = Math.min(amount, Math.max(0, cappedDiscount));

    if (discountAmount <= 0) {
        return { ok: false, error: "적용 가능한 쿠폰 할인액이 없습니다.", discountAmount: 0 };
    }
    if (amount - discountAmount <= 0) {
        return { ok: false, error: "쿠폰 적용 후 결제 금액은 1원 이상이어야 합니다.", discountAmount: 0 };
    }

    return { ok: true, discountAmount: discountAmount, finalAmount: amount - discountAmount };
}

function exportCoupon(record) {
    const payload = couponPayload(record);
    return {
        id: record.id,
        code: record.getString("code"),
        status: record.getString("status"),
        discountType: payload.discount_type,
        discountValue: payload.discount_value,
        minimumOrderAmount: payload.minimum_order_amount,
        maxDiscountAmount: payload.max_discount_amount,
        sourceType: record.getString("source_type"),
        sourceProduct: record.getString("source_product"),
        sourceComment: record.getString("source_comment"),
        reservedOrder: record.getString("reserved_order"),
        redeemedOrder: record.getString("redeemed_order"),
        issuedAt: record.getString("issued_at"),
        expiresAt: record.getString("expires_at"),
        usedAt: record.getString("used_at")
    };
}

function generateCouponCode(app) {
    for (let attempt = 0; attempt < 10; attempt++) {
        let randomPart = "";
        try {
            randomPart = $security.randomString(10).toUpperCase();
        } catch (err) {
            randomPart = String(Date.now()) + String(Math.floor(Math.random() * 100000));
        }
        const code = "RV-" + randomPart.replace(/[^A-Z0-9]/g, "").slice(0, 10);
        const existing = app.findRecordsByFilter("user_coupons", "code = {:code}", "", 1, 0, { code: code }) || [];
        if (existing.length === 0) return code;
    }
    return "RV-" + String(Date.now()).slice(-10);
}

function findReviewRewardCoupon(app, userId, productId) {
    const records = app.findRecordsByFilter(
        "user_coupons",
        "user = {:userId} && source_type = \"review_reward\" && source_product = {:productId}",
        "",
        1,
        0,
        { userId: userId, productId: productId }
    ) || [];
    return records.length > 0 ? records[0] : null;
}

function issueReviewReward(app, userId, productId, commentId) {
    const existing = findReviewRewardCoupon(app, userId, productId);
    if (existing) {
        return { issued: false, reason: "already_issued", coupon: exportCoupon(existing) };
    }

    const setting = getReviewRewardSetting(app);
    if (!setting.getBool("enabled")) {
        return { issued: false, reason: "disabled", coupon: null };
    }

    const collection = app.findCollectionByNameOrId("user_coupons");
    const coupon = new Record(collection);
    coupon.set("user", userId);
    coupon.set("code", generateCouponCode(app));
    coupon.set("status", "available");
    coupon.set("discount_type", setting.getString("discount_type") || "fixed");
    coupon.set("discount_value", recordInt(setting, "discount_value"));
    coupon.set("minimum_order_amount", recordInt(setting, "minimum_order_amount"));
    coupon.set("max_discount_amount", recordInt(setting, "max_discount_amount"));
    coupon.set("source_type", REVIEW_REWARD_SOURCE);
    coupon.set("source_product", productId);
    coupon.set("source_comment", commentId);
    coupon.set("issued_at", nowIso());
    coupon.set("expires_at", addDaysIso(recordInt(setting, "expires_days") || 30));
    app.save(coupon);

    return { issued: true, reason: "issued", coupon: exportCoupon(coupon) };
}

function listAvailableCoupons(app, userId) {
    const records = app.findRecordsByFilter(
        "user_coupons",
        "user = {:userId} && status = \"available\"",
        "",
        200,
        0,
        { userId: userId }
    ) || [];
    const available = [];
    for (const record of records) {
        if (isExpired(record)) {
            record.set("status", "expired");
            app.save(record);
            continue;
        }
        available.push(exportCoupon(record));
    }
    available.sort((left, right) => String(left.expiresAt || "").localeCompare(String(right.expiresAt || "")));
    return available;
}

function validateCouponForUse(app, couponId, userId, subtotal) {
    if (!couponId) {
        return { ok: true, coupon: null, discountAmount: 0, finalAmount: subtotal };
    }
    if (!userId) {
        return { ok: false, statusCode: 401, error: "쿠폰은 로그인 회원만 사용할 수 있습니다." };
    }

    const coupon = app.findRecordById("user_coupons", couponId);
    if (coupon.getString("user") !== userId) {
        return { ok: false, statusCode: 403, error: "본인 쿠폰만 사용할 수 있습니다." };
    }
    if (coupon.getString("status") !== "available") {
        return { ok: false, statusCode: 400, error: "사용 가능한 쿠폰이 아닙니다." };
    }
    if (isExpired(coupon)) {
        coupon.set("status", "expired");
        app.save(coupon);
        return { ok: false, statusCode: 400, error: "만료된 쿠폰입니다." };
    }

    const discount = calculateDiscount(couponPayload(coupon), subtotal);
    if (!discount.ok) {
        return { ok: false, statusCode: 400, error: discount.error };
    }
    return {
        ok: true,
        coupon: coupon,
        discountAmount: discount.discountAmount,
        finalAmount: discount.finalAmount
    };
}

function reserveCouponForOrder(app, coupon, order) {
    if (!coupon) return;
    if (coupon.getString("status") !== "available") {
        throw new Error("쿠폰을 예약할 수 없습니다.");
    }
    coupon.set("status", "reserved");
    coupon.set("reserved_order", order.id);
    app.save(coupon);
}

function releaseCouponReservationForOrder(app, order) {
    const couponId = order.getString("coupon");
    if (!couponId) return;
    let coupon = null;
    try {
        coupon = app.findRecordById("user_coupons", couponId);
    } catch (err) {
        return;
    }
    if (coupon.getString("status") !== "reserved") return;
    if (coupon.getString("reserved_order") !== order.id) return;
    coupon.set("status", "available");
    coupon.set("reserved_order", "");
    app.save(coupon);
}

function markCouponUsedForOrder(app, order) {
    const couponId = order.getString("coupon");
    if (!couponId) return;
    const coupon = app.findRecordById("user_coupons", couponId);
    if (coupon.getString("status") === "used" && coupon.getString("redeemed_order") === order.id) return;
    if (coupon.getString("status") !== "reserved" || coupon.getString("reserved_order") !== order.id) {
        throw new Error("예약된 쿠폰 상태가 올바르지 않습니다.");
    }
    coupon.set("status", "used");
    coupon.set("redeemed_order", order.id);
    coupon.set("used_at", nowIso());
    app.save(coupon);
}

module.exports = {
    calculateDiscount: calculateDiscount,
    exportCoupon: exportCoupon,
    exportSetting: exportSetting,
    getReviewRewardSetting: getReviewRewardSetting,
    issueReviewReward: issueReviewReward,
    listAvailableCoupons: listAvailableCoupons,
    markCouponUsedForOrder: markCouponUsedForOrder,
    releaseCouponReservationForOrder: releaseCouponReservationForOrder,
    reserveCouponForOrder: reserveCouponForOrder,
    updateReviewRewardSetting: updateReviewRewardSetting,
    validateCouponForUse: validateCouponForUse
};
