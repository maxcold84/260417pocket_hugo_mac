console.log("test-debug.pb.js is loading!");
routerAdd("GET", "/test-shell", (c) => {
    const text = $os.readFile(`${__hooks}/../pb_public/_shell.html`);
    return c.html(200, String.fromCharCode.apply(null, text));
});

routerAdd("GET", "/test-partial", (c) => {
    const text = $template.loadFiles(`${__hooks}/views/checkout.html`).render({});
    return c.html(200, text);
});
