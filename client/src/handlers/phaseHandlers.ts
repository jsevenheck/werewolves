import { state } from '../state/gameState';
import { notify } from '../utils/helpers';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { RoomView } from '@shared/types';
import type { Socket } from 'socket.io-client';

function bindPhaseHandlers(socket: Socket<ServerToClientEvents, ClientToServerEvents>, renderApp: () => void) {
  if (!state.room) return;
  const room = state.room;

  // Clean up any phase-specific timeouts when phase changes
  if (room.phase !== 'lobby' && state.updateConfigTimeoutId) {
    clearTimeout(state.updateConfigTimeoutId);
    state.updateConfigTimeoutId = null;
  }

  if (room.phase !== 'roleReveal' && state.readyButtonTimeoutId) {
    clearTimeout(state.readyButtonTimeoutId);
    state.readyButtonTimeoutId = null;
  }

  // Handle host skip button for phase transitions
  if (room.phaseTransition && room.hostId === state.playerId) {
    const hostSkipBtn = document.getElementById('host-skip-btn');
    hostSkipBtn?.addEventListener('click', () => {
      if (!state.playerId) {
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
  } else if (room.phase === 'mayor') {
    if (room.hostId === state.playerId) {
      document.getElementById('continue-mayor')?.addEventListener('click', () => {
        if (!state.playerId) return;
        socket.emit('selectMayor', { roomCode: room.code, playerId: state.playerId, targetId: '' });
      });
    }
  } else if (room.phase === 'armor') {
    if (room.hostId === state.playerId) {
      document.getElementById('skip-armor')?.addEventListener('click', () => {
        if (!state.playerId) return;
        socket.emit('hostSkipStep', { roomCode: room.code, playerId: state.playerId });
      });
    }
    bindArmorHandlers(socket, room);
  } else if (room.phase === 'night') {
    bindNightHandlers(socket, room, renderApp);
  } else if (room.phase === 'day') {
    bindDayHandlers(socket, room, renderApp);
  }
}

function bindLobbyHandlers(socket: Socket<ServerToClientEvents, ClientToServerEvents>, room: RoomView) {
  if (!room || room.hostId !== state.playerId) return;

  const roleConfigForm = document.getElementById('role-config') as HTMLFormElement | null;
  if (!roleConfigForm) return;

  const updateConfig = () => {
    const config: Record<string, number> & { minPlayers?: number } = {};
    roleConfigForm.querySelectorAll<HTMLInputElement>('.role-input').forEach((field) => {
      if (!field.dataset.role) return;
      config[field.dataset.role] = Number(field.value);
    });
    const minPlayersInput = document.getElementById('min-players') as HTMLInputElement | null;
    if (minPlayersInput) {
      config.minPlayers = Number(minPlayersInput.value);
    }
    socket.emit('updateRoleConfig', { roomCode: room.code, playerId: state.playerId, config });
  };

  const debouncedUpdateConfig = () => {
    if (state.updateConfigTimeoutId) {
      clearTimeout(state.updateConfigTimeoutId);
    }

    state.updateConfigTimeoutId = window.setTimeout(() => {
      updateConfig();
      state.updateConfigTimeoutId = null;
    }, 400);
  };

  roleConfigForm.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.role-input') || target.matches('#min-players')) {
      updateConfig();
    }
  });

  roleConfigForm.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.role-input') || target.matches('#min-players')) {
      debouncedUpdateConfig();
    }
  });

  document.getElementById('start-game')?.addEventListener('click', () => {
    if (!state.playerId) {
      return;
    }
    const playerId = state.playerId;
    socket.emit('startGame', { roomCode: room.code, playerId }, (res) => {
      if (res && 'error' in res && res.error) {
        notify(res.error);
      }
    });
  });
}

function bindRoleRevealHandlers(socket: Socket<ServerToClientEvents, ClientToServerEvents>, room: RoomView) {
  if (!room) return;

  if (state.readyButtonTimeoutId) {
    clearTimeout(state.readyButtonTimeoutId);
    state.readyButtonTimeoutId = null;
  }

  const readyBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
  readyBtn?.addEventListener('click', () => {
    if (!readyBtn || readyBtn.disabled) return;
    readyBtn.disabled = true;

    state.readyButtonTimeoutId = window.setTimeout(() => {
      if (!state.readyButtonTimeoutId) return;
      const currentBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
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
        if (state.readyButtonTimeoutId) {
          clearTimeout(state.readyButtonTimeoutId);
          state.readyButtonTimeoutId = null;
        }
        if (res && 'error' in res && res.error) {
          notify(res.error);
          const currentBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
          if (currentBtn) {
            currentBtn.disabled = false;
          }
        }
      }
    );
  });

  if (room.hostId === state.playerId) {
    const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement | null;
    if (!continueBtn) {
      return;
    }
    continueBtn.addEventListener('click', () => {
      if (continueBtn.disabled) return;
      continueBtn.disabled = true;
      socket.emit('continueAfterReveal', { roomCode: room.code, playerId: state.playerId });
    });
  }
}

