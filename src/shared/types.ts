export type Role = 'werewolf' | 'seer' | 'hunter' | 'witch' | 'armor' | 'joker' | 'guard' | 'villager';
export type Team = 'wolves' | 'village' | 'neutral' | 'joker';
export type Phase = 'lobby' | 'roleReveal' | 'mayor' | 'armor' | 'night' | 'day' | 'ended';
export type NightStep = 'wolves' | 'seer' | 'witch' | 'guard' | 'resolve' | 'transition' | null;
export type PhaseTransition = 'postReveal' | 'postMayor' | 'postArmor' | 'nightToDay' | 'dayToNight' | null;
export type PassiveRole = 'mayor';

export interface RoleConfig {
  werewolf: number;
  seer: number;
  hunter: number;
  witch: number;
  armor: number;
  joker: number;
  guard: number;
}

export interface PassiveRoleConfig {
  mayor: boolean;
}

export interface SeerResult {
  name: string;
  result: 'Werewolf' | 'Not Werewolf';
}

/**
 * Represents a player in the game.
 * 
 * @remarks
 * The `role` and `team` fields are `null` during the lobby phase, before roles are assigned.
 * Once the game starts (after the lobby phase), these fields are populated via the `assignRoles` function.
 * 
 * When displaying a player's role (e.g., in death/vote announcements), 'villager' is used as the 
 * default fallback if the role is somehow null, as villager is the base role filled in when 
 * there aren't enough special roles configured.
 */
export interface Player {
  id: string;
  name: string;
  /** The player's assigned role. Null during lobby phase, assigned when game starts. */
  role: Role | null;
  /** The player's team affiliation. Null during lobby phase, assigned when game starts. */
  team: Team | null;
  alive: boolean;
  connected: boolean;
  socketId: string | null;
  resumeToken: string;
  isHost: boolean;
  voteTarget: string | null;
  nightAction: { vote: string | null } | null;
  ready: boolean;
  seerResult: SeerResult | null;
}

export interface VoteState {
  votes: Record<string, string | null | undefined>;
  revoteFromTie: string[] | null;
}

export interface WitchState {
  healAvailable: boolean;
  poisonAvailable: boolean;
}

export interface LoverPair {
  aId: string;
  bId: string;
}

export interface RoomLog {
  ts: number;
  text: string;
  publicText: string | null;
}

export interface PendingDeath {
  playerId: string;
  reason: string;
}

export interface NightDeathAnnouncement {
  name: string;
  role: Role | null;
}

export interface Winner {
  team: Team;
  reason: string;
}

export interface Room {
  code: string;
  hostId: string | null;
  phase: Phase;
  phaseStep: NightStep;
  dayCount: number;
  players: Record<string, Player>;
  minPlayers: number;
  roleConfig: RoleConfig;
  passiveRoleConfig: PassiveRoleConfig;
  mayorId: string | null;
  awaitingMayorSelection: string | null;
  mayorSelectionQueue: string[];
  mayorSelectionTimer: NodeJS.Timeout | null;
  lovers: LoverPair | null;
  witchState: WitchState;
  wolfVotes: Record<string, string | null>;
  wolfTarget: string | null;
  healedTarget: string | null;
  poisonTarget: string | null;
  seerActed: boolean;
  guardedTarget: string | null;
  lastGuardedTarget: string | null;
  guardActed: boolean;
  voteState: VoteState;
  pendingDeaths: PendingDeath[];
  winner: Winner | null;
  lastNightDeaths: NightDeathAnnouncement[];
  lastDayDeaths: NightDeathAnnouncement[];
  lastDayMessage: string | null;
  awaitingHunterShot: string | null;
  dayVoteResolved: boolean;
  logs: RoomLog[];
  nextNightStep: NightStep;
  transitionTimer: NodeJS.Timeout | null;
  phaseTransition: PhaseTransition;
  phaseTimer: NodeJS.Timeout | null;
  hunterShotTimer: NodeJS.Timeout | null;
  hunterShotEndsAt: number | null;
  hunterShotQueue: string[];
  createdAt: number;
  lastActivityAt: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
  isHost: boolean;
  role: Role | null;
  ready?: boolean;
}

export interface RoomViewVoteState {
  revoteFromTie: string[] | null;
  submitted: number;
  required: number;
  yourVote: string | null | undefined;
}

export interface RoomViewLog {
  ts: number;
  text: string;
}

export interface RoomViewSelf {
  id: string;
  role: Role | null;
  team: Team | null;
  alive: boolean;
  ready?: boolean;
}

export interface RoomView {
  code: string;
  phase: Phase;
  phaseStep: NightStep;
  dayCount: number;
  players: PlayerPublic[];
  hostId: string | null;
  minPlayers: number;
  roleConfig: RoleConfig;
  passiveRoleConfig: PassiveRoleConfig;
  mayorId: string | null;
  awaitingMayorSelection: boolean;
  mayorSelectionPending: boolean;
  loversKnown: boolean;
  loversAssigned: boolean;
  loverName: string | null;
  witchState: { healAvailable: boolean | null; poisonAvailable: boolean | null };
  wolfVotes: Record<string, string | null> | null;
  wolfVoteState: { submitted: number; required: number; yourVote: string | null | undefined } | null;
  wolfTarget: string | null;
  wolfPeers: string[];
  wolfIds: string[];
  guardedTarget: string | null;
  lastGuardedTarget: string | null;
  nextNightStep: NightStep;
  phaseTransition: PhaseTransition;
  seerResult: SeerResult | null;
  voteState: RoomViewVoteState;
  lastNightDeaths: NightDeathAnnouncement[];
  lastDayDeaths: NightDeathAnnouncement[];
  lastDayMessage: string | null;
  awaitingHunterShot: boolean;
  hunterShotPending: boolean;
  hunterShotEndsAt: number | null;
  dayVoteResolved: boolean;
  winner: Winner | null;
  logs: RoomViewLog[];
  self: RoomViewSelf | null;
}

export interface StoredSession {
  roomCode: string;
  playerId: string;
  name: string;
  resumeToken: string;
}
