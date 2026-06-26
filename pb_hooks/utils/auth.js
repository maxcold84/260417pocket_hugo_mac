module.exports = {
    getSuperuserFromCookie: (ev) => {
        try {
            const getCookie = () => {
                try {
                    return ev.request.header.get("Cookie");
                } catch (err) {}
                try {
                    return ev.request.Header.Get("Cookie");
                } catch (err) {}
                return "";
            };

            const cookie = getCookie();
            if (!cookie) return null;

            const match = cookie.match(/pb_auth=([^;]+)/);
            if (!match) return null;

            const cookieVal = decodeURIComponent(match[1]);
            let token = cookieVal;
            try {
                const parsed = JSON.parse(cookieVal);
                if (parsed && parsed.token) token = parsed.token;
            } catch (err) {}

            if (!token) return null;

            const superusers = ev.app.findCollectionByNameOrId("_superusers");
            return ev.app.findAuthRecordByToken(token, superusers);
        } catch (err) {
            console.error("[auth] superuser cookie verification failed");
            return null;
        }
    }
};
