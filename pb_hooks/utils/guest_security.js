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

function parseGuestInfo(rawGuest) {
    if (!rawGuest) return null;

    try {
        const jsonStr = typeof rawGuest === "string" ? rawGuest : rawGuest.toString();
        if (!jsonStr) return null;
        return JSON.parse(jsonStr);
    } catch (err) {
        return null;
    }
}

function getSecretKey(env) {
    return env.get("GUEST_LOOKUP_SECRET") || env.get("PORTONE_API_SECRET") || "";
}

function hashSecret(secret, env) {
    const key = getSecretKey(env);
    if (!key || !secret) return "";
    return $security.hs256(String(secret), key);
}

function generateToken() {
    try {
        if ($security.randomString) {
            return $security.randomString(32);
        }
    } catch (err) {}

    const entropy = String(Date.now()) + "." + String(Math.random()) + "." + String(Math.random());
    return $security.hs256(entropy, "guest-token").substring(0, 32);
}

function createGuestInfo(data, env) {
    const password = String(data.password || "").trim();
    if (!password) {
        return {
            ok: false,
            error: "비회원 주문 비밀번호를 입력해 주세요."
        };
    }

    if (!getSecretKey(env)) {
        return {
            ok: false,
            error: "GUEST_LOOKUP_SECRET 또는 PORTONE_API_SECRET 환경 변수가 필요합니다."
        };
    }

    const cleanupNonce = generateToken();
    const guestInfo = {
        name: data.name || "",
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
        password_hash: hashSecret(password, env),
        checkout_cleanup_hash: hashSecret(cleanupNonce, env)
    };

    return {
        ok: true,
        guestInfo: guestInfo,
        cleanupNonce: cleanupNonce
    };
}

function verifyGuestPassword(guestInfo, password, env) {
    if (!guestInfo || !password || !guestInfo.password_hash) return false;
    return constantTimeEqual(guestInfo.password_hash, hashSecret(password, env));
}

function verifyCleanupNonce(guestInfo, cleanupNonce, env) {
    if (!guestInfo || !cleanupNonce || !guestInfo.checkout_cleanup_hash) return false;
    return constantTimeEqual(guestInfo.checkout_cleanup_hash, hashSecret(cleanupNonce, env));
}

module.exports = {
    createGuestInfo: createGuestInfo,
    parseGuestInfo: parseGuestInfo,
    verifyCleanupNonce: verifyCleanupNonce,
    verifyGuestPassword: verifyGuestPassword
};
