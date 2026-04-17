routerAdd("GET", "/test_expansion", (e) => {
    try {
        let items = $app.findRecordsByFilter("cart_items", "1=1", "", 1, 0);
        $app.expandRecords(items, ["product"], null);
        let out = items.map(i => {
            let p = null;
            let error = "";
            try { p = i.expandedOne("product"); } catch(err) { error = "expandedOne failed: " + err.toString(); }
            
            if (!p) {
                try { p = i.ExpandedOne("product"); } catch(err) { error += " | ExpandedOne failed: " + err.toString(); }
            }

            return {
                base_id: i.id,
                error: error,
                p_id: p ? p.id : null
            };
        });
        return e.json(200, out);
    } catch(err) {
        return e.json(500, { error: err.toString() });
    }
});
