import { state } from '../state/gameState.js';

function bindCommonHandlers(renderApp, renderLanding, clearSession) {
  const toggleRoleBtn = document.getElementById('toggle-role');
  toggleRoleBtn?.addEventListener('click', () => {
    if (!state) {
      console.error('Game state is not initialized; cannot toggle role visibility.');
      return;
    }
    state.roleVisible = !state.roleVisible;
    renderApp();
  });

  document.getElementById('leave-room')?.addEventListener('click', () => {
    resetState();
    clearSession();
    renderLanding();
  });
  
  document.getElementById('restart-btn')?.addEventListener('click', () => {
    resetState();
    clearSession();
    renderLanding();
  });
}

function resetState() {
  if (!state) return;
  state.room = null;
  state.roomCode = '';
  state.playerId = '';
  state.playerName = '';
  state.hunterPrompt = false;
  state.pendingVote = undefined;
  state.roleVisible = false;
}

function updateHunterOverlay(socket) {
  const existing = document.getElementById('hunter-overlay');
  if (!state) {
    existing?.remove();
    return;
  }
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
  const form = document.getElementById('hunter-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const targetId = data.get('target');
    if (!targetId || !state || !state.room || !state.playerId) return;
    if (!socket || typeof socket.emit !== 'function') return;
    socket.emit('hunterShoot', { roomCode: state.roomCode, playerId: state.playerId, targetId });
    state.hunterPrompt = false;
    wrapper.remove();
  });
}

export { bindCommonHandlers, updateHunterOverlay };
