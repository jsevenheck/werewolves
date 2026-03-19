/**
 * Standalone server entry point.
 *
 * Boots Express + Socket.IO on a dedicated HTTP server and attaches
 * the Werewolves game namespace at `/g/werewolves`.
 *
 * Usage:  tsx server/src/index.ts
 */
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import type { Namespace, Socket } from 'socket.io';
import { setupSocketHandlers } from './handlers/socketHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';

// ---------------------------------------------------------------------------
// Namespace setup (exported for tests)
// ---------------------------------------------------------------------------

export function registerNamespace(io: Server, namespace = '/g/werewolves') {
  const nsp = io.of(namespace);

  nsp.use((socket, next) => {
    const { joinToken, token, sessionId, playerId } = socket.handshake.auth as {
      joinToken?: string;
      token?: string;
      sessionId?: string;
      playerId?: string;
    };
    const normalizedToken = joinToken ?? token ?? null;

    socket.data.sessionId = sessionId ?? null;
    socket.data.joinToken = normalizedToken;
    socket.data.playerId = playerId ?? null;

    next();
  });

  nsp.on('connection', (socket) => {
    setupSocketHandlers(
      nsp as unknown as Namespace<ClientToServerEvents, ServerToClientEvents>,
      socket as unknown as Socket<ClientToServerEvents, ServerToClientEvents>
    );

    if (socket.data.sessionId) {
      socket.join(socket.data.sessionId);
    }
  });

  return nsp;
}

// ---------------------------------------------------------------------------
// Static file resolution
// ---------------------------------------------------------------------------

function resolveStaticDir(rootDir: string): { staticDir: string } {
  const builtClientDir = path.join(rootDir, 'dist', 'client');
  if (fs.existsSync(builtClientDir)) {
    return { staticDir: builtClientDir };
  }
  return { staticDir: path.join(rootDir, 'ui-vue') };
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

const PORT = process.env.PORT ?? 3001;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
});

registerNamespace(io);

// Serve audio assets from the ui-vue public directory.
const sharedAudioDir = path.join(process.cwd(), 'ui-vue', 'public', 'audio');
if (fs.existsSync(sharedAudioDir)) {
  app.use('/audio', express.static(sharedAudioDir));
}

const { staticDir } = resolveStaticDir(process.cwd());

app.use(express.static(staticDir));
app.get('/health', (_, res) => res.json({ ok: true }));

// SPA fallback (Express 5 requires named wildcard)
app.get('/{*splat}', (req, res, next) => {
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
    console.error(`[server] Port ${PORT} is already in use.`);
  } else {
    console.error(`[server] Server error:`, err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[server] Werewolves server listening on port ${PORT}`);
  console.log(`[server] Game namespace: /g/werewolves`);
  console.log(`[server] Serving static files from: ${staticDir}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string) {
  console.log(`[server] ${signal} received, shutting down...`);
  io.close(() => {
    server.close(() => {
      console.log('[server] Shutdown complete.');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Re-exports for tests
// ---------------------------------------------------------------------------

export { setupSocketHandlers } from './handlers/socketHandlers';
export type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';
