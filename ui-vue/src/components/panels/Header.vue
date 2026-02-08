<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { formatPhase } from '../../utils/helpers';
import type { TypedSocket } from '../../composables/useSocket';

interface Props {
  socket: TypedSocket;
  narratorEnabled: boolean;
  narratorUnlocked: boolean;
  narratorUnlockInProgress: boolean;
  onToggleNarrator: () => void;
  onResetNarrator: () => void;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerName, roleVisible } = storeToRefs(store);

import { ROLE_DETAILS } from '../../utils/roleDetails';

const self = computed(() => room.value?.self || null);
const detail = computed(() => (self.value?.role ? ROLE_DETAILS[self.value.role] : null));
const seerResult = computed(() => room.value?.seerResult || null);

const phaseText = computed(() => (room.value ? formatPhase(room.value) : ''));
const narratorLabel = computed(() => {
  return props.narratorEnabled ? 'On' : 'Off';
});

function toggleRole() {
  store.toggleRole();
}

function leaveRoom() {
  if (store.roomCode && store.playerId) {
    props.socket.emit('leaveRoom', { roomCode: store.roomCode, playerId: store.playerId });
  }
  props.onResetNarrator();
  store.resetState();
  store.clearSession();
}
</script>

<template>
  <section v-if="room" class="panel">
    <div style="display: flex; flex-direction: column; gap: 0.5rem">
      <div
        style="
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: center;
          justify-content: space-between;
        "
      >
        <div>
          <h1>Room {{ room.code }}</h1>
          <p>Phase: {{ phaseText }}</p>
        </div>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center">
          <span class="tag">You: {{ playerName || 'Unknown' }}</span>
          <span v-if="self?.alive" class="tag" style="border-color: #4ade80; color: #4ade80"
            >Alive</span
          >
          <span v-else class="tag" style="border-color: #ef4444; color: #ef4444">Dead</span>
          <button v-if="self?.role" id="toggle-role" type="button" @click="toggleRole">
            {{ roleVisible ? 'Hide Role' : 'Reveal Role' }}
          </button>
          <button
            id="toggle-narrator"
            type="button"
            :disabled="narratorUnlockInProgress"
            @click="onToggleNarrator"
          >
            Narrator: {{ narratorLabel }}
          </button>
          <button id="leave-room" type="button" @click="leaveRoom">Leave Game</button>
        </div>
      </div>
      <div
        v-if="self?.role && roleVisible"
        class="role-card"
        :style="{ borderColor: detail?.color || '#f8fafc', color: detail?.color || '#f8fafc' }"
      >
        <strong>{{ detail?.name || self.role }}</strong>
        <p>{{ detail?.description || '' }}</p>
        <p v-if="room.loverName">Lover: {{ room.loverName }}</p>
        <p v-if="self.role === 'seer' && seerResult">
          Last vision: {{ seerResult.name }} is {{ seerResult.result }}.
        </p>
      </div>
    </div>
  </section>
</template>
