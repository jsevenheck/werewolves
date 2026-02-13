<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, inject } from 'vue';
import { useGameStore } from './stores/game';
import { useSocket } from './composables/useSocket';
import { useNarrator } from './composables/useNarrator';
import { notify } from './utils/helpers';
import type { GameComponentProps } from './types/config';
import type { StoredSession } from '@shared/types';
import {
  NIGHT_TO_DAY_DELAY_MS,
  DAY_TO_NIGHT_DELAY_MS,
  POST_REVEAL_DELAY_MS,
  POST_MAYOR_DELAY_MS,
  POST_ARMOR_DELAY_MS,
} from '@shared/constants';

import Landing from './components/Landing.vue';
import Lobby from './components/Lobby.vue';
import RoleReveal from './components/RoleReveal.vue';
import MayorPhase from './components/MayorPhase.vue';
import ArmorPhase from './components/ArmorPhase.vue';
import NightPhase from './components/NightPhase.vue';
import DayPhase from './components/DayPhase.vue';
import GameOver from './components/GameOver.vue';
import HunterOverlay from './components/overlays/HunterOverlay.vue';
import MayorSelectionOverlay from './components/overlays/MayorSelectionOverlay.vue';
import HeaderPanel from './components/panels/Header.vue';
import PlayersPanel from './components/panels/PlayersPanel.vue';
import LogsPanel from './components/panels/LogsPanel.vue';

interface Props {
  socketUrl?: string;
  socketPath?: string;
  assetsBasePath?: string;
  standalone?: boolean;
  // Hub integration props
  playerId?: string;
  playerName?: string;
  sessionId?: string;
  joinToken?: string;
  wsNamespace?: string;
  apiBaseUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  socketUrl: '',
  socketPath: '/socket.io',
  playerId: '',
  playerName: '',
  sessionId: '',
  joinToken: '',
  wsNamespace: '',
  apiBaseUrl: '',
});

// Check for injected config from host app (app.provide)
const injectedConfig = inject<Partial<GameComponentProps>>('werewolvesConfig', {});
const effectiveWsNamespace = props.wsNamespace || injectedConfig.wsNamespace || '';
const effectiveSocketUrl = effectiveWsNamespace
  ? (props.socketUrl || injectedConfig.socketUrl || '') + effectiveWsNamespace
  : props.socketUrl || injectedConfig.socketUrl || '';
const effectiveSocketPath = props.socketPath || injectedConfig.socketPath || '/socket.io';
// Only use assetsBasePath if explicitly provided (for custom audio overrides).
// If not provided, narrator will use bundled audio instead of relying on host-served files.
const rawAssetsBasePath = props.assetsBasePath || injectedConfig.assetsBasePath;
const effectiveAssetsBasePath = rawAssetsBasePath
  ? normalizeAssetsBasePath(rawAssetsBasePath)
  : undefined;

console.log('[Werewolves Audio Debug] App Init', {
  propsAssetsBasePath: props.assetsBasePath,
  injectedAssetsBasePath: injectedConfig.assetsBasePath,
  effectiveAssetsBasePath
});

// Vue Boolean-casts a missing `standalone` prop to false, so the injected
// config must be checked first (it is undefined when no provide is present).
const effectiveStandalone = injectedConfig.standalone ?? props.standalone ?? !effectiveWsNamespace;
const effectivePlayerId = props.playerId || injectedConfig.playerId || '';
const effectivePlayerName = props.playerName || injectedConfig.playerName || '';
const effectiveSessionId = props.sessionId || injectedConfig.sessionId || '';
const effectiveJoinToken = props.joinToken || injectedConfig.joinToken || '';

function normalizeAssetsBasePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/\/+$/, '');
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  ) {
    return normalized;
  }
  const baseUrl = import.meta.env.BASE_URL || '/';
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const relative = normalized.replace(/^\/+/, '');
  return `${base}/${relative}`;
}

const store = useGameStore();
const authPayload: Record<string, string> = {};
if (effectiveJoinToken) {
  authPayload.joinToken = effectiveJoinToken;
  authPayload.token = effectiveJoinToken;
}
if (effectiveSessionId) authPayload.sessionId = effectiveSessionId;
if (effectivePlayerId) authPayload.playerId = effectivePlayerId;

