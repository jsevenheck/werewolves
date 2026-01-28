import type { Room, VoteState, Role, Player } from '../../../core/src/types';
import { ROLE_INFO } from '../config/constants';

function sanitizeName(name: string) {
  return (name || '').trim().slice(0, 20);
}

function shuffle<T>(arr: T[]) {
  if (process.env.E2E_TESTS === '1') {
    return [...arr];
  }
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createVoteState(): VoteState {
  return {
    votes: {},
    revoteFromTie: null
  };
}

function addLog(room: Room, text: string, publicText: string | null = null) {
  room.logs.push({ ts: Date.now(), text, publicText });
}

function clearRoomTimers(room: Room) {
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  if (room.hunterShotTimer) {
    clearTimeout(room.hunterShotTimer);
    room.hunterShotTimer = null;
  }
  if (room.mayorSelectionTimer) {
    clearTimeout(room.mayorSelectionTimer);
    room.mayorSelectionTimer = null;
  }
}

/**
 * Gets the display label for a player's role, with proper fallback behavior.
 * 
 * @param player - The player whose role label to retrieve
 * @returns The role's display label from ROLE_INFO, or the role itself as fallback.
 *          Returns 'villager' if the player's role is null (e.g., during lobby phase).
 * 
 * @remarks
 * This function centralizes the fallback logic for displaying player roles.
 * The 'villager' default is used because:
 * - Roles are null during the lobby phase before assignment
 * - Villager is the base role filled in when not enough special roles are configured
 * - It provides a safe, meaningful default for any edge cases
 */
function getPlayerRoleLabel(player: Player): string {
  const role = player.role ?? 'villager';
  return ROLE_INFO[role]?.label || role;
}

export {
  sanitizeName,
  shuffle,
  createVoteState,
  addLog,
  clearRoomTimers,
  getPlayerRoleLabel
};
