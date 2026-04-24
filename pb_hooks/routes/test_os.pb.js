routerAdd("GET", "/api/debug/os", (c) => {
    try {
        const cmd = $os.cmd("echo", "test");
        cmd.run();
        return c.json(200, { success: true });
    } catch (e) {
        return c.json(500, { error: e.toString() });
    }
});
