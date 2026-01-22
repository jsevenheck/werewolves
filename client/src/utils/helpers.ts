import type { RoomView } from '@shared/types';

function notify(text: string) {
  if (!text) return;
  window.alert(text);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pushNotification(text: string) {
  notify(text);
}

function getPlayerName(room: RoomView, id: string) {
  const name = room.players.find((p) => p.id === id)?.name || 'Unknown';
  return escapeHtml(name);
}

function formatPhase(room: RoomView) {
  if (room.winner) return 'Ended';
  if (room.phase === 'night' && room.phaseStep) {
    return `${capitalize(room.phase)} (${capitalize(room.phaseStep)})`;
  }
  return capitalize(room.phase);
}

function capitalize(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { notify, pushNotification, getPlayerName, formatPhase, capitalize, escapeHtml };
