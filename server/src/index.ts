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
import { setupAdminSocketHandlers } from './handlers/adminSocketHandlers';
import { getAdminTokenFromEnv, verifyAdminToken, attachAdminToSocket } from './utils/adminAuth';
import type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';

// ---------------------------------------------------------------------------
// Namespace setup (exported for tests)
// ---------------------------------------------------------------------------

export function registerNamespace(io: Server, namespace = '/g/werewolves') {
  const nsp = io.of(namespace);

  // Admin auth middleware: stamp `socket.data.adminToken` when a valid token
  // is presented in the handshake. Without a token, the socket is treated
  // as a regular (non-admin) client — players do not need to know the
  // admin token. Only when a token IS presented do we validate it; a
  // wrong token rejects the connection so the client can show the
  // token prompt and the user learns their token is wrong.
  nsp.use((socket, next) => {
    const configured = getAdminTokenFromEnv();
    if (!configured) {
      // Admin tooling disabled. Do not warn here — `registerNamespace` is
      // also called from tests; the helper warns once at process start.
      return next();
    }
    const provided = socket.handshake.auth?.adminToken;
    if (provided === undefined || provided === null || provided === '') {
      // No admin token provided — this is a regular player, accept.
      return next();
    }
    if (typeof provided === 'string' && verifyAdminToken(provided)) {
      attachAdminToSocket(socket);
      return next();
    }
    // A token was provided but it is wrong. Reject the connection so
    // the client receives `connect_error` and can route the user back
    // to the token prompt.
    return next(new Error('Admin token required'));
  });

  nsp.on('connection', (socket) => {
    setupSocketHandlers(
      nsp as unknown as Namespace<ClientToServerEvents, ServerToClientEvents>,
      socket as unknown as Socket<ClientToServerEvents, ServerToClientEvents>
    );
    setupAdminSocketHandlers(
      nsp as unknown as Namespace<ClientToServerEvents, ServerToClientEvents>,
      socket as unknown as Socket<ClientToServerEvents, ServerToClientEvents>
    );
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

// Load a local `.env` file if present (dev convenience). Node's built-in
// `process.loadEnvFile` does nothing in production where no `.env` ships
// (`.env` is in `.dockerignore` and `.gitignore`), so this is a no-op there.
try {
  process.loadEnvFile('.env');
} catch {
  // No `.env` present — ignore. (loadEnvFile throws if the file is missing.)
}

const PORT = process.env.PORT ?? 3001;

// Warn once at process start if admin endpoints are going to be disabled.
// (Tests deliberately run with no token — silence the warning there.)
if (!getAdminTokenFromEnv() && process.env.NODE_ENV !== 'test') {
  console.warn('[werewolves] WEREWOLVES_ADMIN_TOKEN is not set; admin endpoints are disabled');
}

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
export { setupAdminSocketHandlers } from './handlers/adminSocketHandlers';
export type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';
