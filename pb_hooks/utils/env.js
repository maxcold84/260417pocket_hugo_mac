let envCache = null;

function loadEnv() {
    if (envCache) return envCache;
    const env = {};
    try {
        const bytes = $os.readFile(".env");
        const binaryStr = Array.from(bytes).map(function(b) { return String.fromCharCode(b); }).join('');
        const content = decodeURIComponent(escape(binaryStr));
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;
            const index = line.indexOf('=');
            if (index > 0) {
                const key = line.substring(0, index).trim();
                const value = line.substring(index + 1).trim();
                // Strip surrounding single/double quotes if they exist
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    env[key] = value.substring(1, value.length - 1);
                } else {
                    env[key] = value;
                }
            }
        }
    } catch (e) {
        console.warn("[env] Failed to load .env file: " + e.toString());
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

module.exports = {
    get: get
};
