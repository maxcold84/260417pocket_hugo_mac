module.exports = function(c) {
    const userId = c.auth ? c.auth.id : null;
    const cookieHeader = c.request.header.get("Cookie") || "";
    let sessionId = null;
    cookieHeader.split(";").forEach(pair => {
        const parts = pair.trim().split("=");
        if (parts[0] === "pb_session") sessionId = parts[1];
    });

    let items = [];
    let subtotal = 0;
    try {
        const filterStr = userId ? "user = {:id}" : "session_id = {:id}";
        const filterID = userId || sessionId;
        if (filterID) {
            items = $app.findRecordsByFilter("cart_items", filterStr, "", 100, 0, { "id": filterID });
            $app.expandRecords(items, ["product"], null);
            items.forEach(item => {
                const product = item.expandedOne("product");
                if (product) {
                    subtotal += (product.getInt("price") * item.getInt("quantity"));
                }
            });
        }
    } catch(err) {}

    if (items.length === 0) {
        return `<div class="max-w-4xl mx-auto py-12 text-center text-gray-400">Your cart is empty. Cannot checkout.</div>`;
    }

    // Pre-create 'pending' order in Pocketbase so webhook can map it
    let orderId = "";
    try {
        let collection = $app.findCollectionByNameOrId("orders");
        let newOrder = new Record(collection);
        newOrder.set("total_amount", subtotal);
        newOrder.set("status", "pending");
        if (userId) newOrder.set("user", userId);
        else newOrder.set("guest_info", { session_id: sessionId });
        
        $app.save(newOrder);
        // Normally you'd save order items too, omitted here for brevity
        orderId = newOrder.id;
    } catch (err) {
        console.log("Failed to prep order:", err);
    }

    return `
    <div class="max-w-4xl mx-auto" x-data="checkoutForm()">
        <h1 class="text-3xl font-light mb-8 border-b border-bmw-border pb-4">CHECKOUT</h1>
        <div class="bg-bmw-surface border border-bmw-border p-6 rounded-sm">
            <h2 class="text-xl font-light mb-6">Payment Details</h2>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Order Total</label>
                    <div class="text-2xl font-medium">₩${subtotal.toLocaleString()}</div>
                </div>
            </div>
            
            <div class="mt-8">
                <button @click="requestPayment" class="w-full bg-white text-black hover:bg-gray-200 px-8 py-4 uppercase tracking-widest text-sm font-bold transition duration-300">
                    PAY NOW SECURELY
                </button>
            </div>
        </div>
    </div>

    <script>
    document.addEventListener('alpine:init', () => {
        Alpine.data('checkoutForm', () => ({
            requestPayment() {
                PortOne.requestPayment({
                    storeId: "store-4017de8b-4c12-42b4-8452-f38b00085a67", // Placeholder
                    channelKey: "channel-key-placeholder", // Placeholder
                    paymentId: "${orderId}", // Links to PocketBase order.id
                    orderName: "BMW Shop Order",
                    totalAmount: ${subtotal},
                    currency: "CURRENCY_KRW",
                    payMethod: "CARD",
                    windowType: {
                        pc: "IFRAME",
                        mobile: "REDIRECTION"
                    },
                    redirectUrl: window.location.origin + "/payment/complete"
                }).then(function(response) {
                    if (response.code !== undefined) {
                        alert("Payment failed: " + response.message);
                        return;
                    }
                    window.location.href = "/payment/complete?paymentId=" + response.paymentId;
                });
            }
        }));
    });
    </script>
    `;
};
