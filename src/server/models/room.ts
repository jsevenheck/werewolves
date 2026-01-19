import { ROOM_CODE, DEFAULT_ROLE_CONFIG } from '../config/constants';
import { createVoteState } from '../utils/helpers';
import type { Player, Room } from '../../shared/types';

const rooms = new Map<string, Room>();

function createRoom(hostName: string, socketId: string, createPlayer: (name: string, socketId: string, isHost: boolean) => Player) {
  let code: string;
  do {
    code = ROOM_CODE();
  } while (rooms.has(code));
  const room: Room = {
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
    wolfTarget: null,
    healedTarget: null,
    poisonTarget: null,
    seerActed: false,
    voteState: createVoteState(),
    pendingDeaths: [],
    winner: null,
    lastNightDeaths: [],
    lastDayDeaths: [],
    lastDayMessage: null,
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

function getRoom(code: string) {
  return rooms.get(code);
}

function getAllRooms() {
  return rooms;
}

export {
  createRoom,
  getRoom,
  getAllRooms
};
