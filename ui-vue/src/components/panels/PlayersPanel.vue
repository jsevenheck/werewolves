<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { ROLE_DETAILS } from '../../utils/roleDetails';

const store = useGameStore();
const { room } = storeToRefs(store);

const players = computed(() => room.value?.players || []);
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
        <strong>{{ player.name }}</strong>
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
