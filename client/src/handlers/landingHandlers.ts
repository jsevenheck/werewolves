import { state, saveSession } from '../state/gameState';
import { pushNotification } from '../utils/helpers';
import type { StoredSession } from '@shared/types';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { Socket } from 'socket.io-client';

type EnterRoomParams = {
  roomCode: string;
  playerId: string;
  name: string;
};

function bindLandingHandlers(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  renderLanding: () => void,
  enterRoomFn: (params: EnterRoomParams, socket: Socket<ServerToClientEvents, ClientToServerEvents>) => void,
  attemptResume: (session: StoredSession) => void,
  saved: StoredSession | null
) {
  const createForm = document.getElementById('create-form') as HTMLFormElement | null;
  const joinForm = document.getElementById('join-form') as HTMLFormElement | null;

  createForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const name = (formData.get('name') || '').toString().trim();
    if (!name) return;
    socket.emit('createRoom', { name }, (payload) => {
      if (payload && 'error' in payload && payload.error) {
        pushNotification(payload.error);
        renderLanding();
        return;
      }
      if (!payload?.roomCode || !payload.playerId) return;
      enterRoomFn({ roomCode: payload.roomCode, playerId: payload.playerId, name }, socket);
    });
  });

  joinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(joinForm);
    const name = (formData.get('name') || '').toString().trim();
    const code = (formData.get('code') || '').toString().trim().toUpperCase();
    if (!name || code.length !== 4) return;
    socket.emit('joinRoom', { name, code }, (payload) => {
      if (payload && 'error' in payload && payload.error) {
        pushNotification(payload.error);
        renderLanding();
        return;
      }
      if (!payload?.roomCode || !payload.playerId) return;
      enterRoomFn({ roomCode: payload.roomCode, playerId: payload.playerId, name }, socket);
    });
  });

  document.getElementById('resume-btn')?.addEventListener('click', () => {
    if (saved) {
      attemptResume(saved);
    }
  });
}

function enterRoom({ roomCode, playerId, name }: EnterRoomParams, socket: Socket<ServerToClientEvents, ClientToServerEvents>) {
  state.playerId = playerId;
  state.roomCode = roomCode;
  state.playerName = name;
  saveSession();
  socket.emit('requestState', { roomCode, playerId });
}

export { bindLandingHandlers, enterRoom };
