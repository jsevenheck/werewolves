function notify(text) {
  if (!text) return;
  window.alert(text);
}

function pushNotification(text) {
  notify(text);
}

function getPlayerName(room, id) {
  return room.players.find((p) => p.id === id)?.name || 'Unknown';
}

function formatPhase(room) {
  if (room.winner) return 'Ended';
  if (room.phase === 'night' && room.phaseStep) {
    return `${capitalize(room.phase)} (${capitalize(room.phaseStep)})`;
  }
  return capitalize(room.phase);
}

function capitalize(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { notify, pushNotification, getPlayerName, formatPhase, capitalize };
