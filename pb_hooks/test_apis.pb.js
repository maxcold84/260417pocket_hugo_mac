routerAdd("GET", "/api/test-apis", (e) => {
    return e.json(200, { keys: Object.keys($apis) });
});
