<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { notify } from '../utils/helpers';
import { useGameI18n } from '../composables/useGameI18n';
import type { TypedSocket } from '../composables/useSocket';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { t, localizeMessage, roleName, teamName } = useGameI18n();
const { room, playerId } = storeToRefs(store);

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === self.value?.id);
const winner = computed(() => room.value?.winner || null);
const players = computed(() => room.value?.players ?? []);

function restartGame() {
  if (!room.value || !playerId.value) return;
  if (room.value.hostId !== playerId.value) {
    notify(t('gameOver.onlyHostRestart'));
    return;
  }
  if (room.value.phase !== 'ended') {
    notify(t('gameOver.restartOnlyEnded'));
    return;
  }
  props.socket.emit('restartGame', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room && winner" class="panel">
    <h2>{{ t('gameOver.title') }}</h2>
    <p>{{ localizeMessage(winner.reasonMessage, winner.reason) }}</p>
    <p>
      <strong>{{ t('gameOver.winner') }}</strong> {{ teamName(winner.team) }}
    </p>
    <button v-if="isHost" id="restart-btn" type="button" @click="restartGame">
      {{ t('gameOver.returnToLobby') }}
    </button>
    <div style="margin-top: 1rem">
      <div v-for="player in players" :key="player.id">
        {{ player.name }} -
        {{ roleName(player.role || 'villager') }}
      </div>
    </div>
  </section>
</template>
