<script setup lang="ts">
import { computed, onMounted, inject } from 'vue';
import { useGameStore } from '@/stores/game';
import { useSocket } from '@/composables/useSocket';
import { useNarrator } from '@/composables/useNarrator';
import { notify, escapeHtml } from '@/utils/helpers';
import type { WerewolvesGameConfig } from '@/types/config';
import type { StoredSession, RoomView } from '@shared/types';
import {
  NIGHT_TO_DAY_DELAY_MS,
  DAY_TO_NIGHT_DELAY_MS,
  POST_REVEAL_DELAY_MS,
  POST_MAYOR_DELAY_MS,
  POST_ARMOR_DELAY_MS
} from '@shared/constants';

import Landing from '@/components/Landing.vue';
import Lobby from '@/components/Lobby.vue';
import RoleReveal from '@/components/RoleReveal.vue';
import MayorPhase from '@/components/MayorPhase.vue';
import ArmorPhase from '@/components/ArmorPhase.vue';
import NightPhase from '@/components/NightPhase.vue';
import DayPhase from '@/components/DayPhase.vue';
import GameOver from '@/components/GameOver.vue';
import HunterOverlay from '@/components/overlays/HunterOverlay.vue';
import MayorSelectionOverlay from '@/components/overlays/MayorSelectionOverlay.vue';
import HeaderPanel from '@/components/panels/Header.vue';
import PlayersPanel from '@/components/panels/PlayersPanel.vue';
import LogsPanel from '@/components/panels/LogsPanel.vue';

interface Props {
  socketUrl?: string;
  socketPath?: string;
  assetsBasePath?: string;
  standalone?: boolean;
  // Hub integration props
  sessionId?: string;
  joinToken?: string;
  wsNamespace?: string;
  apiBaseUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  socketUrl: '',
  socketPath: '/socket.io',
  assetsBasePath: '/audio',
  standalone: true,
  sessionId: '',
  joinToken: '',
  wsNamespace: '',
  apiBaseUrl: ''
});

// Check for injected config from app.use() installation
const injectedConfig = inject<WerewolvesGameConfig>('werewolvesConfig', {});
const effectiveSocketUrl = props.wsNamespace
  ? (props.socketUrl || injectedConfig.socketUrl || '') + props.wsNamespace
  : props.socketUrl || injectedConfig.socketUrl || '';
const effectiveSocketPath = props.socketPath || injectedConfig.socketPath || '/socket.io';
const effectiveAssetsBasePath = normalizeAssetsBasePath(
  props.assetsBasePath || injectedConfig.assetsBasePath || '/audio'
);
const effectiveStandalone = props.wsNamespace
  ? false
  : (props.standalone ?? injectedConfig.standalone ?? true);
const effectiveSessionId = props.sessionId || '';
const effectiveJoinToken = props.joinToken || '';

function normalizeAssetsBasePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return '/audio';
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
const socket = useSocket({
  url: effectiveSocketUrl,
  path: effectiveSocketPath,
  auth: effectiveJoinToken || effectiveSessionId
    ? { joinToken: effectiveJoinToken, sessionId: effectiveSessionId }
    : undefined
});
const { enabled: narratorEnabled, unlocked: narratorUnlocked, unlockInProgress: narratorUnlockInProgress, toggle: toggleNarrator, resetNarrator, bindGestureUnlock } = useNarrator(effectiveAssetsBasePath);

const phase = computed(() => store.room?.phase || null);
const hasRoom = computed(() => !!store.room);
const hunterPrompt = computed(() => store.hunterPrompt && store.room?.awaitingHunterShot);
const mayorPrompt = computed(() => store.mayorPrompt && store.room?.awaitingMayorSelection);
const phaseTransition = computed(() => store.room?.phaseTransition || null);
const winner = computed(() => store.room?.winner || null);

// Transition display data
const ROLE_DETAILS: Record<string, { name: string }> = {
  werewolf: { name: 'Werewolf' },
  seer: { name: 'Seer' },
  hunter: { name: 'Hunter' },
  witch: { name: 'Witch' },
  armor: { name: 'Armor' },
  joker: { name: 'Joker' },
  guard: { name: 'Guard' },
  harlot: { name: 'Harlot' },
  villager: { name: 'Villager' }
};

