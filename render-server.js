/**
 * Render entry point — loads the esbuild bundle and starts listening.
 * Firebase Functions wraps the same bundle via functions/index.js.
 */
'use strict';

process.env.NODE_ENV = 'production';

const { app } = require('./functions/api-bundle.cjs');
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`[render] API listening on port ${PORT}`);
});
