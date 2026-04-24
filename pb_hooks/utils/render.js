module.exports = {
    render: (e, partialHtml, meta = {}) => {
        if (e.isHtmx) {
            return e.html(200, partialHtml);
        }
        
        try {
            const page = $template.loadFiles(`${__hooks}/../pb_public/_shell.html`).render({
                title: meta.title || "BMW Shop",
                content: partialHtml
            });
            return e.html(200, page);
        } catch(err) {
            console.error("Template render error:", err);
            return e.json(500, { error: err.toString() });
        }
    }
};
