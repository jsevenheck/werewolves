<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { useGameI18n } from '../composables/useGameI18n';
import { notify } from '../utils/helpers';
import { MIN_PLAYERS } from '@shared/constants';
import type { TypedSocket } from '../composables/useSocket';

const SINGLETON_ROLES = new Set(['seer', 'witch', 'armor', 'guard', 'harlot']);

const isSingletonRole = (role: string): boolean => {
  return SINGLETON_ROLES.has(role);
};

interface Props {
  socket: TypedSocket;
}

const ROLE_CONFIG_DEBOUNCE_MS = 400;

const props = defineProps<Props>();
const store = useGameStore();
const { t, localizeError, roleName, passiveRoleName } = useGameI18n();
const { room, playerId } = storeToRefs(store);

const canStart = computed(() => playerId.value === room.value?.hostId);
const minPlayers = computed(() => room.value?.minPlayers ?? MIN_PLAYERS);
const disconnectedCount = computed(
  () => (room.value?.players ?? []).filter((p) => !p.connected).length
);
const hasDisconnectedPlayers = computed(() => disconnectedCount.value > 0);
// Host cannot start while any player is disconnected: they could not receive
// a role or mark ready. The host should wait for reconnect or kick them
// (lobby kicks are reversible; the player can rejoin via the room code).
const startBlocked = computed(() => !canStart.value || hasDisconnectedPlayers.value);
const roleConfig = computed(
  () =>
    room.value?.roleConfig || {
      werewolf: 2,
      seer: 1,
      hunter: 1,
      witch: 1,
      armor: 1,
      joker: 1,
      guard: 0,
      harlot: 0,
    }
);
const passiveRoleConfig = computed(() => room.value?.passiveRoleConfig || { mayor: true });
const discussionTimerSeconds = computed(() => room.value?.discussionTimerSeconds ?? 60);
const totals = computed(() =>
  Object.values(roleConfig.value).reduce((sum, count) => sum + count, 0)
);
const playersCount = computed(() => room.value?.players.length || 0);
const villagerSlots = computed(() => Math.max(playersCount.value - totals.value, 0));
const needsAdjust = computed(() => totals.value > playersCount.value);

// Local state for role config inputs (host only)
const localRoleConfig = ref<Record<string, number>>({});
const localPassiveConfig = ref<Record<string, boolean>>({});
const localDiscussionTimer = ref<number>(room.value?.discussionTimerSeconds ?? 60);

let debounceTimer: number | null = null;

onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
});

function emitConfig() {
  if (!canStart.value || !playerId.value) return;
  const config: Record<string, number | Record<string, boolean>> & {
    passiveRoles?: Record<string, boolean>;
  } = {};
  for (const [role, count] of Object.entries(localRoleConfig.value)) {
    (config as Record<string, number>)[role] = count;
  }
  if (Object.keys(localPassiveConfig.value).length) {
    config.passiveRoles = { ...localPassiveConfig.value };
  }
  if (localDiscussionTimer.value !== undefined) {
    config.discussionTimerSeconds = localDiscussionTimer.value;
  }
  props.socket.emit('updateRoleConfig', {
    roomCode: room.value!.code,
    playerId: playerId.value,
    config,
  });
}

function onRoleChange(role: string, value: number) {
  if (isSingletonRole(role)) {
    value = Math.min(value, 1);
  }
  localRoleConfig.value[role] = value;
  emitConfig();
}

function onRoleInput(role: string, value: number) {
  if (isSingletonRole(role)) {
    value = Math.min(value, 1);
  }
  localRoleConfig.value[role] = value;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    emitConfig();
    debounceTimer = null;
  }, ROLE_CONFIG_DEBOUNCE_MS);
}

function onPassiveRoleChange(role: string, checked: boolean) {
  localPassiveConfig.value[role] = checked;
  emitConfig();
}

function onDiscussionTimerChange(value: number) {
  localDiscussionTimer.value = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  emitConfig();
}

function startGame() {
  if (!playerId.value) return;
  props.socket.emit(
    'startGame',
    { roomCode: room.value!.code, playerId: playerId.value },
    (res) => {
      if (res && 'error' in res && res.error) {
        notify(localizeError(res));
      }
    }
  );
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>{{ t('lobby.title') }}</h2>
    <p :data-room-code="room.code">{{ t('lobby.shareCode', { code: room.code }) }}</p>
    <form v-if="canStart" id="role-config" class="actions" @submit.prevent>
      <label v-for="[role, count] in Object.entries(roleConfig)" :key="role" class="role-row">
        <span>
          {{ roleName(role) }}
          <span v-if="isSingletonRole(role)" class="role-hint">{{ t('lobby.maxOne') }}</span>
        </span>
        <input
          type="number"
          class="role-input"
          :data-role="role"
          min="0"
          :max="isSingletonRole(role) ? 1 : undefined"
          :value="count"
          @change="onRoleChange(role, Number(($event.target as HTMLInputElement).value))"
          @input="onRoleInput(role, Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <div class="passive-roles">
        <h3>{{ t('lobby.passiveRoles') }}</h3>
        <div class="passive-role-list">
          <div
            v-for="[role, enabled] in Object.entries(passiveRoleConfig)"
            :key="role"
            class="toggle"
          >
            <span>{{ passiveRoleName(role) }}</span>
            <span
              class="toggle-control"
              role="switch"
              :aria-checked="enabled"
              tabindex="0"
              @click="onPassiveRoleChange(role, !enabled)"
              @keydown.enter.prevent="onPassiveRoleChange(role, !enabled)"
              @keydown.space.prevent="onPassiveRoleChange(role, !enabled)"
            >
              <span class="toggle-track" aria-hidden="true"></span>
            </span>
          </div>
        </div>
      </div>
      <div class="discussion-timer-config">
        <label class="discussion-timer-row">
          <span class="discussion-timer-label">{{ t('lobby.discussionTimer') }}</span>
          <input
            type="number"
            class="discussion-timer-input"
            data-role="discussionTimer"
            min="0"
            max="600"
            :value="discussionTimerSeconds"
            @change="onDiscussionTimerChange(Number(($event.target as HTMLInputElement).value))"
            @input="onDiscussionTimerChange(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
    </form>
    <p v-else>{{ t('lobby.waitingForHost') }}</p>
    <p class="role-summary">
      {{
        t('lobby.roleSummary', { total: totals, players: playersCount, villagers: villagerSlots })
      }}
    </p>
    <p>{{ t('lobby.minimumPlayers', { count: minPlayers }) }}</p>
    <p v-if="needsAdjust" style="color: #fca5a5">{{ t('lobby.tooManyRoles') }}</p>
    <p v-if="hasDisconnectedPlayers" style="color: #fbbf24">
      {{ t('lobby.disconnectedWarning', { count: disconnectedCount }) }}
    </p>
    <button id="start-game" :disabled="startBlocked" @click="startGame">
      {{ t('lobby.startGame') }}
    </button>
  </section>
</template>
