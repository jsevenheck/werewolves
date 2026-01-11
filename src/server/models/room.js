const { ROOM_CODE, DEFAULT_ROLE_CONFIG } = require('../config/constants');
const { createVoteState } = require('../utils/helpers');

const rooms = new Map();

function createRoom(hostName, socketId, createPlayer) {
  let code;
  do {
    code = ROOM_CODE();
  } while (rooms.has(code));
  const room = {
    code,
    hostId: null,
    phase: 'lobby',
    phaseStep: null,
    dayCount: 0,
    players: {},
    minPlayers: 5,
    roleConfig: { ...DEFAULT_ROLE_CONFIG },
    lovers: null,
    witchState: { healAvailable: true, poisonAvailable: true },
    wolfVotes: {},
    voteState: createVoteState(),
    pendingDeaths: [],
    winner: null,
    lastNightDeaths: [],
    awaitingHunterShot: null,
    logs: [],
    nextNightStep: null,
    transitionTimer: null,
    phaseTransition: null,
    phaseTimer: null
  };
  const player = createPlayer(hostName, socketId, true);
  room.players[player.id] = player;
  room.hostId = player.id;
  rooms.set(code, room);
  return { room, player };
}

function getRoom(code) {
  return rooms.get(code);
}

function getAllRooms() {
  return rooms;
}

module.exports = {
  createRoom,
  getRoom,
  getAllRooms
};
