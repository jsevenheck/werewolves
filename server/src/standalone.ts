/**
 * Standalone server entry point.
 *
 * Boots Express + Socket.IO on a dedicated HTTP server.
 * Use this when running the Werewolf game independently (outside game-hub).
 *
 * Usage:  tsx server/src/standalone.ts
 */
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { PORT } from './config/constants';
import { setupSocketHandlers } from './handlers/socketHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*'
  }
});

// Serve built client assets (production) or fall back to ui-vue dir (dev).
const builtClientDir = path.join(__dirname, '..', '..', 'dist', 'client');
const devClientDir = path.join(process.cwd(), 'ui-vue');
const staticDir = fs.existsSync(builtClientDir) ? builtClientDir : devClientDir;

app.use(express.static(staticDir));
app.get('/health', (_, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  // Server started on PORT
});

// In standalone mode, use the default namespace (io.sockets).
const defaultNsp = io.sockets;
io.on('connection', (socket) => {
  setupSocketHandlers(defaultNsp, socket);
});