const socket = useSocket({
  url: effectiveSocketUrl,
  path: effectiveSocketPath,
  auth: Object.keys(authPayload).length ? authPayload : undefined,
});
const {
  enabled: narratorEnabled,
  unlocked: narratorUnlocked,
  unlockInProgress: narratorUnlockInProgress,
  toggle: toggleNarrator,
  resetNarrator,
  bindGestureUnlock,
  cleanupNarrator,
} = useNarrator(effectiveAssetsBasePath);

const HUB_JOIN_TIMEOUT_MS = 10000;
const HUB_RETRY_DELAY_MS = 3000;
let hubRetryTimer: number | undefined;
let hubJoinTimeoutTimer: number | undefined;
const hubJoinError = ref<string | null>(null);
let hubFlowInProgress = false;

const phase = computed(() => store.room?.phase || null);
const hasRoom = computed(() => !!store.room);
const hunterPrompt = computed(() => store.hunterPrompt && store.room?.awaitingHunterShot);
const mayorPrompt = computed(() => store.mayorPrompt && store.room?.awaitingMayorSelection);
const phaseTransition = computed(() => store.room?.phaseTransition || null);
const winner = computed(() => store.room?.winner || null);
const mayorName = computed(() => {
  if (!store.room?.mayorId) return null;
  return store.room.players.find((player) => player.id === store.room?.mayorId)?.name ?? null;
});

import { ROLE_DETAILS } from './utils/roleDetails';

const transitionMessages: Record<string, string> = {
  postReveal: 'The village falls asleep.',
  postMayor: 'Mayor elected. Preparing the next phase...',
  postArmor: 'Starting the first night...',
  nightToDay: 'Dawn is breaking. Day phase begins soon...',
  dayToNight: 'Night falls. Close your eyes...',
};

const transitionDurations: Record<string, number> = {
  postReveal: POST_REVEAL_DELAY_MS,
  postMayor: POST_MAYOR_DELAY_MS,
  postArmor: POST_ARMOR_DELAY_MS,
  nightToDay: NIGHT_TO_DAY_DELAY_MS,
  dayToNight: DAY_TO_NIGHT_DELAY_MS,
};

const transitionMessage = computed(() => {
  if (!phaseTransition.value) return '';
  if (phaseTransition.value === 'postMayor') {
    return mayorName.value
      ? `Mayor elected: ${mayorName.value}. Preparing the next phase...`
      : transitionMessages.postMayor;
  }
  return (
    transitionMessages[phaseTransition.value] ||
    'Next phase in a few seconds. Close your eyes if needed.'
  );
});

const transitionDurationSeconds = computed(() => {
  if (!phaseTransition.value) return 0;
  return Math.round((transitionDurations[phaseTransition.value] ?? NIGHT_TO_DAY_DELAY_MS) / 1000);
});

const dayResults = computed(() => {
  if (phaseTransition.value !== 'dayToNight' || !store.room) return null;
  if (store.room.lastDayDeaths.length) {
    return { type: 'deaths' as const, deaths: store.room.lastDayDeaths };
  }
  return {
    type: 'message' as const,
    message: store.room.lastDayMessage || 'No one was eliminated.',
  };
});

const isHost = computed(() => store.room?.hostId === store.playerId);
const showHostSkip = computed(() => isHost.value && !!phaseTransition.value);

// Pending actions
const mayorSelectionPending = computed(
  () => store.room?.mayorSelectionPending && !store.room?.awaitingMayorSelection
);
const hunterShotPending = computed(
  () => store.room?.hunterShotPending && !store.room?.awaitingHunterShot
);

function skipStep() {
  if (!store.playerId || !store.room) return;
  socket.emit('hostSkipStep', { roomCode: store.room.code, playerId: store.playerId });
}

function attemptResume(saved: StoredSession): Promise<boolean> {
  return new Promise((resolve) => {
    if (!saved.resumeToken) {
      notify('Saved session expired. Please rejoin the room.');
      store.clearSession();
      resolve(false);
      return;
    }
    socket.emit('resumePlayer', saved, (res) => {
      if (res && 'error' in res && res.error) {
        notify(res.error);
        store.clearSession();
        resolve(false);
        return;
      }
      store.setPlayer(saved.playerId, saved.name, saved.resumeToken);
      store.roomCode = saved.roomCode;
      socket.emit('requestState', { roomCode: saved.roomCode, playerId: saved.playerId });
      resolve(true);
    });
  });
}

