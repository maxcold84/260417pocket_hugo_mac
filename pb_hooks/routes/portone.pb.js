// PortOne V2 Payment Webhook Handler
routerAdd("POST", "/api/payment/webhook", (e) => {
    try {
        const portone = require(`${__hooks}/services/portone-verify.js`);
        const env = require(`${__hooks}/utils/env.js`);

        const getHeader = (name) => {
            try {
                return e.request.Header.Get(name);
            } catch (err) {}
            try {
                return e.request.header.get(name);
            } catch (err) {}
            return "";
        };

        const webhookId = getHeader("Webhook-Id");
        const webhookTimestamp = getHeader("Webhook-Timestamp");
        const webhookSignature = getHeader("Webhook-Signature");
        const rawBody = portone.getRawRequestBody(e);

        if (!rawBody) {
            return e.json(400, { error: "Raw webhook body is unavailable" });
        }

        const webhookSecret = env.get("PORTONE_WEBHOOK_SECRET");
        if (!webhookSecret) {
            return e.json(500, { error: "PORTONE_WEBHOOK_SECRET is not configured" });
        }

        if (!portone.verifyWebhookSignature(webhookSignature, webhookId, webhookTimestamp, rawBody, webhookSecret)) {
            return e.json(400, { error: "Invalid webhook signature" });
        }

        const body = portone.parseWebhookBody(rawBody);
        if (!body) {
            return e.json(400, { error: "Invalid webhook JSON body" });
        }

        const data = body.data || {};
        const paymentId = data.paymentId || body.paymentId;

        if (!paymentId) {
            return e.json(400, { error: "Payment ID missing" });
        }

        let order = null;
        try {
            order = $app.findRecordById("orders", paymentId);
        } catch (err) {
            return e.json(404, { error: "Order not found" });
        }

        const fetched = portone.fetchPayment(paymentId, env);
        if (!fetched.ok) {
            return e.json(fetched.statusCode || 400, { error: fetched.error });
        }

        const status = portone.getPaymentStatus(fetched.payment);

        if (status === "PAID") {
            const verified = portone.verifyPaidPaymentForOrder(order, paymentId, env, fetched.payment);
            if (!verified.ok) {
                return e.json(verified.statusCode || 400, { error: verified.error });
            }
            if (!verified.alreadyPaid) {
                order.set("status", "paid");
                order.set("portone_tx_id", verified.transactionId);
                $app.save(order);
            }
        } else if (status === "CANCELLED") {
            const currentStatus = order.getString("status");
            if (currentStatus === "paid" || currentStatus === "cancel_requested") {
                order.set("status", "refunded");
                $app.save(order);
            }
        } else if (status === "FAILED") {
            if (order.getString("status") === "pending") {
                $app.delete(order);
            }
        }

        console.log("PortOne webhook processed", JSON.stringify({
            webhookId: webhookId,
            eventType: body.type || body.eventType || "",
            paymentId: paymentId,
            status: status
        }));

        return e.json(200, { success: true });
    } catch (err) {
        return e.json(500, { error: "Webhook Error: " + err.toString() });
    }
});
