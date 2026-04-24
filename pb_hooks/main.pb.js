// Entry point for PocketBase JSVM
// PocketBase only automatically loads .pb.js files in the root of pb_hooks.
// To organize into subdirectories, we must require them here.

require(`${__hooks}/routes/main.pb.js`);
require(`${__hooks}/routes/portone.pb.js`);
require(`${__hooks}/routes/test_os.pb.js`);
require(`${__hooks}/routes/admin.pb.js`);
