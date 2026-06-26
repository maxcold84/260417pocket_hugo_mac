let envCache = null;

function getEnvFileCandidates() {
    const candidates = [".env"];
    try {
        if (typeof __hooks !== "undefined" && __hooks) {
            candidates.push(String(__hooks) + "/../.env");
        }
    } catch (e) {}
    return candidates;
}

function loadEnv() {
    if (envCache) return envCache;
    const env = {};
    const candidates = getEnvFileCandidates();
    let loaded = false;
    let lastError = null;

    for (let c = 0; c < candidates.length; c++) {
        try {
            const bytes = $os.readFile(candidates[c]);
            const binaryStr = Array.from(bytes).map(function(b) { return String.fromCharCode(b); }).join('');
            const content = decodeURIComponent(escape(binaryStr)).replace(/^\uFEFF/, "");
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('#')) continue;
                const index = line.indexOf('=');
                if (index > 0) {
                    const key = line.substring(0, index).trim();
                    const rawValue = line.substring(index + 1).trim();
                    // Strip surrounding single/double quotes if they exist.
                    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
                        env[key] = rawValue.substring(1, rawValue.length - 1);
                    } else {
                        env[key] = rawValue;
                    }
                }
            }
            loaded = true;
            break;
        } catch (e) {
            lastError = e;
        }
    }

    if (!loaded && lastError) {
        console.warn("[env] Failed to load .env file: " + lastError.toString());
    }
    envCache = env;
    return env;
}

function get(key) {
    let val = "";
    try {
        val = $os.getenv(key);
    } catch (e) {}
    
    if (!val) {
        const env = loadEnv();
        val = env[key] || "";
    }
    return val;
}

function getAny(keys) {
    for (let i = 0; i < keys.length; i++) {
        const value = get(keys[i]);
        if (value) return value;
    }
    return "";
}

module.exports = {
    get: get,
    getAny: getAny
};
