/**
 * app.js
 * MQTT broker
 */

const util = require('util');
const NedbPersistence = require('aedes-persistence-nedb');
const db = new NedbPersistence();
const aedes = require('aedes')({ persistence: db });
const server = require('net').createServer(aedes.handle);


module.exports = function(plugin) {
  const params = plugin.params;
  plugin.send({ type: 'procinfo', data: { serverId: aedes.id} });
  //plugin.log('aedes ' + util.inspect(aedes));
  if (params.use_password == 1) {
    aedes.authenticate = function (client, username, password, callback) {
      plugin.log('username ' + username + ' password ' + password, 2);
      if (password != undefined) {
        if (username == params.username && password.toString('utf-8') == params.password) {
          plugin.log(client.id+ ' authenticate OK', 2);
          callback(null, true);
        } else {
          const error = new Error('Auth error');
          error.returnCode = 4;
          callback(error, null);
        }
      }  
    }
  }
  

  if (params.mqtt) {
    server.listen(parseInt(params.portmqtt), function () {
      plugin.log('server listening on port ' + params.portmqtt, 2);
    })
  }
  
  if (params.mqttws) {
    const httpServer = require('http').createServer();
    const ws = require('websocket-stream');

    ws.createServer({
      server: httpServer
    }, aedes.handle)
    
    httpServer.listen(parseInt(params.portmqttws), function () {
      plugin.log('websocket server listening on port ' + params.portmqttws, 2);
    })
  } 
  
  if (params.mqtts) {
    const fs = require('fs');
    const options = {
      key: fs.readFileSync(params.key),
      cert: fs.readFileSync(params.cert)
    }
    
    const servertls = require('tls').createServer(options, aedes.handle);
    servertls.listen(parseInt(params.portmqtts), function () {
      plugin.log('server tls started and listening on port '+ params.portmqtts, 2);
    })
  }
  
  aedes.on('clientError', function (client, err) {
    plugin.log('client error '+ client.id + err.message+ err.stack, 2);
  })
  
  aedes.on('connectionError', function (client, err) {
    plugin.log('client error '+ client.id + err.message+ err.stack, 2);
  })
  
  aedes.on('publish', function (packet, client) {
    if (client) {
      plugin.log('message from client ' + client.id +' packet ' + util.inspect(packet), 2);
    }
  })
  
  aedes.on('subscribe', function (subscriptions, client) {
    if (client) {
      plugin.log('subscribe from client ' + util.inspect(subscriptions) + " " +  client.id, 2);
    }
  })
  
  aedes.on('client', function (client) {
    plugin.send({ type: 'procinfo', data: { connectedClients: aedes.connectedClients} });
    plugin.log('new client ' + client.id, 2);
    plugin.send({ type: 'procinfo', data: { clientsList: Object.keys(aedes.clients).join(', ')} });  
  })
};
