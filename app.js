const util = require('util');
const fs = require('fs').promises;
const NedbPersistence = require('aedes-persistence-nedb');
const aedes = require('aedes')({ persistence: new NedbPersistence() });

module.exports = async function (plugin) {
  const params = plugin.params;
  // Хранилище пользователей
  let users = [];
  plugin.log('params ' + util.inspect(params))
  // Функция для загрузки пользователей из вкладки "Расширения"
  async function loadUsers() {
    try {
      if (params.use_password) {
        users.push({
          username: params.username,
          password: params.password,
          readTopics: ['#', '$SYS/#'],
          writeTopics: ['#']
        })
      }
      const extraData = await plugin.extra.get();
      extraData.forEach(user => {
        users.push({
          username: user.username,
          password: user.password,
          readTopics: user.readTopics ? user.readTopics.split(',').map(t => t.trim()) : [],
          writeTopics: user.writeTopics ? user.writeTopics.split(',').map(t => t.trim()) : []
        });
      });
      plugin.log(`Loaded ${users.length} users`, 2);
      plugin.send({ type: 'procinfo', data: { activeUsers: users.length } });
    } catch (err) {
      plugin.log(`Failed to load users: ${err.message}`, 2);
    }
  }

  // Инициализация пользователей
  await loadUsers();
  //plugin.log("Users: " + util.inspect(users))
  // Обработка изменений в расширениях
  plugin.onChange('extra', async (data) => {
    plugin.log('Users configuration changed', 2);
    await loadUsers();
  });

  // Отправка информации о сервере
  plugin.send({ type: 'procinfo', data: { serverId: aedes.id } });

  // Аутентификация
  if (users.length > 0) {
    aedes.authenticate = (client, username, password, callback) => {
      try {
        if (!username || !password) {
          const error = new Error('Missing credentials');
          error.returnCode = 4;
          return callback(error, null);
        }
        plugin.log('username ' + username + ' password ' + password, 2);
        const user = users.find(u => u.username === username);
        if (user && password.toString('utf-8') === user.password) {
          client.username = username;
          plugin.log(`${client.id} authenticated successfully as ${username}`, 2);
          callback(null, true);
        } else {
          const error = new Error('Auth error');
          error.returnCode = 4;
          plugin.log(`${client.id} authentication failed for ${username}`, 2);
          callback(error, null);
        }
      } catch (err) {
        plugin.log(`Authentication error for ${client.id}: ${err.message}`, 2);
        callback(err, null);
      }
    };

    // Авторизация публикации
    aedes.authorizePublish = (client, packet, callback) => {
      plugin.log(`Checking publish for ${util.inspect(client.id)} (username: ${client?.username}) on topic ${packet.topic}`, 2);
      const user = users.find(u => u.username === client?.username);
      if (!user) {
        const error = new Error('Unauthorized publish');
        error.returnCode = 5;
        plugin.log(`Publish denied for ${client.id} on topic ${packet.topic}`, 2);
        return callback(error);
      }
      const isAllowed = user.writeTopics.some(topic =>
        topic === packet.topic || new RegExp('^' + topic.replace(/\+/g, '[^/]+').replace(/#/g, '.*') + '$').test(packet.topic)
      );
      if (isAllowed) {
        plugin.log(`${client.id} allowed to publish to ${packet.topic}`, 2);
        callback(null);
      } else {
        const error = new Error('Unauthorized publish');
        error.returnCode = 5;
        plugin.log(`Publish denied for ${client.id} on topic ${packet.topic}`, 2);
        callback(error);
      }
    };

    // Авторизация подписки
    aedes.authorizeSubscribe = (client, subscription, callback) => {
        plugin.log(`Checking subscribe for ${client?.id} (username: ${client?.username}) on topic ${subscription.topic}`, 2);

        if (!client?.username) {
          const error = new Error('Client not authenticated');
          error.returnCode = 5;
          return callback(error);
        }

        const user = users.find(u => u.username === client.username);
        if (!user) {
          const error = new Error('User not found');
          error.returnCode = 5;
          return callback(error);
        }

        // Если у пользователя нет readTopics - запрещаем всё
        if (!user.readTopics || !Array.isArray(user.readTopics)) {
          const error = new Error('No subscriptions allowed');
          error.returnCode = 5;
          return callback(error);
        }

        // Проверяем каждый паттерн из разрешённых
        const isAllowed = user.readTopics.some(topic =>
        topic === subscription.topic || new RegExp('^' + topic.replace(/\+/g, '[^/]+').replace(/#/g, '.*') + '$').test(subscription.topic)
      );
      if (isAllowed) {
        plugin.log(`${client.id} allowed to subscribe to ${subscription.topic}`, 2);
        callback(null, subscription);
      } else {
        const error = new Error('Unauthorized subscribe');
        error.returnCode = 5;
        plugin.log(`Subscribe denied for ${client.id} on topic ${subscription.topic}`, 2);
        callback(error);
      }
    };
  }


  // Запуск MQTT сервера
  try {
    if (params.mqtt) {
      const server = require('net').createServer(aedes.handle);
      server.listen(parseInt(params.portmqtt), (err) => {
        if (err) {
          plugin.log(`Failed to start MQTT server: ${err.message}`, 2);
          //plugin.exit(1, `MQTT server error: ${err.message}`);
          return;
        }
        plugin.log(`MQTT server listening on port ${params.portmqtt}`, 2);
      });

    }

    // Запуск WebSocket сервера
    if (params.mqttws) {
      const httpServer = require('http').createServer();
      const ws = require('websocket-stream');
      ws.createServer({ server: httpServer }, aedes.handle);
      httpServer.listen(parseInt(params.portmqttws), (err) => {
        if (err) {
          plugin.log(`Failed to start WebSocket server: ${err.message}`, 2);
          //plugin.exit(1, `WebSocket server error: ${err.message}`);
          return;
        }
        plugin.log(`WebSocket server listening on port ${params.portmqttws}`, 2);
      });
    }

    // Запуск MQTTS сервера
    if (params.mqtts) {
      try {
        const options = {
          key: await fs.readFile(params.key),
          cert: await fs.readFile(params.cert)
        };
        const servertls = require('tls').createServer(options, aedes.handle);
        servertls.listen(parseInt(params.portmqtts), (err) => {
          if (err) {
            plugin.log(`Failed to start MQTTS server: ${err.message}`, 2);
            //plugin.exit(1, `MQTTS server error: ${err.message}`);
            return;
          }
          plugin.log(`MQTTS server listening on port ${params.portmqtts}`, 2);
        });
      } catch (err) {
        plugin.log(`Failed to load TLS certificates: ${err.message}`, 2);
        //plugin.exit(1, `TLS certificate error: ${err.message}`);
      }
    }
  } catch (e) {
    console.log(e)
  }
  // Обработка событий
  aedes.on('clientError', (client, err) => {
    plugin.log(`Client error ${client.id}: ${err.message}`, 2);
  });

  aedes.on('connectionError', (client, err) => {
    plugin.log(`Connection error ${client.id}: ${err.message}`, 2);
  });

  aedes.on('publish', (packet, client) => {
    if (client && !packet.topic.startsWith('$SYS')) {
      plugin.log(`Message from ${client.id} on topic ${packet.topic}: ${util.inspect(packet)}`, 2);
    }
  });

  aedes.on('subscribe', (subscriptions, client) => {
    if (client) {
      plugin.log(`Subscribe from ${client.id}: ${util.inspect(subscriptions)}`, 2);
    }
  });

  aedes.on('client', (client) => {
    plugin.log(`New client connected: ${client.id}`, 2);
    plugin.send({
      type: 'procinfo',
      data: {
        connectedClients: aedes.connectedClients,
        clientsList: Object.keys(aedes.clients).join(', ')
      }
    });
  });

  aedes.on('clientDisconnect', (client) => {
    plugin.log(`Client disconnected: ${client.id}`, 2);
    plugin.send({
      type: 'procinfo',
      data: {
        connectedClients: aedes.connectedClients,
        clientsList: Object.keys(aedes.clients).join(', ')
      }
    });
  });

  // Обработка завершения работы
  plugin.onStop(async () => {
    plugin.log('Stopping MQTT broker', 2);
    await new Promise(resolve => aedes.close(resolve));
    plugin.exit(0, 'Plugin stopped');
  });
};