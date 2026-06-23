routerAdd("GET", "/api/debug/test-add-cat", (c) => {
    try {
        const cmd = $os.cmd("sh", "-c", "TEST_VAR=hello_env env > test_env.txt");
        cmd.run();
        
        const bytes = $os.readFile("test_env.txt");
        const binaryStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
        const content = decodeURIComponent(escape(binaryStr));
        
        // Clean up
        try { $os.remove("test_env.txt"); } catch(e) {}
        
        const hasTestVar = content.indexOf("TEST_VAR=hello_env") !== -1;
        
        return c.json(200, { 
            success: true, 
            hasTestVar: hasTestVar,
            envOutput: content.split("\n").filter(l => l.indexOf("TEST_VAR") !== -1 || l.indexOf("PATH") !== -1)
        });
    } catch (e) {
        return c.json(500, { error: e.toString(), stack: e.stack });
    }
});
