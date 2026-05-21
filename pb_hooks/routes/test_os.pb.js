routerAdd("GET", "/api/debug/test-add-cat", (c) => {
    try {
        const tomlBytes = $os.readFile("hugo/hugo.toml");
        const tomlBinaryStr = Array.from(tomlBytes).map(b => String.fromCharCode(b)).join('');
        const tomlStr = decodeURIComponent(escape(tomlBinaryStr));
        
        return c.json(200, { success: true, tomlLength: tomlStr.length });
    } catch (e) {
        return c.json(500, { error: e.toString(), stack: e.stack });
    }
});
