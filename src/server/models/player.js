const { PLAYER_ID } = require('../config/constants');

const socketIndex = new Map();

function createPlayer(name, socketId, isHost) {
  return {
    id: PLAYER_ID(),
    name,
    role: null,
    team: null,
    alive: true,
    connected: true,
    socketId,
    isHost: !!isHost,
    voteTarget: null,
    nightAction: null,
    ready: false,
    seerResult: null
  };
}

function setSocketIndex(socketId, roomCode, playerId) {
  socketIndex.set(socketId, { roomCode, playerId });
}

function getSocketIndex(socketId) {
  return socketIndex.get(socketId);
}

function deleteSocketIndex(socketId) {
  socketIndex.delete(socketId);
}

module.exports = {
  createPlayer,
  setSocketIndex,
  getSocketIndex,
  deleteSocketIndex
};
