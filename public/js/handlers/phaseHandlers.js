import { state } from '../state/gameState.js';
import { notify } from '../utils/helpers.js';

function bindPhaseHandlers(socket, renderApp) {
  if (!state?.room) return;
  const room = state.room;
  
  // Clean up any phase-specific timeouts when phase changes
  if (room.phase !== 'lobby' && state && state.updateConfigTimeoutId) {
    clearTimeout(state.updateConfigTimeoutId);
    state.updateConfigTimeoutId = null;
  }
  
  if (room.phase !== 'roleReveal' && state && state.readyButtonTimeoutId) {
    clearTimeout(state.readyButtonTimeoutId);
    state.readyButtonTimeoutId = null;
  }
  
  // Handle host skip button for phase transitions
  if (room.phaseTransition && room.hostId === state?.playerId) {
    const hostSkipBtn = document.getElementById('host-skip-btn');
    hostSkipBtn?.addEventListener('click', () => {
      if (!state || !state.playerId) {
        return;
      }
      const playerId = state.playerId;
      socket.emit('hostSkipStep', { roomCode: room.code, playerId });
    });
  }
  
  if (room.phase === 'lobby') {
    bindLobbyHandlers(socket, room);
  } else if (room.phase === 'roleReveal') {
    bindRoleRevealHandlers(socket, room);
  } else if (room.phase === 'armor') {
    bindArmorHandlers(socket, room);
  } else if (room.phase === 'night') {
    bindNightHandlers(socket, room);
  } else if (room.phase === 'day') {
    bindDayHandlers(socket, room, renderApp);
  }
}

function bindLobbyHandlers(socket, room) {
  if (!room || !state || room.hostId !== state.playerId) return;
  
  const roleConfigForm = document.getElementById('role-config');
  if (!roleConfigForm) return;
  
  const updateConfig = () => {
    const config = {};
    roleConfigForm.querySelectorAll('.role-input').forEach((field) => {
      config[field.dataset.role] = Number(field.value);
    });
    const minPlayersInput = document.getElementById('min-players');
    if (minPlayersInput) {
      config.minPlayers = Number(minPlayersInput.value);
    }
    socket.emit('updateRoleConfig', { roomCode: room.code, playerId: state.playerId, config });
  };
  
  const debouncedUpdateConfig = () => {
    if (!state) {
      return;
    }

    if (state.updateConfigTimeoutId) {
      clearTimeout(state.updateConfigTimeoutId);
    }

    state.updateConfigTimeoutId = setTimeout(() => {
      if (!state) {
        return;
      }
      updateConfig();
      state.updateConfigTimeoutId = null;
    }, 400);
  };
  
  roleConfigForm.addEventListener('change', (e) => {
    if (e.target.matches('.role-input') || e.target.matches('#min-players')) {
      updateConfig();
    }
  });
  
  roleConfigForm.addEventListener('input', (e) => {
    if (e.target.matches('.role-input') || e.target.matches('#min-players')) {
      debouncedUpdateConfig();
    }
  });
  
  document.getElementById('start-game')?.addEventListener('click', () => {
    if (!state || !state.playerId) {
      return;
    }
    const playerId = state.playerId;
    socket.emit('startGame', { roomCode: room.code, playerId }, (res) => {
      if (res?.error) notify(res.error);
    });
  });
}

