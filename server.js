try {
  module.exports = require('./dist/server.js');
} catch (_error) {
  require('ts-node/register');
  module.exports = require('./server.ts');
}
