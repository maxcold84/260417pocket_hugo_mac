module.exports = function(c) {
    const userId = c.auth ? c.auth.id : null;
    const cookieHeader = c.request.header.get("Cookie") || "";
    let sessionId = null;
    cookieHeader.split(";").forEach(pair => {
        const parts = pair.trim().split("=");
        if (parts[0] === "pb_session") {
            sessionId = parts[1];
        }
    });

    let items = [];
    try {
        const filterStr = userId ? "user = {:id}" : "session_id = {:id}";
        const filterID = userId || sessionId;
        if (filterID) {
            items = $app.findRecordsByFilter("cart_items", filterStr, "", 100, 0, { "id": filterID });
            // Populate products
            $app.expandRecords(items, ["product"], null);
        }
    } catch(err) {
        console.log("Cart load error:", err);
    }

    let subtotal = 0;
    let itemsHtml = items.map(item => {
        const product = item.expandedOne("product");
        if (!product) return "";
        const price = product.getInt("price");
        const qty = item.getInt("quantity");
        subtotal += (price * qty);
        return `
        <div class="flex items-center justify-between py-4 border-b border-bmw-border">
            <div class="flex items-center gap-4">
                <div class="w-16 h-12 bg-black flex items-center justify-center text-xs text-gray-600 uppercase border border-bmw-border">IMG</div>
                <div>
                    <h3 class="font-medium">${product.getString("name")}</h3>
                    <p class="text-sm text-gray-400">₩${price.toLocaleString()} x ${qty}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold">₩${(price * qty).toLocaleString()}</p>
            </div>
        </div>
        `;
    }).join("");

    if (items.length === 0) {
        itemsHtml = `<p class="text-gray-400 py-8 text-center">Your cart is currently empty.</p>`;
    }

    return `
    <div class="max-w-4xl mx-auto py-12">
        <h1 class="text-3xl font-light mb-8 border-b border-bmw-border pb-4 tracking-widest text-white">YOUR CART</h1>
        <div class="bg-bmw-surface border border-bmw-border p-6 rounded-sm">
            <div class="mb-8">
                ${itemsHtml}
            </div>
            
            ${items.length > 0 ? `
            <div class="flex justify-between items-center text-xl font-light border-t border-bmw-border pt-6 mb-8">
                <span>SUBTOTAL</span>
                <span class="font-medium">₩${subtotal.toLocaleString()}</span>
            </div>
            ` : ''}

            <div class="flex justify-between items-center">
                <a href="/" class="text-gray-400 hover:text-white transition uppercase text-sm tracking-wide">Continue Shopping</a>
                ${items.length > 0 ? `
                <a href="/checkout" class="bg-bmw-blue hover:bg-blue-700 text-white px-8 py-3 uppercase tracking-wider text-sm font-medium transition duration-300 inline-block">
                    PROCEED TO CHECKOUT
                </a>
                ` : ''}
            </div>
        </div>
    </div>
    `;
};
