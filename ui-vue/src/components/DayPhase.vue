<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';
import { getPlayerName, notify } from '@/utils/helpers';
import type { TypedSocket } from '@/composables/useSocket';

const ROLE_DETAILS: Record<string, { name: string }> = {
  werewolf: { name: 'Werewolf' },
  seer: { name: 'Seer' },
  hunter: { name: 'Hunter' },
  witch: { name: 'Witch' },
  armor: { name: 'Armor' },
  joker: { name: 'Joker' },
  guard: { name: 'Guard' },
  harlot: { name: 'Harlot' },
  villager: { name: 'Villager' }
};

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerId, pendingVote } = storeToRefs(store);

const selectedTarget = ref('');

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === playerId.value);
const lastNightDeaths = computed(() => room.value?.lastNightDeaths ?? []);
const dayVoteResolved = computed(() => room.value?.dayVoteResolved ?? false);
const lastDayDeaths = computed(() => room.value?.lastDayDeaths ?? []);
const lastDayMessage = computed(() => room.value?.lastDayMessage ?? null);
const awaitingActions = computed(() => {
  return !!room.value?.awaitingHunterShot || !!room.value?.awaitingMayorSelection;
});
const yourVote = computed(() => room.value?.voteState?.yourVote);
const hasVoted = computed(() => yourVote.value !== undefined);
const submitted = computed(() => room.value?.voteState?.submitted || 0);
const required = computed(() => room.value?.voteState?.required || 0);
const isRevote = computed(() => !!room.value?.voteState?.revoteFromTie);
const showVoteProgress = computed(() => required.value > 0 && submitted.value < required.value);

const eligible = computed(() => {
  if (!room.value) return [];
  if (room.value.voteState.revoteFromTie) {
    return room.value.players.filter((p) => room.value!.voteState.revoteFromTie?.includes(p.id));
  }
  return room.value.players.filter((p) => p.alive);
});

const filtered = computed(() => {
  return eligible.value.filter((player) => player.id !== playerId.value && player.alive);
});

function onSelectChange() {
  const selected = selectedTarget.value;
  store.pendingVote = selected === '__abstain__' ? null : (selected || null);
}

function submitVote() {
  if (!room.value || !playerId.value) {
    notify('Unable to submit vote: missing player state.');
    return;
  }
  const normalized = selectedTarget.value === '__abstain__' ? null : (selectedTarget.value || null);
  store.pendingVote = normalized;
  props.socket.emit('submitDayVote', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId: normalized
  });
}

function endVoting() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('hostFinalizeDayVote', { roomCode: room.value.code, playerId: playerId.value });
}

function proceedToNight() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('hostProceedToNight', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>Day {{ room.dayCount }}</h2>

    <h3>Night Report</h3>
    <template v-if="lastNightDeaths.length">
      <ul>
        <li v-for="(entry, i) in lastNightDeaths" :key="i">
          {{ entry.name }} ({{ ROLE_DETAILS[entry.role || 'villager']?.name || entry.role }})
        </li>
      </ul>
    </template>
    <p v-else>No one died last night.</p>

    <h3>Vote to eliminate</h3>
    <template v-if="self?.alive">
      <template v-if="hasVoted">
        <p v-if="yourVote === null" style="color:#4ade80;">Vote submitted: Abstain.</p>
        <p v-else style="color:#4ade80;">Vote submitted: {{ yourVote ? getPlayerName(room, yourVote) : '' }}.</p>
        <small v-if="showVoteProgress">{{ submitted }} / {{ required }} votes submitted.</small>
      </template>
      <template v-else>
        <form id="vote-form" class="actions" @submit.prevent="submitVote">
          <p v-if="isRevote">Revote among tied players.</p>
          <label>
            <span>Choose someone to eliminate</span>
            <select
              v-model="selectedTarget"
              name="target"
              required
              @change="onSelectChange"
            >
              <option value="">Select a player</option>
              <option value="__abstain__" :selected="pendingVote === null">Abstain</option>
              <option
                v-for="player in filtered"
                :key="player.id"
                :value="player.id"
                :selected="pendingVote === player.id"
              >
                {{ player.name }}
              </option>
            </select>
          </label>
          <button type="submit" id="vote-submit" :disabled="!selectedTarget">Submit vote</button>
          <small v-if="showVoteProgress">{{ submitted }} / {{ required }} votes submitted.</small>
        </form>
      </template>
    </template>
    <p v-else>You are dead and cannot vote.</p>

    <!-- Vote resolved state - show result and wait for host to proceed -->
    <template v-if="dayVoteResolved">
      <div class="vote-result">
        <template v-if="lastDayDeaths.length">
          <p v-for="(death, i) in lastDayDeaths" :key="i">
            {{ death.name }} ({{ ROLE_DETAILS[death.role || 'villager']?.name || death.role }}) was eliminated.
          </p>
        </template>
        <p v-else-if="lastDayMessage">{{ lastDayMessage }}</p>
      </div>
    </template>

    <div v-if="isHost" class="actions host-actions">
      <button v-if="!dayVoteResolved" id="end-vote-btn" type="button" @click="endVoting">End Voting</button>
      <button v-if="dayVoteResolved && !awaitingActions" id="proceed-to-night-btn" type="button" @click="proceedToNight">Proceed to Night</button>
    </div>
  </section>
</template>
