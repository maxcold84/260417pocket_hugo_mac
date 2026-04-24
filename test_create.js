const pb = require('pocketbase/cjs');
const client = new pb('http://127.0.0.1:8090');

async function test() {
    try {
        await client.collection('_superusers').authWithPassword('admin@example.com', '1234567890'); // Wait, I don't know the password
    } catch(e) {}
}
test();
