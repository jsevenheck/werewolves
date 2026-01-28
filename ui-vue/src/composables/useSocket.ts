import { io, type Socket } from 'socket.io-client';
import { onBeforeUnmount } from 'vue';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket(config: { url?: string; path?: string; auth?: Record<string, string> }): TypedSocket {
  const socket: TypedSocket = io(config.url || '', {
    path: config.path || '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    ...(config.auth ? { auth: config.auth } : {})
  });

  onBeforeUnmount(() => {
    socket.disconnect();
  });

  return socket;
}