function bindArmorHandlers(socket: Socket<ServerToClientEvents, ClientToServerEvents>, room: RoomView) {
  if (room.self?.role !== 'armor' || !room.self.alive) return;

  const armorForm = document.getElementById('armor-form') as HTMLFormElement | null;
  armorForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!armorForm) return;
    const data = new FormData(armorForm);
    const targets = [data.get('loverA'), data.get('loverB')];
    if (!targets[0] || !targets[1] || targets[0] === targets[1]) {
      notify('Choose two distinct Lovers.');
      return;
    }
    if (!state.playerId) return;
    socket.emit('submitArmor', { roomCode: room.code, playerId: state.playerId, targets: [String(targets[0]), String(targets[1])] });
  });
}

function bindNightHandlers(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  room: RoomView,
  renderApp: () => void
) {
  if (!room) {
    return;
  }
  if (!state.playerId) {
    return;
  }
  if (room.hostId === state.playerId) {
    document.getElementById('skip-step')?.addEventListener('click', () => {
      const playerId = state.playerId;
      if (!playerId) {
        return;
      }
      socket.emit('hostSkipStep', { roomCode: room.code, playerId });
    });
  }

  if (room.phaseStep === 'wolves' && room.self?.role === 'werewolf' && room.self.alive) {
    const wolfForm = document.getElementById('wolf-form') as HTMLFormElement | null;
    const wolfSelect = wolfForm?.querySelector('select[name="target"]') as HTMLSelectElement | null;
    if (wolfSelect) {
      wolfSelect.addEventListener('change', () => {
        state.pendingWolfVote = wolfSelect.value || undefined;
      });
      wolfSelect.addEventListener('blur', () => {
        window.setTimeout(() => {
          renderApp();
        }, 0);
      });
    }
    wolfForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!wolfForm) return;
      const data = new FormData(wolfForm);
      const targetId = data.get('target');
      if (!targetId || !state.playerId) return;
      state.pendingWolfVote = undefined;
      socket.emit('submitWolfVote', { roomCode: room.code, playerId: state.playerId, targetId: String(targetId) });
    });
  }

  if (room.phaseStep === 'seer' && room.self?.role === 'seer' && room.self.alive) {
    const seerForm = document.getElementById('seer-form') as HTMLFormElement | null;
    seerForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!seerForm) return;
      const data = new FormData(seerForm);
      const targetId = data.get('target');
      if (!targetId || !state.playerId) return;
      socket.emit('submitSeerInspect', { roomCode: room.code, playerId: state.playerId, targetId: String(targetId) }, (res) => {
        if (res && 'error' in res && res.error) {
          notify(`Error: ${res.error}`);
        }
      });
    });
  }

  if (room.phaseStep === 'witch' && room.self?.role === 'witch' && room.self.alive) {
    document.getElementById('heal-btn')?.addEventListener('click', () => {
      if (!state.playerId) return;
      socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'heal' });
    });

    document.getElementById('poison-btn')?.addEventListener('click', () => {
      const select = document.getElementById('poison-select') as HTMLSelectElement | null;
      const target = select?.value;
      if (!target || !state.playerId) return;
      socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'poison', targetId: target });
    });

    document.getElementById('skip-witch')?.addEventListener('click', () => {
      if (!state.playerId) return;
      socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'skip' });
    });
  }
}

function bindDayHandlers(socket: Socket<ServerToClientEvents, ClientToServerEvents>, room: RoomView, renderApp: () => void) {
  if (room.hostId === state.playerId) {
    document.getElementById('end-vote-btn')?.addEventListener('click', () => {
      if (!state.playerId) return;
      socket.emit('hostFinalizeDayVote', { roomCode: room.code, playerId: state.playerId });
    });
  }

  if (!room.self?.alive) return;

  const voteForm = document.getElementById('vote-form') as HTMLFormElement | null;
  const voteSelect = voteForm?.querySelector('select[name="target"]') as HTMLSelectElement | null;
  const voteSubmit = document.getElementById('vote-submit') as HTMLButtonElement | null;

  if (voteSelect && voteSubmit) {
    voteSubmit.disabled = !voteSelect.value;
    voteSelect.addEventListener('change', () => {
      voteSubmit.disabled = !voteSelect.value;
      const selected = voteSelect.value;
      state.pendingVote = selected === '__abstain__' ? null : (selected ? selected : null);
    });
    voteSelect.addEventListener('blur', () => {
      window.setTimeout(() => {
        renderApp();
      }, 0);
    });
  }

  voteForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!voteForm) return;
    const data = new FormData(voteForm);
    const targetId = data.get('target');
    const normalized = targetId === '__abstain__' ? null : (targetId ? String(targetId) : null);
    if (!state.playerId) {
      notify('Unable to submit vote: missing player state.');
      return;
    }
    state.pendingVote = normalized;
    renderApp();
    socket.emit('submitDayVote', { roomCode: room.code, playerId: state.playerId, targetId: normalized });
  });
}

export { bindPhaseHandlers };
