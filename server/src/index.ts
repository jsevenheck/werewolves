import type { Server } from 'socket.io';
import { setupSocketHandlers } from './handlers/socketHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';
import type { Role } from '../../core/src/types';

export interface GameDefinition {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  roles?: Role[];
}

export const definition: GameDefinition = {
  id: 'werewolves',
  name: 'Werewolves',
  minPlayers: 5,
  maxPlayers: 20,
  roles: [
    'werewolf',
    'seer',
    'hunter',
    'witch',
    'armor',
    'joker',
    'guard',
    'harlot',
    'villager'
  ],
};

/**
 * Register the Werewolves game as a Socket.IO namespace plugin.
 *
 * When embedded in the game-hub platform, the hub server calls this function
 * once at startup.  It attaches all game event handlers to the
 * `/g/werewolves` namespace so they share the same underlying HTTP server /
 * Socket.IO instance as every other game.
 *
 * Clients connect with:
 *   io("/g/werewolves", { auth: { token, joinToken, sessionId, playerId } })
 */
export function registerWerewolf(io: Server, namespace = '/g/werewolves') {
  const nsp = io.of(namespace);

  // Namespace-level middleware: validate auth data from the handshake.
  nsp.use((socket, next) => {
    const { joinToken, token, sessionId, playerId } = socket.handshake.auth as {
      joinToken?: string;
      token?: string;
      sessionId?: string;
      playerId?: string;
    };
    const normalizedToken = joinToken ?? token ?? null;

    // Store auth data on socket.data so handlers can access it.
    socket.data.sessionId = sessionId ?? null;
    socket.data.joinToken = normalizedToken;
    socket.data.playerId = playerId ?? null;

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

export function register(io: Server, namespace = '/g/werewolves') {
  return registerWerewolf(io, namespace);
}

export const handler = { definition, register };

// Re-export types & helpers that the hub or tests may need.
export { setupSocketHandlers } from './handlers/socketHandlers';
export type { ClientToServerEvents, ServerToClientEvents } from '../../core/src/events';
