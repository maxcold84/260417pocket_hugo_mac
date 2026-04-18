// pb_hooks/portone.pb.js

// PortOne V2 Payment Webhook & API Verification Handler
routerAdd("POST", "/api/payment/webhook", (e) => {
    try {
        const portoneVerify = require(`${__hooks}/helpers/portone-verify.js`);
        
        // 1. Get Headers
        const webhookId = e.request.Header.Get("Webhook-Id");
        const webhookTimestamp = e.request.Header.Get("Webhook-Timestamp");
        const webhookSignature = e.request.Header.Get("Webhook-Signature");

        // 2. Get unformatted Body
        // In PocketBase JSVM, requestInfo().body contains the parsed map.
        // We reconstruct the compact JSON equivalent to the raw PortOne payload.
        const bodyObj = e.requestInfo().body;
        const rawBody = JSON.stringify(bodyObj);

        // 3. Signature Verification
        const secret = $os.getenv("PORTONE_WEBHOOK_SECRET") || "test_secret"; // Replace with your PB environment configuration
        
        const isValid = portoneVerify(webhookSignature, webhookId, webhookTimestamp, rawBody, secret);
        if (!isValid) {
            return e.json(400, { error: "Invalid webhook signature" });
        }

        // 4. Verify via PortOne API
        const data = bodyObj.data || {};
        const paymentId = data.paymentId;
        
        if (!paymentId) {
            return e.json(400, { error: "Payment ID missing" });
        }

        const apiSecret = $os.getenv("PORTONE_API_SECRET") || "test_api_secret";
        
        try {
            const res = $http.send({
                url: "https://api.portone.io/payments/" + paymentId,
                method: "GET",
                headers: {
                    "Authorization": "PortOne " + apiSecret
                }
            });
            
            if (res.statusCode !== 200) {
                return e.json(400, { error: "Failed to verify via API" });
            }
            
            const pResponse = res.json;
            const status = pResponse.status;
            
            // 5. Update Database Order
            // E.g., const order = $app.findFirstRecordByData("orders", "payment_id", paymentId)
            console.log("PortOne Webhook processed successfully for payment: " + paymentId);
            
            return e.json(200, { success: true });
        } catch(apiErr) {
            return e.json(500, { error: "PortOne Request Failed" });
        }
    } catch(err) {
        return e.json(500, { error: "Webhook Error: " + err.toString() });
    }
});