const transitionMessages: Record<string, string> = {
  postReveal: 'The village falls asleep.',
  postMayor: 'Mayor elected. Preparing the next phase...',
  postArmor: 'Starting the first night...',
  nightToDay: 'Dawn is breaking. Day phase begins soon...',
  dayToNight: 'Night falls. Close your eyes...'
};

const transitionDurations: Record<string, number> = {
  postReveal: POST_REVEAL_DELAY_MS,
  postMayor: POST_MAYOR_DELAY_MS,
  postArmor: POST_ARMOR_DELAY_MS,
  nightToDay: NIGHT_TO_DAY_DELAY_MS,
  dayToNight: DAY_TO_NIGHT_DELAY_MS
};

const transitionMessage = computed(() => {
  if (!phaseTransition.value) return '';
  return transitionMessages[phaseTransition.value] || 'Next phase in a few seconds. Close your eyes if needed.';
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
  return { type: 'message' as const, message: store.room.lastDayMessage || 'No one was eliminated.' };
});

const hostSkipLabel = computed(() => {
  return phaseTransition.value === 'dayToNight' ? 'Start next round' : 'Skip transition';
});

const isHost = computed(() => store.room?.hostId === store.playerId);

// Pending actions
const mayorSelectionPending = computed(() =>
  store.room?.mayorSelectionPending && !store.room?.awaitingMayorSelection
);
const hunterShotPending = computed(() =>
  store.room?.hunterShotPending && !store.room?.awaitingHunterShot
);

function skipStep() {
  if (!store.playerId || !store.room) return;
  socket.emit('hostSkipStep', { roomCode: store.room.code, playerId: store.playerId });
}

function attemptResume(saved: StoredSession) {
  if (!saved.resumeToken) {
    notify('Saved session expired. Please rejoin the room.');
    store.clearSession();
    return;
  }
  socket.emit('resumePlayer', saved, (res) => {
    if (res && 'error' in res && res.error) {
      notify(res.error);
      store.clearSession();
    } else {
      store.setPlayer(saved.playerId, saved.name, saved.resumeToken);
      store.roomCode = saved.roomCode;
      socket.emit('requestState', { roomCode: saved.roomCode, playerId: saved.playerId });
    }
  });
}

onMounted(() => {
  // Bind gesture-based narrator unlock
  bindGestureUnlock();

  // Auto-resume session if available
  const saved = store.loadSession();
  if (saved?.resumeToken) {
    attemptResume(saved);
  }

  // Reconnect handler
  socket.on('connect', () => {
    if (store.playerId && store.roomCode && store.resumeToken) {
      attemptResume({
        roomCode: store.roomCode,
        playerId: store.playerId,
        name: store.playerName || '',
        resumeToken: store.resumeToken
      });
    }
  });

  // Room update handler
  socket.on('roomUpdate', (room) => {
    store.updateRoom(room);
  });

  // Hunter prompt
  socket.on('hunterPrompt', () => {
    store.hunterPrompt = true;
  });

  // Mayor prompt
  socket.on('mayorPrompt', () => {
    store.mayorPrompt = true;
  });

  // Wolf vote rejected
  socket.on('wolfVoteRejected', (payload) => {
    if (payload.reason === 'already_voted') {
      notify('You already voted.');
    }
  });
});
</script>

<template>
  <div class="werewolves-root" :class="{ app: effectiveStandalone }">
    <!-- Landing page (no room) -->
    <Landing v-if="!hasRoom" :socket="socket" />

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
                  {{ entry.name }} ({{ ROLE_DETAILS[entry.role || 'villager']?.name || entry.role || 'Unknown' }})
                </li>
              </ul>
            </template>
            <p v-else>{{ dayResults.message }}</p>
          </template>
          <button v-if="isHost" id="host-skip-btn" type="button" @click="skipStep">
            {{ hostSkipLabel }}
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
