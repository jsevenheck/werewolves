import type { Server } from 'socket.io';
import { setupSocketHandlers } from './handlers/socketHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';

/**
 * Register the Werewolf game as a Socket.IO namespace plugin.
 *
 * When embedded in the game-hub platform, the hub server calls this function
 * once at startup.  It attaches all game event handlers to the
 * `/g/werewolf` namespace so they share the same underlying HTTP server /
 * Socket.IO instance as every other game.
 *
 * Clients connect with:
 *   io("/g/werewolf", { auth: { joinToken, sessionId } })
 */
export function registerWerewolf(io: Server) {
  const nsp = io.of('/g/werewolf');

  // Namespace-level middleware: validate auth data from the handshake.
  nsp.use((socket, next) => {
    const { joinToken, sessionId } = socket.handshake.auth as {
      joinToken?: string;
      sessionId?: string;
    };

    // Store auth data on socket.data so handlers can access it.
    socket.data.sessionId = sessionId ?? null;
    socket.data.joinToken = joinToken ?? null;

    // Accept all connections for now; room-level auth is enforced
    // inside the event handlers (resumePlayer verifies the token).
    next();
  });

  nsp.on('connection', (socket) => {
    setupSocketHandlers(
      nsp as unknown as import('socket.io').Namespace<ClientToServerEvents, ServerToClientEvents>,
      socket as unknown as import('socket.io').Socket<ClientToServerEvents, ServerToClientEvents>,
    );

    // Auto-join a Socket.IO room matching the sessionId so broadcasts
    // can be scoped per game session in the future.
    if (socket.data.sessionId) {
      socket.join(socket.data.sessionId);
    }
  });

  return nsp;
}

// Re-export types & helpers that the hub or tests may need.
export { setupSocketHandlers } from './handlers/socketHandlers';
export type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';
