const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PORT } = require('./src/server/config/constants');
const { setupSocketHandlers } = require('./src/server/handlers/socketHandlers');

/**
 * @typedef {import('socket.io').Server} SocketServer
 * @typedef {import('socket.io').Socket} Socket
 */

const app = express();
const server = http.createServer(app);
/** @type {SocketServer} */
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`Werewolves server running on http://localhost:${PORT}`);
});

io.on('connection', /** @param {Socket} socket */ (socket) => {
  console.log('client connected', socket.id);
  setupSocketHandlers(io, socket);
});
