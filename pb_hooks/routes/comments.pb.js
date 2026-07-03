routerAdd("GET", "/api/products/{productId}/comments", (e) => {
    try {
        const commentUtil = require(`${__hooks}/utils/comments.js`);
        const productKey = e.request.pathValue("productId");
        const query = e.request.url.query();

        const product = commentUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        const authRecord = commentUtil.isUserAuth(e.auth) ? e.auth : null;
        const result = commentUtil.listPublishedComments(
            $app,
            product.id,
            authRecord,
            query.get("offset"),
            query.get("limit")
        );

        const loggedIn = !!authRecord;
        const hasPurchased = loggedIn && commentUtil.hasPurchasedProduct($app, authRecord.id, product.id);
        const existingComment = loggedIn ? commentUtil.findUserComment($app, product.id, authRecord.id) : null;
        const canWrite = hasPurchased && !existingComment;

        return e.json(200, {
            items: result.items,
            total: result.total,
            offset: result.offset,
            limit: result.limit,
            summary: result.summary,
            viewer: {
                loggedIn: loggedIn,
                canWrite: canWrite,
                hasPurchased: hasPurchased,
                hasComment: !!existingComment
            }
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("POST", "/api/products/{productId}/comments", (e) => {
    try {
        const commentUtil = require(`${__hooks}/utils/comments.js`);
        const productKey = e.request.pathValue("productId");
        const data = e.requestInfo().body || {};

        if (!commentUtil.isUserAuth(e.auth)) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const product = commentUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        if (!commentUtil.hasPurchasedProduct($app, e.auth.id, product.id)) {
            return e.json(403, { error: "구매확정된 주문 상품만 리뷰를 작성할 수 있습니다." });
        }

        const content = commentUtil.normalizeContent(data.content);
        const validation = commentUtil.validateContent(content);
        if (!validation.ok) {
            return e.json(400, { error: validation.error });
        }

        const rating = commentUtil.normalizeRating(data.rating);
        const ratingValidation = commentUtil.validateRating(rating);
        if (!ratingValidation.ok) {
            return e.json(400, { error: ratingValidation.error });
        }

        if (commentUtil.findUserComment($app, product.id, e.auth.id)) {
            return e.json(409, { error: "이미 이 상품에 평점과 댓글을 남겼습니다. 기존 댓글을 수정해 주세요." });
        }

        const couponUtil = require(`${__hooks}/utils/coupons.js`);
        let comment = null;
        let summary = null;
        let reward = null;

        $app.runInTransaction((txApp) => {
            const collection = txApp.findCollectionByNameOrId("product_comments");
            comment = new Record(collection);
            comment.set("product", product.id);
            comment.set("user", e.auth.id);
            comment.set("author_name", commentUtil.displayName(e.auth));
            comment.set("rating", rating);
            comment.set("content", content);
            comment.set("status", "published");
            txApp.save(comment);

            summary = commentUtil.updateProductRatingSummary(txApp, product.id);
            reward = couponUtil.issueReviewReward(txApp, e.auth.id, product.id, comment.id);
        });

        return e.json(200, {
            item: commentUtil.exportComment(comment, e.auth),
            summary: summary,
            couponIssued: !!(reward && reward.issued),
            coupon: reward && reward.coupon ? reward.coupon : null,
            couponMessage: reward && reward.issued ? "리뷰 보상 쿠폰이 지급되었습니다." : ""
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("PATCH", "/api/products/{productId}/comments/{commentId}", (e) => {
    try {
        const commentUtil = require(`${__hooks}/utils/comments.js`);
        const productKey = e.request.pathValue("productId");
        const commentId = e.request.pathValue("commentId");
        const data = e.requestInfo().body || {};

        if (!commentUtil.isUserAuth(e.auth)) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const product = commentUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        let comment = null;
        try {
            comment = $app.findRecordById("product_comments", commentId);
        } catch (err) {
            return e.json(404, { error: "댓글을 찾을 수 없습니다." });
        }

        if (comment.getString("product") !== product.id) {
            return e.json(404, { error: "댓글을 찾을 수 없습니다." });
        }

        if (comment.getString("user") !== e.auth.id) {
            return e.json(403, { error: "본인이 작성한 댓글만 수정할 수 있습니다." });
        }

        const content = commentUtil.normalizeContent(data.content);
        const validation = commentUtil.validateContent(content);
        if (!validation.ok) {
            return e.json(400, { error: validation.error });
        }

        const rating = commentUtil.normalizeRating(data.rating);
        const ratingValidation = commentUtil.validateRating(rating);
        if (!ratingValidation.ok) {
            return e.json(400, { error: ratingValidation.error });
        }

        comment.set("content", content);
        comment.set("rating", rating);
        if (!comment.getString("author_name")) {
            comment.set("author_name", commentUtil.displayName(e.auth));
        }
        $app.save(comment);

        const summary = commentUtil.updateProductRatingSummary($app, product.id);

        return e.json(200, { item: commentUtil.exportComment(comment, e.auth), summary: summary });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("DELETE", "/api/products/{productId}/comments/{commentId}", (e) => {
    try {
        const commentUtil = require(`${__hooks}/utils/comments.js`);
        const productKey = e.request.pathValue("productId");
        const commentId = e.request.pathValue("commentId");

        if (!commentUtil.isUserAuth(e.auth)) {
            return e.json(401, { error: "로그인이 필요합니다." });
        }

        const product = commentUtil.resolveProduct($app, productKey);
        if (!product) {
            return e.json(404, { error: "상품을 찾을 수 없습니다." });
        }

        let comment = null;
        try {
            comment = $app.findRecordById("product_comments", commentId);
        } catch (err) {
            return e.json(404, { error: "댓글을 찾을 수 없습니다." });
        }

        if (comment.getString("product") !== product.id) {
            return e.json(404, { error: "댓글을 찾을 수 없습니다." });
        }

        if (comment.getString("user") !== e.auth.id) {
            return e.json(403, { error: "본인이 작성한 댓글만 삭제할 수 있습니다." });
        }

        $app.delete(comment);
        const summary = commentUtil.updateProductRatingSummary($app, product.id);
        return e.json(200, { message: "댓글이 삭제되었습니다.", summary: summary });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
});

routerAdd("POST", "/api/cms/comments/{commentId}/status", (e) => {
    try {
        const commentUtil = require(`${__hooks}/utils/comments.js`);
        const commentId = e.request.pathValue("commentId");
        const data = e.requestInfo().body || {};
        const status = String(data.status || "");

        if (status !== "published" && status !== "hidden") {
            return e.json(400, { error: "댓글 상태가 올바르지 않습니다." });
        }

        const comment = $app.findRecordById("product_comments", commentId);
        comment.set("status", status);
        $app.save(comment);

        const summary = commentUtil.updateProductRatingSummary($app, comment.getString("product"));
        return e.json(200, {
            item: {
                id: comment.id,
                product: comment.getString("product"),
                user: comment.getString("user"),
                author_name: comment.getString("author_name"),
                rating: commentUtil.normalizeRating(comment.get("rating")),
                content: comment.getString("content"),
                status: comment.getString("status"),
                created: comment.getString("created"),
                updated: comment.getString("updated")
            },
            summary: summary
        });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());

routerAdd("DELETE", "/api/cms/comments/{commentId}", (e) => {
    try {
        const commentUtil = require(`${__hooks}/utils/comments.js`);
        const commentId = e.request.pathValue("commentId");
        const comment = $app.findRecordById("product_comments", commentId);
        const productId = comment.getString("product");

        $app.delete(comment);

        const summary = commentUtil.updateProductRatingSummary($app, productId);
        return e.json(200, { message: "댓글이 삭제되었습니다.", summary: summary });
    } catch (err) {
        return e.json(500, { error: err.toString() });
    }
}, $apis.requireSuperuserAuth());
