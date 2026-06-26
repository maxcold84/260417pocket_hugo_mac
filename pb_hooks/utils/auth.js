module.exports = {
    getSuperuserFromCookie: (ev) => {
        try {
            const getHeader = (name) => {
                try {
                    return ev.request.header.get(name);
                } catch (err) {}
                try {
                    return ev.request.Header.Get(name);
                } catch (err) {}
                return "";
            };

            const getCookieToken = () => {
                const cookie = getHeader("Cookie");
                if (!cookie) return "";

                const match = cookie.match(/pb_auth=([^;]+)/);
                if (!match) return "";

                const cookieVal = decodeURIComponent(match[1]);
                try {
                    const parsed = JSON.parse(cookieVal);
                    return parsed && parsed.token ? parsed.token : cookieVal;
                } catch (err) {
                    return cookieVal;
                }
            };

            const authHeader = getHeader("Authorization");
            const authToken = authHeader && authHeader.toLowerCase().indexOf("bearer ") === 0
                ? authHeader.slice(7).trim()
                : "";
            const cookieToken = getCookieToken();
            const tokens = [authToken, cookieToken].filter(token => token);

            for (const token of tokens) {
                try {
                    const authRecord = ev.app.findAuthRecordByToken(token, "auth");
                    if (authRecord && authRecord.collection().name === "_superusers") {
                        return authRecord;
                    }
                } catch (err) {}
            }

            return null;
        } catch (err) {
            console.error("[auth] superuser cookie verification failed");
            return null;
        }
    }
};
