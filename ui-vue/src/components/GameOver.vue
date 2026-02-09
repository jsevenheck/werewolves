<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { notify } from '../utils/helpers';
import type { TypedSocket } from '../composables/useSocket';

import { ROLE_DETAILS } from '../utils/roleDetails';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerId } = storeToRefs(store);

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === self.value?.id);
const winner = computed(() => room.value?.winner || null);
const players = computed(() => room.value?.players ?? []);

function restartGame() {
  if (!room.value || !playerId.value) return;
  if (room.value.hostId !== playerId.value) {
    notify('Only the host can restart the game.');
    return;
  }
  if (room.value.phase !== 'ended') {
    notify('The game can only be restarted after it has ended.');
    return;
  }
  props.socket.emit('restartGame', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room && winner" class="panel">
    <h2>Game Over</h2>
    <p>{{ winner.reason }}</p>
    <p><strong>Winner:</strong> {{ winner.team.toUpperCase() }}</p>
    <button v-if="isHost" id="restart-btn" type="button" @click="restartGame">
      Return to lobby
    </button>
    <div style="margin-top: 1rem">
      <div v-for="player in players" :key="player.id">
        {{ player.name }} -
        {{ ROLE_DETAILS[player.role || 'villager']?.name || player.role || 'Unknown' }}
      </div>
    </div>
  </section>
</template>
