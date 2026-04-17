module.exports = function(layout, contentSlot) {
    return layout.replace("{{slot}}", contentSlot);
};
