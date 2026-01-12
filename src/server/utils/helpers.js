function sanitizeName(name) {
  return (name || '').trim().slice(0, 20);
}

function shuffle(arr) {
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createVoteState() {
  return {
    votes: {},
    revoteFromTie: null
  };
}

function addLog(room, text, publicText = null) {
  room.logs.push({ ts: Date.now(), text, publicText });
}

function clearRoomTimers(room) {
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

module.exports = {
  sanitizeName,
  shuffle,
  createVoteState,
  addLog,
  clearRoomTimers
};