function bindRoleRevealHandlers(socket, room) {
  if (!room || !state) return;
  
  if (state.readyButtonTimeoutId) {
    clearTimeout(state.readyButtonTimeoutId);
    state.readyButtonTimeoutId = null;
  }
  
  const readyBtn = document.getElementById('ready-btn');
  readyBtn?.addEventListener('click', () => {
    if (readyBtn.disabled) return;
    readyBtn.disabled = true;
    
    state.readyButtonTimeoutId = setTimeout(() => {
      const currentBtn = document.getElementById('ready-btn');
      if (currentBtn && currentBtn.disabled) {
        currentBtn.disabled = false;
        notify('Failed to mark you as ready. Please try again.');
      }
      state.readyButtonTimeoutId = null;
    }, 10000);

    socket.emit(
      'markReady',
      { roomCode: room.code, playerId: state.playerId },
      (res) => {
        if (!state) return;
        if (state && state.readyButtonTimeoutId) {
          clearTimeout(state.readyButtonTimeoutId);
          state.readyButtonTimeoutId = null;
        }
        if (res?.error) {
          notify(res.error);
          const currentBtn = document.getElementById('ready-btn');
          if (currentBtn) {
            currentBtn.disabled = false;
          }
        }
      }
    );
  });

  if (room.hostId === state.playerId) {
    const continueBtn = document.getElementById('continue-btn');
    if (!continueBtn) {
      return;
    }
    continueBtn.addEventListener('click', () => {
      if (continueBtn.disabled) return;
      if (!state) return;
      continueBtn.disabled = true;
      socket.emit('continueAfterReveal', { roomCode: room.code, playerId: state.playerId });
    });
  }
}

function bindArmorHandlers(socket, room) {
  if (room.self?.role !== 'armor' || !room.self.alive) return;
  
  const armorForm = document.getElementById('armor-form');
  armorForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(armorForm);
    const targets = [data.get('loverA'), data.get('loverB')];
    if (!targets[0] || !targets[1] || targets[0] === targets[1]) {
      notify('Choose two distinct Lovers.');
      return;
    }
    socket.emit('submitArmor', { roomCode: room.code, playerId: state.playerId, targets });
  });
}

function bindNightHandlers(socket, room) {
  if (!room) {
    return;
  }
  if (!state?.playerId) {
    return;
  }
  if (room.hostId === state.playerId) {
    document.getElementById('skip-step')?.addEventListener('click', () => {
    socket.emit('hostSkipStep', { roomCode: room.code, playerId: state.playerId });
    });
  }
  
  if (room.phaseStep === 'wolves' && room.self?.role === 'werewolf' && room.self.alive) {
    const wolfForm = document.getElementById('wolf-form');
    wolfForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(wolfForm);
    const targetId = data.get('target');
    if (!targetId) return;
    socket.emit('submitWolfVote', { roomCode: room.code, playerId: state.playerId, targetId });
    });
  }
  
  if (room.phaseStep === 'seer' && room.self?.role === 'seer' && room.self.alive) {
    const seerForm = document.getElementById('seer-form');
    seerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(seerForm);
    const targetId = data.get('target');
    if (!targetId) return;
    socket.emit('submitSeerInspect', { roomCode: room.code, playerId: state.playerId, targetId }, (res) => {
      if (res?.ok) {
        notify('Vision received. Check your role card for the result.');
      } else if (res && res.error) {
        notify(`Error: ${res.error}`);
      }
    });
    });
  }
  
  if (room.phaseStep === 'witch' && room.self?.role === 'witch' && room.self.alive) {
    document.getElementById('heal-btn')?.addEventListener('click', () => {
    socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'heal' });
    });
    
    document.getElementById('poison-btn')?.addEventListener('click', () => {
    const select = document.getElementById('poison-select');
    const target = select?.value;
    if (!target) return;
    socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'poison', targetId: target });
    });
    
    document.getElementById('skip-witch')?.addEventListener('click', () => {
    socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'skip' });
    });
  }
}

function bindDayHandlers(socket, room, renderApp) {
  if (!room.self?.alive) return;
  
  const voteForm = document.getElementById('vote-form');
  const voteSelect = voteForm?.querySelector('select[name="target"]');
  const voteSubmit = document.getElementById('vote-submit');
  
  if (voteSelect && voteSubmit) {
    voteSubmit.disabled = !voteSelect.value;
    voteSelect.addEventListener('change', () => {
      voteSubmit.disabled = !voteSelect.value;
    });
  }
  
  voteForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(voteForm);
    const targetId = data.get('target');
    const normalized = targetId === '__abstain__' ? null : targetId;
    if (state) {
      state.pendingVote = normalized;
    }
    renderApp();
    socket.emit('submitDayVote', { roomCode: room.code, playerId: state.playerId, targetId: normalized });
  });
}

export { bindPhaseHandlers };
