<script setup lang="ts">
import { computed, ref } from 'vue';
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

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === playerId.value);
const isArmor = computed(
  () => self.value?.role === 'armor' && self.value.alive && !room.value?.loversAssigned
);

const alivePlayers = computed(() => {
  if (!room.value || !self.value) return [];
  return room.value.players.filter((p) => p.alive && p.id !== self.value!.id);
});

const loverA = ref('');
const loverB = ref('');

function submitArmor() {
  if (!loverA.value || !loverB.value || loverA.value === loverB.value) {
    notify('Choose two distinct Lovers.');
    return;
  }
  if (!playerId.value || !room.value) return;
  props.socket.emit('submitArmor', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targets: [loverA.value, loverB.value],
  });
}

function skipArmor() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('hostSkipStep', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room" class="panel">
    <template v-if="isArmor">
      <h2>Choose Lovers</h2>
      <form id="armor-form" class="actions" @submit.prevent="submitArmor">
        <label>
          <span>Lover A</span>
          <select v-model="loverA" name="loverA" required>
            <option value="">Select player</option>
            <option v-for="player in alivePlayers" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <label>
          <span>Lover B</span>
          <select v-model="loverB" name="loverB" required>
            <option value="">Select player</option>
            <option v-for="player in alivePlayers" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">Link Lovers</button>
      </form>
    </template>
    <template v-else>
      <h2>Armor is working</h2>
      <p>The Armor is selecting two Lovers in secret.</p>
    </template>

    <div v-if="isHost" class="actions host-actions">
      <button id="skip-armor" type="button" @click="skipArmor">Skip armor step</button>
    </div>
  </section>
</template>
