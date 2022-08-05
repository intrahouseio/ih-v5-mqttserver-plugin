/*
 * Mqtt server V5
 */

const util = require('util');

const plugin = require('ih-plugin-api')();
const app = require('./app');

(async () => {
  plugin.log('Mqtt client has started.', 0);

  try {
    // Получить параметры брокера
    plugin.params = await plugin.params.get();
    plugin.log('Received params ' + util.inspect(plugin.params));
    app(plugin);
  } catch (err) {
    plugin.exit(8, `Error: ${util.inspect(err)}`);
  }
})();
