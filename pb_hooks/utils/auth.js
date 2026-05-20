module.exports = {
    getSuperuserFromCookie: (ev) => {
        try {
            const cookie = ev.request.header.get("Cookie");
            console.log("[auth] Cookie header:", cookie);
            if (!cookie) {
                console.log("[auth] No cookie header found");
                return null;
            }
            const match = cookie.match(/pb_auth=([^;]+)/);
            if (!match) {
                console.log("[auth] pb_auth cookie not found");
                return null;
            }
            // Decode the cookie value in case it is URL encoded (cookie values can be encoded by the browser)
            const cookieVal = decodeURIComponent(match[1]);
            let token = cookieVal;
            try {
                const parsed = JSON.parse(cookieVal);
                if (parsed && parsed.token) {
                    token = parsed.token;
                    console.log("[auth] Extracted token from JSON cookie");
                }
            } catch (e) {
                console.log("[auth] Cookie value is not JSON, treating as raw token");
            }
            console.log("[auth] Parsed token (first 15 chars):", token.substring(0, 15) + "...");
            
            const superusers = ev.app.findCollectionByNameOrId("_superusers");
            console.log("[auth] Found _superusers collection:", superusers ? "yes" : "no");
            
            // Try traditional findAuthRecordByToken
            let superuser = null;
            try {
                superuser = ev.app.findAuthRecordByToken(token, superusers);
                console.log("[auth] findAuthRecordByToken result:", superuser ? "Found: " + superuser.id : "Not found");
            } catch (authErr) {
                console.error("[auth] findAuthRecordByToken threw error:", authErr);
            }
            
            // Fallback: If findAuthRecordByToken fails, let's try decoding the JWT manually to get the user ID!
            if (!superuser) {
                console.log("[auth] Attempting JWT parsing fallback");
                try {
                    const claims = $security.parseUnverifiedJWT(token);
                    console.log("[auth] Parsed JWT claims:", JSON.stringify(claims));
                    if (claims && claims.id) {
                        superuser = ev.app.findRecordById("_superusers", claims.id);
                        console.log("[auth] Fallback findRecordById result:", superuser ? "Found: " + superuser.id : "Not found");
                    }
                } catch (jwtErr) {
                    console.error("[auth] JWT parsing fallback threw error:", jwtErr);
                }
            }
            
            return superuser;
        } catch (err) {
            console.error("[auth] getSuperuserFromCookie error:", err);
            return null;
        }
    }
};
