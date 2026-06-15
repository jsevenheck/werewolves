<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { getPlayerName, notify } from '../utils/helpers';
import { useGameI18n } from '../composables/useGameI18n';
import type { TypedSocket } from '../composables/useSocket';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { t } = useGameI18n();
const { room, playerId } = storeToRefs(store);

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
const showVoteProgress = computed(() => required.value > 0 && submitted.value < required.value);

function onSelectChange() {
  store.pendingMayorVote = selectedTarget.value || undefined;
}

function submitVote() {
  if (!selectedTarget.value || !playerId.value || !room.value) {
    notify(t('notifications.unableSubmitMissing'));
    return;
  }
  store.pendingMayorVote = selectedTarget.value;
  props.socket.emit('submitMayorVote', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId: selectedTarget.value,
  });
}

function endVoting() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('hostFinalizeMayorVote', {
    roomCode: room.value.code,
    playerId: playerId.value,
  });
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>{{ t('mayor.title') }}</h2>
    <p>{{ t('mayor.description') }}</p>

    <template v-if="self?.alive">
      <template v-if="hasVoted">
        <p v-if="yourVote === null" style="color: #4ade80">
          {{ t('mayor.voteSubmittedAbstain') }}
        </p>
        <p v-else style="color: #4ade80">
          {{
            t('mayor.voteSubmittedPlayer', { name: yourVote ? getPlayerName(room, yourVote) : '' })
          }}
        </p>
        <small v-if="showVoteProgress">{{
          t('common.votesSubmitted', { submitted, required })
        }}</small>
      </template>
      <template v-else>
        <form id="mayor-vote-form" class="actions" @submit.prevent="submitVote">
          <p v-if="isRevote">{{ t('mayor.revote') }}</p>
          <label>
            <span>{{ t('mayor.chooseMayor') }}</span>
            <select v-model="selectedTarget" name="target" required @change="onSelectChange">
              <option value="">{{ t('common.selectPlayer') }}</option>
              <option v-for="player in eligible" :key="player.id" :value="player.id">
                {{ player.name }}
              </option>
            </select>
          </label>
          <button id="mayor-vote-submit" type="submit" :disabled="!selectedTarget">
            {{ t('common.submitVote') }}
          </button>
          <small v-if="showVoteProgress">{{
            t('common.votesSubmitted', { submitted, required })
          }}</small>
        </form>
      </template>
    </template>
    <p v-else>{{ t('mayor.deadCannotVote') }}</p>

    <div v-if="isHost" class="actions host-actions">
      <button id="end-mayor-vote-btn" type="button" @click="endVoting">
        {{ t('mayor.endVoting') }}
      </button>
    </div>
  </section>
</template>
