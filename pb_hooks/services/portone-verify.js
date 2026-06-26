function hexToBase64(hex) {
    const bytes = hex.match(/\w{2}/g).map(function(part) {
        return String.fromCharCode(parseInt(part, 16));
    }).join("");

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    return (function(input) {
        const str = String(input);
        let output = "";
        for (
            let block, charCode, idx = 0, map = chars;
            str.charAt(idx | 0) || (map = "=", idx % 1);
            output += map.charAt(63 & block >> 8 - idx % 1 * 8)
        ) {
            charCode = str.charCodeAt(idx += 3 / 4);
            block = block << 8 | charCode;
        }
        return output;
    }(bytes));
}

function extractV1Signature(signatureHeader) {
    const header = String(signatureHeader || "").trim();
    if (!header) return "";

    if (header.indexOf("v1,") === 0) {
        return header.substring(3).split(" ")[0].trim();
    }
    if (header.indexOf("v1=") === 0) {
        return header.substring(3).split(" ")[0].trim();
    }

    const parts = header.split(",");
    if (parts.length >= 2 && parts[0].trim() === "v1") {
        return parts[1].trim();
    }

    return header;
}

function constantTimeEqual(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    const max = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;

    for (let i = 0; i < max; i++) {
        const aCode = i < a.length ? a.charCodeAt(i) : 0;
        const bCode = i < b.length ? b.charCodeAt(i) : 0;
        diff |= aCode ^ bCode;
    }

    return diff === 0;
}

function isFreshTimestamp(webhookTimestamp) {
    const raw = String(webhookTimestamp || "").trim();
    if (!raw) return false;

    let timestamp = parseInt(raw, 10);
    if (isNaN(timestamp)) return false;
    if (timestamp > 1000000000000) timestamp = Math.floor(timestamp / 1000);

    const now = Math.floor(Date.now() / 1000);
    return Math.abs(now - timestamp) <= 300;
}

function getRawRequestBody(e) {
    try {
        const raw = toString(e.request.body);
        if (raw && raw !== "[object Object]") return raw;
    } catch (err) {}

    try {
        const raw = String(e.request.body || "");
        if (raw && raw !== "[object Object]") return raw;
    } catch (err) {}

    return "";
}

function verifyWebhookSignature(signatureHeader, webhookId, webhookTimestamp, rawBody, secret) {
    if (!signatureHeader || !webhookId || !webhookTimestamp || !rawBody || !secret) {
        return false;
    }
    if (!isFreshTimestamp(webhookTimestamp)) {
        return false;
    }

    const signature = extractV1Signature(signatureHeader);
    if (!signature) return false;

    const message = webhookId + "." + webhookTimestamp + "." + rawBody;
    const expectedBase64 = hexToBase64($security.hs256(message, secret));

    return constantTimeEqual(signature, expectedBase64);
}

function requiredEnv(env, key) {
    const value = env.get(key);
    if (!value) {
        return {
            ok: false,
            statusCode: 500,
            error: key + " is not configured"
        };
    }
    return { ok: true, value: value };
}

function fetchPayment(paymentId, env) {
    const apiSecret = requiredEnv(env, "PORTONE_API_SECRET");
    if (!apiSecret.ok) return apiSecret;

    const res = $http.send({
        url: "https://api.portone.io/payments/" + encodeURIComponent(paymentId),
        method: "GET",
        headers: {
            "Authorization": "PortOne " + apiSecret.value
        }
    });

    if (res.statusCode !== 200) {
        return {
            ok: false,
            statusCode: 400,
            error: "Failed to verify payment via PortOne"
        };
    }

    return { ok: true, payment: res.json };
}

function getPaymentStatus(payment) {
    return String((payment && payment.status) || "").toUpperCase();
}

function paymentHasId(payment, paymentId) {
    if (!payment) return false;
    const candidates = [payment.paymentId, payment.id, payment.merchantUid];
    for (let i = 0; i < candidates.length; i++) {
        if (candidates[i] && String(candidates[i]) === paymentId) {
            return true;
        }
    }
    return false;
}

function getPaymentAmount(payment) {
    if (!payment) return null;
    if (payment.amount && payment.amount.total !== undefined) return parseInt(payment.amount.total, 10);
    if (payment.totalAmount !== undefined) return parseInt(payment.totalAmount, 10);
    if (payment.amount !== undefined && typeof payment.amount !== "object") return parseInt(payment.amount, 10);
    return null;
}

function getPaymentCurrency(payment) {
    const raw = String((payment && (payment.currency || (payment.amount && payment.amount.currency))) || "");
    return raw.replace("CURRENCY_", "").toUpperCase();
}

function getPaymentStoreId(payment) {
    if (!payment) return "";
    if (payment.storeId) return String(payment.storeId);
    if (payment.store && payment.store.id) return String(payment.store.id);
    return "";
}

function getTransactionId(payment, fallbackPaymentId) {
    if (!payment) return fallbackPaymentId;
    return String(payment.transactionId || payment.txId || payment.id || fallbackPaymentId);
}

function verifyPaidPaymentForOrder(order, paymentId, env, knownPayment) {
    const storeId = requiredEnv(env, "PORTONE_STORE_ID");
    if (!storeId.ok) return storeId;

    let payment = knownPayment;
    if (!payment) {
        const fetched = fetchPayment(paymentId, env);
        if (!fetched.ok) return fetched;
        payment = fetched.payment;
    }

    if (!paymentHasId(payment, paymentId) || order.id !== paymentId) {
        return {
            ok: false,
            statusCode: 400,
            error: "Payment id mismatch"
        };
    }

    if (getPaymentStatus(payment) !== "PAID") {
        return {
            ok: false,
            statusCode: 400,
            error: "Payment is not paid"
        };
    }

    const actualAmount = getPaymentAmount(payment);
    if (actualAmount === null || actualAmount !== order.getInt("total_amount")) {
        return {
            ok: false,
            statusCode: 400,
            error: "Payment amount mismatch"
        };
    }

    if (getPaymentCurrency(payment) !== "KRW") {
        return {
            ok: false,
            statusCode: 400,
            error: "Payment currency mismatch"
        };
    }

    const actualStoreId = getPaymentStoreId(payment);
    if (actualStoreId && actualStoreId !== storeId.value) {
        return {
            ok: false,
            statusCode: 400,
            error: "PortOne store id mismatch"
        };
    }

    const orderStatus = order.getString("status");
    if (orderStatus !== "pending" && orderStatus !== "paid") {
        return {
            ok: false,
            statusCode: 409,
            error: "Order is not payable from current status"
        };
    }

    return {
        ok: true,
        payment: payment,
        alreadyPaid: orderStatus === "paid",
        transactionId: getTransactionId(payment, paymentId)
    };
}

module.exports = {
    fetchPayment: fetchPayment,
    getPaymentStatus: getPaymentStatus,
    getRawRequestBody: getRawRequestBody,
    verifyPaidPaymentForOrder: verifyPaidPaymentForOrder,
    verifyWebhookSignature: verifyWebhookSignature
};
