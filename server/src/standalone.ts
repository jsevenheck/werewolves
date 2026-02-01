/**
 * Standalone server entry point (LEGACY).
 *
 * This file is kept for backward compatibility with existing scripts.
 * It now delegates to the standalone-server wrapper which uses the
 * embedded registerWerewolf(io) function.
 *
 * For new deployments, prefer using standalone-server/src/index.ts directly.
 *
 * Usage:  tsx server/src/standalone.ts
 */
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { PORT } from './config/constants';
import { registerWerewolf } from './index';
import { setupSocketHandlers } from './handlers/socketHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Register the Werewolf game namespace (/g/werewolf) for hub-style embedding.
registerWerewolf(io);

// ALSO register handlers on root namespace for standalone dev mode.
// This ensures backward compatibility with ui-vue dev server which
// connects without a namespace prefix.
const rootNsp = io.of('/');
rootNsp.on('connection', (socket) => {
  setupSocketHandlers(
    rootNsp as unknown as import('socket.io').Namespace<ClientToServerEvents, ServerToClientEvents>,
    socket as unknown as import('socket.io').Socket<ClientToServerEvents, ServerToClientEvents>,
  );
});

// Serve built client assets (production) or fall back to ui-vue dir (dev).
const builtClientDir = path.join(__dirname, '..', '..', 'dist', 'client');
const devClientDir = path.join(process.cwd(), 'ui-vue');
const standaloneWebDist = path.join(process.cwd(), 'standalone-web', 'dist');

let staticDir: string;
if (fs.existsSync(builtClientDir)) {
  staticDir = builtClientDir;
} else if (fs.existsSync(standaloneWebDist)) {
  staticDir = standaloneWebDist;
} else {
  staticDir = devClientDir;
}

app.use(express.static(staticDir));
app.get('/health', (_, res) => res.json({ ok: true }));

// SPA fallback (Express 5 requires named wildcard)
app.get('/{*splat}', (req, res, next) => {
  // Skip socket.io paths
  if (req.path.startsWith('/socket.io')) return next();
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

server.listen(PORT, () => {
  console.log(`[standalone] Werewolf server listening on port ${PORT}`);
  console.log(`[standalone] Game namespace: /g/werewolf`);
});
