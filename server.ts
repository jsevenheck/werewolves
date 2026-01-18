import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { PORT } from './src/server/config/constants';
import { setupSocketHandlers } from './src/server/handlers/socketHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from './src/shared/events';

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*'
  }
});

const builtClientDir = path.join(__dirname, 'client');
const devClientDir = path.join(process.cwd(), 'client');
const staticDir = fs.existsSync(builtClientDir) ? builtClientDir : devClientDir;

app.use(express.static(staticDir));
app.get('/health', (_, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`Werewolves server running on http://localhost:${PORT}`);
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
  setupSocketHandlers(io, socket);
});
