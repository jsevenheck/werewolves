<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';
import type { TypedSocket } from '@/composables/useSocket';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, roomCode, playerId } = storeToRefs(store);

const selectedTarget = ref('');
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const hunterShotEndsAt = computed(() => room.value?.hunterShotEndsAt ?? null);
const remainingSeconds = computed(() => {
  if (!hunterShotEndsAt.value) return null;
  const remainingMs = hunterShotEndsAt.value - now.value;
  return Math.max(0, Math.ceil(remainingMs / 1000));
});

function formatSeconds(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const padded = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mins}:${padded}`;
}

const targets = computed(() => {
  return (room.value?.players || []).filter((p) => p.alive);
});

function submitShot() {
  if (!selectedTarget.value || !playerId.value) return;
  props.socket.emit('hunterShoot', {
    roomCode: roomCode.value,
    playerId: playerId.value,
    targetId: selectedTarget.value,
  });
  store.hunterPrompt = false;
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<template>
  <div id="hunter-overlay" class="hunter-overlay">
    <div class="panel overlay-panel">
      <div v-if="remainingSeconds !== null" class="overlay-timer">
        {{ formatSeconds(remainingSeconds) }}
      </div>
      <h2>Hunter's Last Shot</h2>
      <form id="hunter-form" class="actions" @submit.prevent="submitShot">
        <label>
          <span>Choose who to shoot</span>
          <select v-model="selectedTarget" name="target" required>
            <option value="">Select player</option>
            <option v-for="player in targets" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">Fire</button>
      </form>
    </div>
  </div>
</template>
