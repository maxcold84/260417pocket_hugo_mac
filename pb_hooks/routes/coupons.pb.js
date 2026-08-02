routerAdd("GET", "/api/coupons/available", (e) => {
    try {
        if (!e.auth || e.auth.collection().name !== "users") {
            return e.json(401, { error: "로그인이 필요합니다." });
        }
        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        return e.json(200, {
            items: couponUtil.listAvailableCoupons($app, e.auth.id)
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("GET", "/api/cms/coupon-settings", (e) => {
    try {
        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        const setting = couponUtil.getReviewRewardSetting($app);
        return e.json(200, {
            setting: couponUtil.exportSetting(setting)
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/cms/coupon-settings", (e) => {
    try {
        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        const data = e.requestInfo().body || {};
        const result = couponUtil.updateReviewRewardSetting($app, data);
        if (!result.ok) {
            return e.json(400, { error: result.error });
        }
        return e.json(200, {
            setting: result.setting,
            message: "쿠폰 설정이 저장되었습니다."
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/api/cms/coupons", (e) => {
    try {
        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        const records = [];
        const pageSize = 200;
        for (let offset = 0; ; offset += pageSize) {
            const page = $app.findRecordsByFilter("user_coupons", "1=1", "", pageSize, offset) || [];
            for (const coupon of page) {
                const item = couponUtil.exportCoupon(coupon);
                try {
                    const user = $app.findRecordById("users", coupon.getString("user"));
                    item.userEmail = user.getString("email");
                    item.userName = user.getString("name") || user.getString("nickname") || user.getString("email");
                } catch (userErr) {
                    item.userEmail = "";
                    item.userName = "회원";
                }
                try {
                    const product = $app.findRecordById("products", coupon.getString("source_product"));
                    item.productName = product.getString("name");
                    item.productSlug = product.getString("slug");
                } catch (productErr) {
                    item.productName = "";
                    item.productSlug = "";
                }
                records.push(item);
            }
            if (page.length < pageSize) break;
        }
        records.sort((left, right) => String(right.issuedAt || "").localeCompare(String(left.issuedAt || "")));
        return e.json(200, { items: records });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());
