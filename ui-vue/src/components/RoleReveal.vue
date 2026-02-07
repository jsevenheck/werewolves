<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { notify } from '../utils/helpers';
import type { TypedSocket } from '../composables/useSocket';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerId } = storeToRefs(store);

const ROLE_DETAILS: Record<string, { name: string }> = {
  werewolf: { name: 'Werewolf' },
  seer: { name: 'Seer' },
  hunter: { name: 'Hunter' },
  witch: { name: 'Witch' },
  armor: { name: 'Armor' },
  joker: { name: 'Joker' },
  guard: { name: 'Guard' },
  harlot: { name: 'Harlot' },
  villager: { name: 'Villager' },
};

const players = computed(() => room.value?.players ?? []);
const self = computed(() => players.value.find((p) => p.id === playerId.value) || null);
const selfRole = computed(() => self.value?.role || null);
const info = computed(() => (selfRole.value ? ROLE_DETAILS[selfRole.value] : null));
const readyCount = computed(() => players.value.filter((p) => p.connected && p.ready).length);
const totalCount = computed(() => players.value.filter((p) => p.connected).length);
const isSelfReady = computed(() => self.value?.ready ?? false);
const isHost = computed(() => room.value?.hostId === playerId.value);
const allReady = computed(() => readyCount.value === totalCount.value);

let readyButtonTimeout: number | null = null;
const readyDisabled = ref(false);

onBeforeUnmount(() => {
  if (readyButtonTimeout) {
    clearTimeout(readyButtonTimeout);
  }
});

function markReady() {
  if (readyDisabled.value || !playerId.value || !room.value) return;
  readyDisabled.value = true;

  readyButtonTimeout = window.setTimeout(() => {
    if (readyDisabled.value) {
      readyDisabled.value = false;
      notify('Failed to mark you as ready. Please try again.');
    }
    readyButtonTimeout = null;
  }, 10000);

  props.socket.emit('markReady', { roomCode: room.value.code, playerId: playerId.value }, (res) => {
    if (readyButtonTimeout) {
      clearTimeout(readyButtonTimeout);
      readyButtonTimeout = null;
    }
    if (res && 'error' in res && res.error) {
      notify(res.error);
      readyDisabled.value = false;
    }
  });
}

function continueAfterReveal() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('continueAfterReveal', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>Your Role</h2>
    <p v-if="info">Tap "Reveal Role" to view your role.</p>
    <p v-else>Waiting for assignment...</p>

    <template v-if="isHost && !isSelfReady">
      <button id="ready-btn" :disabled="readyDisabled" @click="markReady">I'm Ready</button>
    </template>
    <template v-else-if="isHost">
      <button id="continue-btn" :disabled="!allReady" @click="continueAfterReveal">Continue</button>
    </template>
    <template v-else-if="!isSelfReady">
      <button id="ready-btn" :disabled="readyDisabled" @click="markReady">I'm Ready</button>
    </template>
    <p v-else style="color: #4ade80">You are ready. Waiting for others...</p>

    <p>Players ready: {{ readyCount }} / {{ totalCount }}</p>
  </section>
</template>
