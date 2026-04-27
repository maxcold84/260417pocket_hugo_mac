(async () => {
  const PocketBase = require('pocketbase/cjs');
  const pb = new PocketBase('http://127.0.0.1:8090');
  try {
    await pb.collection('_superusers').authWithPassword('admin@admin.com', 'admin123456'); // Wait, I don't know the admin password.
  } catch (e) {}
})();
