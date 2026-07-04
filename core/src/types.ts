export type Role =
  'werewolf' | 'seer' | 'hunter' | 'witch' | 'armor' | 'joker' | 'guard' | 'harlot' | 'villager';
export type Team = 'wolves' | 'village' | 'neutral' | 'joker';
export type Phase = 'lobby' | 'roleReveal' | 'mayor' | 'armor' | 'night' | 'day' | 'ended';
export type NightStep =
  'wolves' | 'seer' | 'witch' | 'guard' | 'harlot' | 'resolve' | 'transition' | null;
export type PhaseTransition =
  'postReveal' | 'postMayor' | 'postArmor' | 'nightToDay' | 'dayToNight' | null;
export type PassiveRole = 'mayor';

export type LocalizedMessageParam = string | number | boolean | null;
export type LocalizedMessageParams = Record<string, LocalizedMessageParam>;

export interface LocalizedMessage {
  key: string;
  params?: LocalizedMessageParams;
}

export interface RoleConfig {
  werewolf: number;
  seer: number;
  hunter: number;
  witch: number;
  armor: number;
  joker: number;
  guard: number;
  harlot: number;
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
  message?: LocalizedMessage | null;
  publicMessage?: LocalizedMessage | null;
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
  reasonMessage?: LocalizedMessage | null;
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
  wolfVotes: Record<string, string | null | undefined>;
  wolfTarget: string | null;
  healedTarget: string | null;
  poisonTarget: string | null;
  seerActed: boolean;
  seerAwaitingDismiss: boolean;
  guardedTarget: string | null;
  lastGuardedTarget: string | null;
  guardActed: boolean;
  harlotVisitedTarget: string | null;
  harlotActed: boolean;
  voteState: VoteState;
  pendingDeaths: PendingDeath[];
  winner: Winner | null;
  lastNightDeaths: NightDeathAnnouncement[];
  lastDayDeaths: NightDeathAnnouncement[];
  lastDayMessage: string | null;
  lastDayMessageI18n?: LocalizedMessage | null;
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
  message?: LocalizedMessage | null;
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
  wolfVotes: Record<string, string | null | undefined> | null;
  wolfVoteState: {
    submitted: number;
    required: number;
    yourVote: string | null | undefined;
  } | null;
  wolfTarget: string | null;
  wolfPeers: string[];
  wolfIds: string[];
  guardedTarget: string | null;
  lastGuardedTarget: string | null;
  harlotVisitedTarget: string | null;
  nextNightStep: NightStep;
  phaseTransition: PhaseTransition;
  seerResult: SeerResult | null;
  voteState: RoomViewVoteState;
  lastNightDeaths: NightDeathAnnouncement[];
  lastDayDeaths: NightDeathAnnouncement[];
  lastDayMessage: string | null;
  lastDayMessageI18n?: LocalizedMessage | null;
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

/**
 * Lightweight summary of a room used by the global admin page.
 * Intentionally avoids leaking secret game state (roles, votes, etc.).
 *
 * The `players` field is a sanitized snapshot (id/name/alive/connected/isHost,
 * no `role`/team) so the admin detail view can render the full player list
 * and per-player kick buttons WITHOUT requiring the admin to first join as
 * a live observer. Server-side `toRoomSummary` builds this from
 * `room.players` and strips every role-specific field.
 */
export interface RoomSummary {
  code: string;
  phase: Phase;
  dayCount: number;
  playerCount: number;
  connectedPlayerCount: number;
  hostName: string | null;
  createdAt: number;
  lastActivityAt: number;
  players: PlayerPublic[];
}

/**
 * Server-side representation of an "admin observer" socket.
 * Admin observers are NOT regular players: they are not in room.players,
 * do not have a Player record, do not receive a roomView.self, and cannot
 * vote, act, or be targeted by game logic. They receive read-only
 * roomUpdate events for the room they have joined.
 */
export interface AdminObserver {
  socketId: string;
  roomCode: string;
  /** Identifier (e.g. "admin") used only for logging — never for auth. */
  label: string;
  joinedAt: number;
}
