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
        <div class="flex items-start justify-between py-4 border-b border-bmw-border gap-4">
            <div class="w-16 h-16 bg-black flex-shrink-0 flex items-center justify-center text-[10px] text-gray-600 uppercase border border-bmw-border">IMG</div>
            <div class="flex-1 min-w-0">
                <h3 class="font-medium text-sm text-white truncate">${product.getString("name")}</h3>
                <p class="text-xs text-gray-400 mt-1">₩${price.toLocaleString()} x ${qty}</p>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="font-medium text-sm text-white">₩${(price * qty).toLocaleString()}</p>
            </div>
        </div>
        `;
    }).join("");

    if (items.length === 0) {
        return `<div class="flex items-center justify-center h-full"><p class="text-gray-400 text-sm">Your cart is empty.</p></div>`;
    }

    return `
    <div class="flex flex-col h-full">
        <div class="flex-1 overflow-y-auto pr-2">
            ${itemsHtml}
        </div>
        <div class="mt-6 pt-4 border-t border-bmw-border bg-bmw-dark z-10 sticky bottom-0">
            <div class="flex justify-between items-center text-sm font-medium mb-6">
                <span class="text-gray-400 tracking-wider">SUBTOTAL</span>
                <span class="text-white text-lg">₩${subtotal.toLocaleString()}</span>
            </div>
            <a href="/checkout" class="block w-full bg-bmw-blue hover:bg-blue-700 text-white text-center py-4 uppercase tracking-wider text-sm font-medium transition duration-300">
                PROCEED TO CHECKOUT
            </a>
        </div>
    </div>
    `;
};
