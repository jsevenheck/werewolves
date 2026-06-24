/**
 * Lazy admin-socket helper for host mid-game kicks.
 *
 * The `hostMidGameKickPlayer` event is admin-gated: the server checks
 * `socket.data.adminToken` before honouring it. A regular host socket does
 * NOT present an admin token, so the first mid-game kick has to spin up a
 * secondary socket tagged with `auth.adminToken` and use it for the
 * elevated emit.
 *
 * Why not reuse `useAdminSocket`? That composable calls Vue's
 * `onBeforeUnmount`, which would warn/fail when invoked outside a component
 * setup context. Here we manage the socket's lifecycle explicitly via
 * `dispose()`.
 */
import { ref, onBeforeUnmount } from 'vue';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { OkResponse, ErrorResponse } from '@shared/events';

export type AdminSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ADMIN_TOKEN_STORAGE_KEY = 'werewolves_admin_token';

export type HostKickResult =
  | { kind: 'ok' }
  | { kind: 'no_token' }
  | { kind: 'invalid_token'; message: string }
  | { kind: 'server_error'; message: string };

function readStoredToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function useHostAdminKick() {
  const socket = ref<AdminSocket | null>(null);
  let connectPromise: Promise<AdminSocket> | null = null;

  function ensureAdminSocket(): Promise<AdminSocket> {
    const existing = socket.value;
    if (existing && existing.connected) {
      // `socket.value` is typed as the wider `readonly` socket.io type
      // because we assigned the raw `io()` return to it. Narrow it here
      // so the public Promise<AdminSocket> contract is preserved.
      return Promise.resolve<AdminSocket>(existing as unknown as AdminSocket);
    }

    if (existing) {
      existing.disconnect();
      socket.value = null;
    }

    if (connectPromise) {
      return connectPromise;
    }

    const token = readStoredToken();
    if (!token) {
      return Promise.reject<AdminSocket>(
        Object.assign(new Error('no_token'), { code: 'no_token' as const })
      );
    }

    connectPromise = new Promise<AdminSocket>((resolve, reject) => {
      // Bypass `useAdminSocket` so we can manage the lifecycle ourselves —
      // `useAdminSocket` registers a Vue `onBeforeUnmount` that would not
      // exist outside a component setup context. The double cast
      // (`as unknown as AdminSocket`) is required because `io()` returns a
      // wider `readonly` type than our `AdminSocket` alias.
      const next = io('/g/werewolves', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: false,
        auth: { adminToken: token },
      }) as unknown as AdminSocket;

      const onConnect = () => {
        next.off('connect_error', onConnectError);
        connectPromise = null;
        resolve(next);
      };
      const onConnectError = (err: Error) => {
        next.off('connect', onConnect);
        next.disconnect();
        connectPromise = null;
        reject(Object.assign(err, { code: 'invalid_token' as const }));
      };

      next.once('connect', onConnect);
      next.once('connect_error', onConnectError);
      socket.value = next;
    });

    return connectPromise;
  }

  function kickMidGame(payload: {
    roomCode: string;
    playerId: string;
    targetId: string;
  }): Promise<HostKickResult> {
    return ensureAdminSocket().then(
      (s) =>
        new Promise<HostKickResult>((resolve) => {
          s.emit('hostMidGameKickPlayer', payload, (response: OkResponse | ErrorResponse) => {
            if (response && 'error' in response && response.error) {
              if (response.error === 'server.errors.adminRequired') {
                resolve({ kind: 'invalid_token', message: response.error });
              } else {
                resolve({ kind: 'server_error', message: response.error });
              }
              return;
            }
            resolve({ kind: 'ok' });
          });
        }),
      (err: Error & { code?: 'no_token' | 'invalid_token' }) => {
        if (err.code === 'no_token') {
          return { kind: 'no_token' } as const;
        }
        return {
          kind: 'invalid_token',
          message: err.message,
        } as const;
      }
    );
  }

  function dispose() {
    const existing = socket.value as AdminSocket | null;
    if (existing) {
      existing.disconnect();
      socket.value = null;
    }
    connectPromise = null;
  }

  onBeforeUnmount(dispose);

  return {
    ensureAdminSocket,
    kickMidGame,
    dispose,
  };
}
