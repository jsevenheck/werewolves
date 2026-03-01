<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { ROLE_DETAILS } from '../../utils/roleDetails';
import { notify } from '../../utils/helpers';
import type { TypedSocket } from '../../composables/useSocket';

interface Props {
  socket?: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerId } = storeToRefs(store);

const players = computed(() => room.value?.players || []);
const isHost = computed(() => room.value?.hostId === playerId.value);
const canKick = computed(() => isHost.value && room.value?.phase === 'lobby');

function kickPlayer(targetId: string) {
  if (!props.socket || !playerId.value || !room.value) return;
  props.socket.emit(
    'kickPlayer',
    { roomCode: room.value.code, playerId: playerId.value, targetId },
    (res) => {
      if (res && 'error' in res && res.error) {
        notify(res.error);
      }
    }
  );
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>Players ({{ players.length }})</h2>
    <div class="players-list">
      <div
        v-for="player in players"
        :key="player.id"
        class="player-card"
        :class="{ dead: !player.alive }"
      >
        <div style="display: flex; justify-content: space-between; align-items: center">
          <strong>{{ player.name }}</strong>
          <button
            v-if="canKick && player.id !== playerId"
            type="button"
            style="
              font-size: 0.75rem;
              padding: 0.15rem 0.5rem;
              background: transparent;
              border: 1px solid #f87171;
              color: #f87171;
            "
            @click="kickPlayer(player.id)"
          >
            Kick
          </button>
        </div>
        <div
          style="
            margin-top: 0.35rem;
            font-size: 0.9rem;
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
          "
        >
          <span v-if="player.isHost" class="tag">Host</span>
          <span
            v-if="room.mayorId === player.id"
            class="tag"
            style="border-color: #fbbf24; color: #fbbf24"
            >Mayor</span
          >
          <span v-if="!player.connected" class="tag" style="border-color: #fbbf24; color: #fbbf24"
            >Disconnected</span
          >
          <span
            v-if="(!player.alive || room.phase === 'ended') && player.role"
            class="tag"
            style="border-color: #38bdf8; color: #38bdf8"
          >
            {{ ROLE_DETAILS[player.role]?.name || player.role }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