// Hub auto-join: emit autoJoinRoom so the server creates/locates the room
// keyed by sessionId.  Falls back to attemptResume on reconnects.
function hubAutoJoin(): Promise<boolean> {
  return new Promise((resolve) => {
    startHubJoinTimeout();
    socket.emit(
      'autoJoinRoom',
      {
        sessionId: effectiveSessionId,
        playerId: effectivePlayerId,
        name: effectivePlayerName || effectivePlayerId,
      },
      (res) => {
        if (!res || 'error' in res) {
          const message = res?.error ?? 'Failed to join room';
          hubJoinError.value = message;
          notify(message);
          resolve(false);
          return;
        }
        if (res.roomCode && res.playerId && res.resumeToken) {
          hubJoinError.value = null;
          store.setPlayer(res.playerId, effectivePlayerName || effectivePlayerId, res.resumeToken);
          store.roomCode = res.roomCode;
          socket.emit('requestState', { roomCode: res.roomCode, playerId: res.playerId });
          startHubJoinTimeout();
          resolve(true);
          return;
        }
        resolve(false);
      }
    );
  });
}

function clearHubTimers() {
  if (hubRetryTimer !== undefined) {
    clearTimeout(hubRetryTimer);
    hubRetryTimer = undefined;
  }
  if (hubJoinTimeoutTimer !== undefined) {
    clearTimeout(hubJoinTimeoutTimer);
    hubJoinTimeoutTimer = undefined;
  }
}

function startHubJoinTimeout() {
  if (hubJoinTimeoutTimer !== undefined) {
    clearTimeout(hubJoinTimeoutTimer);
  }
  hubJoinTimeoutTimer = window.setTimeout(() => {
    if (!store.room) {
      hubJoinError.value = 'Could not load game state. Please retry.';
    }
  }, HUB_JOIN_TIMEOUT_MS);
}

async function runHubConnectFlow() {
  if (hubFlowInProgress) return;
  hubFlowInProgress = true;
  hubJoinError.value = null;

  try {
    if (store.playerId && store.roomCode && store.resumeToken) {
      startHubJoinTimeout();
      const resumed = await attemptResume({
        roomCode: store.roomCode,
        playerId: store.playerId,
        name: store.playerName || '',
        resumeToken: store.resumeToken,
      });
      if (!resumed) {
        await hubAutoJoin();
      }
      return;
    }

    await hubAutoJoin();
  } finally {
    hubFlowInProgress = false;
  }
}

function retryHubJoin() {
  hubJoinError.value = null;
  if (socket.connected) {
    void runHubConnectFlow();
    return;
  }
  startHubJoinTimeout();
  socket.connect();
}

function onRoomUpdate(room: import('@shared/types').RoomView) {
  store.updateRoom(room);
  hubJoinError.value = null;
  clearHubTimers();
}

function onHunterPrompt() {
  store.hunterPrompt = true;
}

function onMayorPrompt() {
  store.mayorPrompt = true;
}

function onWolfVoteRejected(payload: { reason: string }) {
  if (payload.reason === 'already_voted') {
    notify('You already voted.');
  }
}

function onConnectHub() {
  void runHubConnectFlow();
}

function onConnectErrorHub() {
  if (!store.room) {
    hubJoinError.value = 'Connection failed. Please retry.';
  }
}

function onConnectStandalone() {
  if (store.playerId && store.roomCode && store.resumeToken) {
    void attemptResume({
      roomCode: store.roomCode,
      playerId: store.playerId,
      name: store.playerName || '',
      resumeToken: store.resumeToken,
    });
  }
}

onMounted(() => {
  // Bind gesture-based narrator unlock
  bindGestureUnlock();

  if (!effectiveStandalone && effectiveSessionId) {
    // Hub mode: auto-join on first connect, resume on reconnect
    if (socket.connected) {
      void runHubConnectFlow();
    }
    socket.on('connect', onConnectHub);
    socket.on('connect_error', onConnectErrorHub);

    // Retry hubAutoJoin if no room after a delay (guards against race conditions)
    hubRetryTimer = window.setTimeout(() => {
      if (!store.room && socket.connected) {
        void runHubConnectFlow();
      }
    }, HUB_RETRY_DELAY_MS);
  } else {
    // Standalone mode: restore saved session or wait for Landing interaction
    const saved = store.loadSession();
    if (saved?.resumeToken) {
      void attemptResume(saved);
    }

    socket.on('connect', onConnectStandalone);
  }

  socket.on('roomUpdate', onRoomUpdate);
  socket.on('hunterPrompt', onHunterPrompt);
  socket.on('mayorPrompt', onMayorPrompt);
  socket.on('wolfVoteRejected', onWolfVoteRejected);
});

