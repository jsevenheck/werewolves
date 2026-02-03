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
  return (room.value?.players || []).filter((p) => p.alive && p.id !== playerId.value);
});

function submitSelection() {
  if (!selectedTarget.value || !playerId.value) return;
  props.socket.emit('selectMayor', {
    roomCode: roomCode.value,
    playerId: playerId.value,
    targetId: selectedTarget.value,
  });
  store.mayorPrompt = false;
}
</script>

<template>
  <div id="mayor-overlay" class="mayor-overlay">
    <div class="panel">
      <h2>Select New Mayor</h2>
      <p>As the dying Mayor, you must select your successor.</p>
      <form id="mayor-form" class="actions" @submit.prevent="submitSelection">
        <label>
          <span>Choose the new Mayor</span>
          <select v-model="selectedTarget" name="target" required>
            <option value="">Select player</option>
            <option v-for="player in targets" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">Appoint Mayor</button>
      </form>
    </div>
  </div>
</template>
