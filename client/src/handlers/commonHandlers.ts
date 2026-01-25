import { state } from '../state/gameState';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { Socket } from 'socket.io-client';
import { escapeHtml, notify } from '../utils/helpers';
import { narrator } from '../utils/narrator';

let narratorUnlockInProgress = false;
let narratorUnlockToken = 0;
let narratorGestureBound = false;
let narratorLastUnlockAttemptAt = 0;
const NARRATOR_UNLOCK_COOLDOWN_MS = 1500;

function setNarratorButtonDisabled(disabled: boolean) {
  const button = document.getElementById('toggle-narrator');
  if (button instanceof HTMLButtonElement) {
    button.disabled = disabled;
  }
}

function bindCommonHandlers(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  renderApp: () => void,
  renderLanding: () => void,
  clearSession: () => void
) {
  const attemptNarratorUnlock = async (force = false) => {
    if (narratorUnlockInProgress) {
      return;
    }
    if (!narrator.isEnabled() || narrator.isUnlocked()) {
      return;
    }
    const now = Date.now();
    if (!force && now - narratorLastUnlockAttemptAt < NARRATOR_UNLOCK_COOLDOWN_MS) {
      return;
    }
    narratorLastUnlockAttemptAt = now;
    narratorUnlockInProgress = true;
    const unlockToken = ++narratorUnlockToken;
    setNarratorButtonDisabled(true);
    try {
      const unlocked = await narrator.unlock();
      if (unlockToken !== narratorUnlockToken) {
        return;
      }
      if (!unlocked) {
        notify('Tap again to enable audio.');
        renderApp();
        return;
      }
      narrator.setEnabled(true);
      narrator.announceLatest();
      renderApp();
    } finally {
      if (unlockToken !== narratorUnlockToken) {
        return;
      }
      narratorUnlockInProgress = false;
      setNarratorButtonDisabled(false);
    }
  };

  const toggleRoleBtn = document.getElementById('toggle-role');
  toggleRoleBtn?.addEventListener('click', () => {
    state.roleVisible = !state.roleVisible;
    renderApp();
  });

  document.getElementById('leave-room')?.addEventListener('click', () => {
    if (state.roomCode && state.playerId) {
      socket.emit('leaveRoom', { roomCode: state.roomCode, playerId: state.playerId });
    }
    resetState();
    clearSession();
    renderLanding();
  });

  document.getElementById('restart-btn')?.addEventListener('click', () => {
    if (!state.roomCode || !state.playerId) return;
    if (state.room?.hostId !== state.playerId) {
      notify('Only the host can restart the game.');
      return;
    }
    if (state.room?.phase !== 'ended') {
      notify('The game can only be restarted after it has ended.');
      return;
    }
    socket.emit('restartGame', { roomCode: state.roomCode, playerId: state.playerId });
  });

  const toggleNarratorBtn = document.getElementById('toggle-narrator');
  setNarratorButtonDisabled(narratorUnlockInProgress);
  toggleNarratorBtn?.addEventListener('click', async () => {
    if (narrator.isEnabled() && narrator.isUnlocked()) {
      narrator.setEnabled(false);
      renderApp();
      return;
    }

    if (!narrator.isEnabled()) {
      narrator.setEnabled(true);
      renderApp();
    }

    await attemptNarratorUnlock(true);
  });

  if (!narratorGestureBound) {
    narratorGestureBound = true;
    document.addEventListener('pointerdown', () => {
      void attemptNarratorUnlock(false);
    });
  }
}

function resetState() {
  state.room = null;
  state.roomCode = '';
  state.playerId = '';
  state.playerName = '';
  state.resumeToken = '';
  state.hunterPrompt = false;
  state.mayorPrompt = false;
  state.pendingVote = undefined;
  state.pendingWolfVote = undefined;
  state.roleVisible = false;
  narratorUnlockInProgress = false;
  narratorUnlockToken += 1;
  narratorLastUnlockAttemptAt = 0;
  setNarratorButtonDisabled(false);
}

function updateHunterOverlay(socket: Socket<ServerToClientEvents, ClientToServerEvents>) {
  const existing = document.getElementById('hunter-overlay');
  if (!state.room?.awaitingHunterShot) {
    existing?.remove();
    state.hunterPrompt = false;
    return;
  }
  if (!state.room) return;

  existing?.remove();
  const wrapper = document.createElement('div');
  wrapper.id = 'hunter-overlay';
  wrapper.className = 'hunter-overlay';

  const room = state.room;
  if (!room || !Array.isArray(room.players)) {
    return;
  }

  const targets = room.players.filter((player) => player.alive);
  const options = targets.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join('');
  wrapper.innerHTML = `
    <div class="panel">
      <h2>Hunter's Last Shot</h2>
      <form id="hunter-form" class="actions">
        <label>
          <span>Choose who to shoot</span>
          <select name="target" required>
            <option value="">Select player</option>
            ${options}
          </select>
        </label>
        <button type="submit">Fire</button>
      </form>
    </div>
  `;
  document.body.appendChild(wrapper);
  const form = document.getElementById('hunter-form') as HTMLFormElement | null;
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const targetId = data.get('target');
    if (!targetId || !state.room || !state.playerId) return;
    socket.emit('hunterShoot', { roomCode: state.roomCode, playerId: state.playerId, targetId: String(targetId) });
    state.hunterPrompt = false;
    wrapper.remove();
  });
}

function updateMayorOverlay(socket: Socket<ServerToClientEvents, ClientToServerEvents>) {
  const existing = document.getElementById('mayor-overlay');
  if (!state.room?.awaitingMayorSelection) {
    existing?.remove();
    state.mayorPrompt = false;
    return;
  }
  if (!state.room) return;

  existing?.remove();
  const wrapper = document.createElement('div');
  wrapper.id = 'mayor-overlay';
  wrapper.className = 'mayor-overlay';

  const room = state.room;
  if (!room || !Array.isArray(room.players)) {
    return;
  }

  const targets = room.players.filter((player) => player.alive);
  const options = targets.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join('');
  wrapper.innerHTML = `
    <div class="panel">
      <h2>Select New Mayor</h2>
      <p>As the dying Mayor, you must select your successor.</p>
      <form id="mayor-form" class="actions">
        <label>
          <span>Choose the new Mayor</span>
          <select name="target" required>
            <option value="">Select player</option>
            ${options}
          </select>
        </label>
        <button type="submit">Appoint Mayor</button>
      </form>
    </div>
  `;
  document.body.appendChild(wrapper);
  const form = document.getElementById('mayor-form') as HTMLFormElement | null;
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const targetId = data.get('target');
    if (!targetId || !state.room || !state.playerId) return;
    socket.emit('selectMayor', { roomCode: state.roomCode, playerId: state.playerId, targetId: String(targetId) });
    state.mayorPrompt = false;
    wrapper.remove();
  });
}

export { bindCommonHandlers, updateHunterOverlay, updateMayorOverlay };
