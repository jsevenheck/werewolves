<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';
import { getPlayerName, notify } from '@/utils/helpers';
import type { TypedSocket } from '@/composables/useSocket';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerId, pendingMayorVote } = storeToRefs(store);

const selectedTarget = ref('');

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === playerId.value);
const yourVote = computed(() => room.value?.voteState?.yourVote);
const hasVoted = computed(() => yourVote.value !== undefined);

const eligible = computed(() => {
  if (!room.value) return [];
  if (room.value.voteState.revoteFromTie) {
    return room.value.players.filter((p) => room.value!.voteState.revoteFromTie?.includes(p.id));
  }
  return room.value.players.filter((p) => p.alive);
});

const submitted = computed(() => room.value?.voteState?.submitted || 0);
const required = computed(() => room.value?.voteState?.required || 0);
const isRevote = computed(() => !!room.value?.voteState?.revoteFromTie);

function onSelectChange() {
  store.pendingMayorVote = selectedTarget.value || undefined;
}

function submitVote() {
  if (!selectedTarget.value || !playerId.value || !room.value) {
    notify('Unable to submit vote: missing player state.');
    return;
  }
  store.pendingMayorVote = selectedTarget.value;
  props.socket.emit('submitMayorVote', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId: selectedTarget.value
  });
}

function endVoting() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('hostFinalizeMayorVote', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>Mayor Election</h2>
    <p>Vote for the first Mayor. The Mayor's vote will break ties during day voting.</p>

    <template v-if="self?.alive">
      <template v-if="hasVoted">
        <p v-if="yourVote === null" style="color:#4ade80;">Vote submitted: Abstain.</p>
        <p v-else style="color:#4ade80;">Vote submitted: {{ yourVote ? getPlayerName(room, yourVote) : '' }}.</p>
        <small>{{ submitted }} / {{ required }} votes submitted.</small>
      </template>
      <template v-else>
        <form id="mayor-vote-form" class="actions" @submit.prevent="submitVote">
          <p v-if="isRevote">Revote among tied candidates.</p>
          <label>
            <span>Choose the Mayor</span>
            <select
              v-model="selectedTarget"
              name="target"
              required
              @change="onSelectChange"
            >
              <option value="">Select a player</option>
              <option
                v-for="player in eligible"
                :key="player.id"
                :value="player.id"
              >
                {{ player.name }}
              </option>
            </select>
          </label>
          <button type="submit" id="mayor-vote-submit" :disabled="!selectedTarget">Submit vote</button>
          <small>{{ submitted }} / {{ required }} votes submitted.</small>
        </form>
      </template>
    </template>
    <p v-else>You are dead and cannot vote.</p>

    <div v-if="isHost" class="actions host-actions">
      <button id="end-mayor-vote-btn" type="button" @click="endVoting">End Mayor Voting</button>
    </div>
  </section>
</template>
