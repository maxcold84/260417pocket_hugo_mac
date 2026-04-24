routerAdd("GET", "/api/debug/os", (c) => {
    return c.json(200, { keys: Object.keys($os) });
});
