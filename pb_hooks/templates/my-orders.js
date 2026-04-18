module.exports = function(c) {
    return `
    <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-light mb-8 border-b border-bmw-border pb-4">YOUR ORDERS</h1>
        <div class="bg-bmw-surface border border-bmw-border p-6 rounded-sm">
            <p class="text-gray-400">You have no recent orders.</p>
            <!-- In a real implementation this would list orders related to the user from Pocketbase -->
        </div>
    </div>
    `;
};
