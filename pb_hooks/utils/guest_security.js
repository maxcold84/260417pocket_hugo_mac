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

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
    return String(value || "").replace(/[^0-9]/g, "");
}

function normalizeLookupIdentifier(value) {
    const raw = String(value || "").trim();
    const isEmail = raw.indexOf("@") !== -1;
    const email = isEmail ? normalizeEmail(raw) : "";
    const phone = isEmail ? "" : normalizePhone(raw);

    return {
        raw: raw,
        email: email,
        phone: phone
    };
}

function isValidGuestIdentifier(value) {
    const identifier = normalizeLookupIdentifier(value);
    return !!identifier.email || identifier.phone.length >= 8;
}

function matchesGuestIdentifier(guestInfo, value) {
    if (!guestInfo || !isValidGuestIdentifier(value)) return false;

    const identifier = normalizeLookupIdentifier(value);
    const guestEmail = normalizeEmail(guestInfo.email_lookup || guestInfo.email || "");
    const guestPhone = normalizePhone(guestInfo.phone_lookup || guestInfo.phone || "");

    if (identifier.email && guestEmail && identifier.email === guestEmail) return true;
    if (identifier.phone && guestPhone && identifier.phone === guestPhone) return true;

    return false;
}

function getSecretKey(env) {
    return env.get("GUEST_LOOKUP_SECRET") || env.get("PORTONE_API_SECRET") || "";
}

function hashSecret(secret, env) {
    const key = getSecretKey(env);
    if (!key || !secret) return "";
    return $security.hs256(String(secret), key);
}

function createCleanupNonce(env) {
    if (!getSecretKey(env)) {
        return {
            ok: false,
            error: "GUEST_LOOKUP_SECRET 또는 PORTONE_API_SECRET 환경 변수가 필요합니다."
        };
    }

    const cleanupNonce = generateToken();
    return {
        ok: true,
        cleanupNonce: cleanupNonce,
        cleanupHash: hashSecret(cleanupNonce, env)
    };
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

    const cleanupResult = createCleanupNonce(env);
    if (!cleanupResult.ok) return cleanupResult;

    const guestInfo = {
        name: data.name || "",
        phone: data.phone || "",
        email: data.email || "",
        phone_lookup: normalizePhone(data.phone || ""),
        email_lookup: normalizeEmail(data.email || ""),
        address: data.address || "",
        password_hash: hashSecret(password, env),
        checkout_cleanup_hash: cleanupResult.cleanupHash
    };

    return {
        ok: true,
        guestInfo: guestInfo,
        cleanupNonce: cleanupResult.cleanupNonce
    };
}

function verifyGuestPassword(guestInfo, password, env) {
    if (!guestInfo || !password || !guestInfo.password_hash) return false;
    const expectedHash = hashSecret(password, env);
    if (!expectedHash) return false;
    return constantTimeEqual(guestInfo.password_hash, expectedHash);
}

function upgradeLegacyGuestPassword(order, guestInfo, password, env, app) {
    if (!order || !guestInfo || !password || guestInfo.password_hash || !guestInfo.password) return false;
    if (!app || typeof app.save !== "function") return false;
    if (!constantTimeEqual(guestInfo.password, password)) return false;

    const passwordHash = hashSecret(password, env);
    if (!passwordHash) return false;

    const upgradedGuestInfo = {};
    const keys = Object.keys(guestInfo);
    for (const key of keys) {
        if (key === "password") continue;
        upgradedGuestInfo[key] = guestInfo[key];
    }

    upgradedGuestInfo.password_hash = passwordHash;
    if (!upgradedGuestInfo.phone_lookup && upgradedGuestInfo.phone) {
        upgradedGuestInfo.phone_lookup = normalizePhone(upgradedGuestInfo.phone);
    }
    if (!upgradedGuestInfo.email_lookup && upgradedGuestInfo.email) {
        upgradedGuestInfo.email_lookup = normalizeEmail(upgradedGuestInfo.email);
    }

    order.set("guest_info", upgradedGuestInfo);
    app.save(order);

    for (const key of keys) {
        delete guestInfo[key];
    }
    const upgradedKeys = Object.keys(upgradedGuestInfo);
    for (const key of upgradedKeys) {
        guestInfo[key] = upgradedGuestInfo[key];
    }

    return true;
}

function verifyGuestPasswordForOrder(order, guestInfo, password, env, app) {
    if (verifyGuestPassword(guestInfo, password, env)) return true;
    return upgradeLegacyGuestPassword(order, guestInfo, password, env, app);
}

function verifyCleanupNonce(guestInfo, cleanupNonce, env) {
    if (!guestInfo || !cleanupNonce || !guestInfo.checkout_cleanup_hash) return false;
    return constantTimeEqual(guestInfo.checkout_cleanup_hash, hashSecret(cleanupNonce, env));
}

module.exports = {
    createCleanupNonce: createCleanupNonce,
    createGuestInfo: createGuestInfo,
    isValidGuestIdentifier: isValidGuestIdentifier,
    matchesGuestIdentifier: matchesGuestIdentifier,
    normalizeLookupIdentifier: normalizeLookupIdentifier,
    parseGuestInfo: parseGuestInfo,
    verifyCleanupNonce: verifyCleanupNonce,
    verifyGuestPassword: verifyGuestPassword,
    verifyGuestPasswordForOrder: verifyGuestPasswordForOrder
};
