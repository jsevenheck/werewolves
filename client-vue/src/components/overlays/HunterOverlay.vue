<script setup lang="ts">
import { ref, computed } from 'vue';
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

const targets = computed(() => {
  return (room.value?.players || []).filter((p) => p.alive);
});

function submitShot() {
  if (!selectedTarget.value || !playerId.value) return;
  props.socket.emit('hunterShoot', {
    roomCode: roomCode.value,
    playerId: playerId.value,
    targetId: selectedTarget.value
  });
  store.hunterPrompt = false;
}
</script>

<template>
  <div class="hunter-overlay">
    <div class="panel">
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
