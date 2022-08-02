/**
 * app.js
 * Wraps a client connection to an MQTT broker
 */

const util = require('util');
const aedes = require('aedes')()
const server = require('net').createServer(aedes.handle)


module.exports = function(plugin) {
  const params = plugin.params;
  
  if (params.mqtt) {
    server.listen(parseInt(params.portmqtt), function () {
      console.log('server listening on port', params.portmqtt)
    })
  }
  
  if (params.mqttws) {
    const httpServer = require('http').createServer();
    const ws = require('websocket-stream');

    ws.createServer({
      server: httpServer
    }, aedes.handle)
    
    httpServer.listen(parseInt(params.portmqttws), function () {
      console.log('websocket server listening on port', params.portmqttws)
    })
  } 
  
  if (params.mqtts) {
    const fs = require('fs');
    const options = {
      key: fs.readFileSync('YOUR_PRIVATE_KEY_FILE.pem'),
      cert: fs.readFileSync('YOUR_PUBLIC_CERT_FILE.pem')
    }
    
    const servertls = require('tls').createServer(options, aedes.handle)
    
    servertls.listen(parseInt(params.portmqtts), function () {
      console.log('server tls started and listening on port ', params.portmqtts)
    })
  }
  

  aedes.on('clientError', function (client, err) {
    console.log('client error', client.id, err.message, err.stack)
  })
  
  aedes.on('connectionError', function (client, err) {
    console.log('client error', client, err.message, err.stack)
  })
  
  aedes.on('publish', function (packet, client) {
    if (client) {
      console.log('message from client', client.id)
    }
  })
  
  aedes.on('subscribe', function (subscriptions, client) {
    if (client) {
      console.log('subscribe from client', subscriptions, client.id)
    }
  })
  
  aedes.on('client', function (client) {
    console.log('new client', client.id)
  })
};