onBeforeUnmount(() => {
  clearHubTimers();
  cleanupNarrator();
  socket.off('connect', onConnectHub);
  socket.off('connect', onConnectStandalone);
  socket.off('connect_error', onConnectErrorHub);
  socket.off('roomUpdate', onRoomUpdate);
  socket.off('hunterPrompt', onHunterPrompt);
  socket.off('mayorPrompt', onMayorPrompt);
  socket.off('wolfVoteRejected', onWolfVoteRejected);
});
</script>

<template>
  <div class="werewolves-root" :class="{ app: effectiveStandalone }">
    <!-- Standalone: show Landing when no room is active -->
    <Landing v-if="!hasRoom && effectiveStandalone" :socket="socket" />

    <!-- Hub: waiting for autoJoinRoom response -->
    <section v-else-if="!hasRoom" class="panel">
      <template v-if="!hubJoinError">
        <p>Connecting...</p>
      </template>
      <template v-else>
        <p>{{ hubJoinError }}</p>
        <button type="button" @click="retryHubJoin">Retry</button>
      </template>
    </section>

    <!-- In-game view -->
    <template v-else>
      <HeaderPanel
        :socket="socket"
        :narrator-enabled="narratorEnabled"
        :narrator-unlocked="narratorUnlocked"
        :narrator-unlock-in-progress="narratorUnlockInProgress"
        :on-toggle-narrator="toggleNarrator"
        :on-reset-narrator="resetNarrator"
      />

      <!-- Phase transition -->
      <template v-if="phaseTransition">
        <section class="panel">
          <h2>Transitioning...</h2>
          <p>{{ transitionMessage }}</p>
          <p>Duration: {{ transitionDurationSeconds }}s.</p>
          <template v-if="dayResults">
            <h3>Vote Results</h3>
            <template v-if="dayResults.type === 'deaths'">
              <ul>
                <li v-for="(entry, i) in dayResults.deaths" :key="i">
                  {{ entry.name }} ({{
                    ROLE_DETAILS[entry.role || 'villager']?.name || entry.role || 'Unknown'
                  }})
                </li>
              </ul>
            </template>
            <p v-else>{{ dayResults.message }}</p>
          </template>
          <button v-if="showHostSkip" id="host-skip-btn" type="button" @click="skipStep">
            Skip transition
          </button>
        </section>
      </template>

      <!-- Winner / Game Over -->
      <template v-else-if="winner">
        <GameOver :socket="socket" />
      </template>

      <!-- Active phases -->
      <template v-else>
        <Lobby v-if="phase === 'lobby'" :socket="socket" />
        <RoleReveal v-else-if="phase === 'roleReveal'" :socket="socket" />
        <MayorPhase v-else-if="phase === 'mayor'" :socket="socket" />
        <ArmorPhase v-else-if="phase === 'armor'" :socket="socket" />
        <NightPhase v-else-if="phase === 'night'" :socket="socket" />
        <DayPhase v-else-if="phase === 'day'" :socket="socket" />
      </template>

      <!-- Pending actions panels -->
      <section v-if="mayorSelectionPending" class="panel">
        <h2>Awaiting Mayor Selection</h2>
        <p>The dying Mayor is selecting their successor...</p>
        <button v-if="isHost" id="skip-mayor-selection" type="button" @click="skipStep">
          Skip Mayor Selection
        </button>
      </section>

      <section v-if="hunterShotPending" class="panel">
        <h2>Awaiting Hunter's Shot</h2>
        <p>The Hunter is choosing their final target...</p>
        <button v-if="isHost" id="skip-hunter-shot" type="button" @click="skipStep">
          Skip Hunter Shot
        </button>
      </section>

      <PlayersPanel />
      <LogsPanel />

      <!-- Overlays -->
      <Teleport to="body">
        <HunterOverlay v-if="hunterPrompt" :socket="socket" />
        <MayorSelectionOverlay v-if="mayorPrompt" :socket="socket" />
      </Teleport>
    </template>
  </div>
</template>
