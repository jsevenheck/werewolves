import type { Room, VoteState } from '../../shared/types';

function sanitizeName(name: string) {
  return (name || '').trim().slice(0, 20);
}

function shuffle<T>(arr: T[]) {
  if (process.env.E2E_TESTS === '1') {
    return [...arr];
  }
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createVoteState(): VoteState {
  return {
    votes: {},
    revoteFromTie: null
  };
}

function addLog(room: Room, text: string, publicText: string | null = null) {
  room.logs.push({ ts: Date.now(), text, publicText });
}

function clearRoomTimers(room: Room) {
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

export {
  sanitizeName,
  shuffle,
  createVoteState,
  addLog,
  clearRoomTimers
};
