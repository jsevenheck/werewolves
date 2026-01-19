import { state } from '../state/gameState';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { Socket } from 'socket.io-client';
import { notify } from '../utils/helpers';
import { narrator } from '../utils/narrator';

function bindCommonHandlers(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  renderApp: () => void,
  renderLanding: () => void,
  clearSession: () => void
) {
  const toggleRoleBtn = document.getElementById('toggle-role');
  toggleRoleBtn?.addEventListener('click', () => {
    state.roleVisible = !state.roleVisible;
    renderApp();
  });

  document.getElementById('leave-room')?.addEventListener('click', () => {
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
  let narratorUnlockInProgress = false;
  toggleNarratorBtn?.addEventListener('click', async () => {
    if (narratorUnlockInProgress) {
      return;
    }

    if (narrator.isEnabled()) {
      narrator.setEnabled(false);
      renderApp();
      return;
    }

    narratorUnlockInProgress = true;
    const buttonElement =
      toggleNarratorBtn instanceof HTMLButtonElement ? toggleNarratorBtn : null;
    if (buttonElement) {
      buttonElement.disabled = true;
    }

    try {
      const unlocked = await narrator.unlock();
      if (!unlocked) {
        narrator.setEnabled(false);
        notify('Audio is blocked. Tap again and check your mute switch or volume.');
        renderApp();
        return;
      }
      narrator.setEnabled(true);
      renderApp();
    } finally {
      narratorUnlockInProgress = false;
      if (buttonElement) {
        buttonElement.disabled = false;
      }
    }
  });
}

function resetState() {
  state.room = null;
  state.roomCode = '';
  state.playerId = '';
  state.playerName = '';
  state.hunterPrompt = false;
  state.pendingVote = undefined;
  state.roleVisible = false;
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
  const options = targets.map((player) => `<option value="${player.id}">${player.name}</option>`).join('');
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

export { bindCommonHandlers, updateHunterOverlay };
