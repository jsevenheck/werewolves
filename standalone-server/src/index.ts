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
import * as werewolfServer from '../../server/src/index';
import { resolveStandaloneStaticDir } from './staticDir';

const PORT = process.env.PORT ?? 3001;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Register the Werewolves game namespace (/g/werewolves).
// In embedded mode the hub would call this; in standalone we call it ourselves.
const registerWerewolf =
  (werewolfServer as { registerWerewolf?: typeof werewolfServer.registerWerewolf })
    .registerWerewolf ??
  (werewolfServer as { default?: { registerWerewolf?: typeof werewolfServer.registerWerewolf } })
    .default?.registerWerewolf;

if (!registerWerewolf) {
  throw new Error('registerWerewolf export not found in server module.');
}

registerWerewolf(io);

// Serve audio assets from ui-vue for both standalone and embedded builds.
const sharedAudioDir = path.join(process.cwd(), 'ui-vue', 'public', 'audio');
if (fs.existsSync(sharedAudioDir)) {
  app.use('/audio', express.static(sharedAudioDir));
}

// Serve built client assets (production) or fall back to ui-vue dir (dev).
const { standaloneWebDist, staticDir } = resolveStandaloneStaticDir({
  rootDir: process.cwd(),
  existsSync: fs.existsSync,
});

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
    res.status(404).send('Not Found');
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[standalone-server] Port ${PORT} is already in use.`);
  } else {
    console.error(`[standalone-server] Server error:`, err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[standalone-server] Werewolves server listening on port ${PORT}`);
  console.log(`[standalone-server] Game namespace: /g/werewolves`);
  if (staticDir === standaloneWebDist) {
    console.log('[standalone-server] Mode: standalone-web preferred');
  }
  console.log(`[standalone-server] Serving static files from: ${staticDir}`);
});

function shutdown(signal: string) {
  console.log(`[standalone-server] ${signal} received, shutting down...`);
  io.close(() => {
    server.close(() => {
      console.log('[standalone-server] Shutdown complete.');
      process.exit(0);
    });
  });
  // Force exit after timeout
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
