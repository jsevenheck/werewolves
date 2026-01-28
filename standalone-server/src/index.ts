/**
 * Standalone server entry point.
 *
 * Boots Express + Socket.IO on a dedicated HTTP server, then attaches
 * the Werewolf game namespace via registerWerewolf(io).
 *
 * This is a THIN wrapper that reuses the embedded server module.
 *
 * Usage:  tsx standalone-server/src/index.ts
 */
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { registerWerewolf } from '../../server/src/index';

const PORT = process.env.PORT ?? 3001;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Register the Werewolf game namespace (/g/werewolf).
// In embedded mode the hub would call this; in standalone we call it ourselves.
registerWerewolf(io);

// For standalone convenience, also expose a "legacy" root namespace that
// redirects or mirrors the game namespace. This lets existing clients that
// connect to "/" still work during the migration period.
// Comment out if not needed.
io.on('connection', (socket) => {
  // Redirect legacy clients: tell them to reconnect to the namespace.
  // For now we simply handle them at the namespace level too.
  // The namespace handler won't pick these up automatically, so we can
  // either ignore or manually re-emit. For simplicity, ignore legacy root.
  socket.emit('error', { message: 'Please connect to /g/werewolf namespace' });
  socket.disconnect(true);
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

// SPA fallback
app.get('*', (_, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`[standalone-server] Werewolf server listening on port ${PORT}`);
  console.log(`[standalone-server] Game namespace: /g/werewolf`);
  console.log(`[standalone-server] Serving static files from: ${staticDir}`);
});
