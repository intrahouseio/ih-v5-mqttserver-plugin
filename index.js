/*
 * Mqtt server V5
 */

const util = require('util');

// const plugin = require('ih-plugin-api')();
const app = require('./app');

(async () => {
 let plugin;
  try {
    const opt = getOptFromArgs();
    const pluginapi = opt && opt.pluginapi ? opt.pluginapi : 'ih-plugin-api';
    plugin = require(pluginapi+'/index.js')();
    
    plugin.log('Mqtt client has started.', 0);

    // Получить параметры брокера
    plugin.params = await plugin.params.get();
    plugin.log('Received params ' + util.inspect(plugin.params));
    app(plugin);
  } catch (err) {
    plugin.exit(8, `Error: ${util.inspect(err)}`);
  }
})();


function getOptFromArgs() {
  let opt;
  try {
    opt = JSON.parse(process.argv[2]); //
  } catch (e) {
    opt = {};
  }
  return opt;
}
