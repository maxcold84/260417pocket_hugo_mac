module.exports = function(signatureHeader, webhookId, webhookTimestamp, payloadStr, secret) {
    if (!signatureHeader || !webhookId || !webhookTimestamp || !payloadStr || !secret) {
        return false;
    }

    // Extract signature from signatureHeader (format: "v1,signature_in_base64")
    const parts = signatureHeader.split(",");
    let signature = "";
    for (let p of parts) {
        if (p.startsWith("v1,")) signature = p.substring(3);
        else if (!p.includes(",")) signature = p; // fallback
    }

    if (!signature) return false;

    // Standard Webhooks spec: message is webhookId + "." + webhookTimestamp + "." + payloadStr
    const msg = webhookId + "." + webhookTimestamp + "." + payloadStr;
    const hexHmac = $security.hs256(msg, secret);
    
    // Hex to Base64 manually for Goja (which lacks built-in node buffers)
    const bytes = hexHmac.match(/\w{2}/g).map(function(a) {
        return String.fromCharCode(parseInt(a, 16));
    }).join("");
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let expectedBase64 = function(input) {
        let str = String(input);
        let output = '';
        for (
            let block, charCode, idx = 0, map = chars;
            str.charAt(idx | 0) || (map = '=', idx % 1);
            output += map.charAt(63 & block >> 8 - idx % 1 * 8)
        ) {
            charCode = str.charCodeAt(idx += 3/4);
            block = block << 8 | charCode;
        }
        return output;
    }(bytes);

    return signature === expectedBase64;
};
