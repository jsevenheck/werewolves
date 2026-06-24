/**
 * Admin socket composable.
 *
 * Mirrors `useSocket.ts` but tags the Socket.IO handshake with the
 * `adminToken` field. The server's namespace middleware
 * (`server/src/index.ts`) compares this against
 * `process.env.WEREWOLVES_ADMIN_TOKEN` and stamps
 * `socket.data.adminToken = true` on success.
 *
 * Admin sockets:
 *   - never become players (`socket.data.playerId` stays unset),
 *   - can only call admin events (the server rejects everything else with
 *     `server.errors.adminRequired` for that socket — although for stage 2
 *     the only callers from this composable are admin events anyway),
 *   - receive `roomUpdate` only for the room they have explicitly joined
 *     via `adminJoinRoom`.
 *
 * No Vue Router: the admin page is gated by `?admin=1` and rendered from
 * `App.vue` as an alternative root, so the admin socket never coexists with
 * the player socket on the same App instance.
 */
import { io } from 'socket.io-client';
import { onBeforeUnmount } from 'vue';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { Socket } from 'socket.io-client';

export type AdminSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useAdminSocket(config: {
  url?: string;
  path?: string;
  adminToken: string;
}): AdminSocket {
  const socket: AdminSocket = io(config.url || '', {
    path: config.path || '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: false,
    auth: { adminToken: config.adminToken },
  });

  onBeforeUnmount(() => {
    socket.disconnect();
  });

  return socket;
}
