<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { useGameI18n } from '../../composables/useGameI18n';
import type { TypedSocket } from '../../composables/useSocket';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { t } = useGameI18n();
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
      <h2>{{ t('overlays.mayorTitle') }}</h2>
      <p>{{ t('overlays.mayorDescription') }}</p>
      <form id="mayor-form" class="actions" @submit.prevent="submitSelection">
        <label>
          <span>{{ t('overlays.mayorChoose') }}</span>
          <select v-model="selectedTarget" name="target" required>
            <option value="">{{ t('common.selectPlayer') }}</option>
            <option v-for="player in targets" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">{{ t('overlays.mayorAppoint') }}</button>
      </form>
    </div>
  </div>
</template>
