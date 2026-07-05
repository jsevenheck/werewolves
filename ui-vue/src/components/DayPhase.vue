<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
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
const { t, localizeMessage, roleName } = useGameI18n();
const { room, playerId, pendingVote } = storeToRefs(store);

const selectedTarget = ref('');

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === playerId.value);
const lastNightDeaths = computed(() => room.value?.lastNightDeaths ?? []);
const dayVoteResolved = computed(() => room.value?.dayVoteResolved ?? false);
const lastDayDeaths = computed(() => room.value?.lastDayDeaths ?? []);
const lastDayMessage = computed(() =>
  room.value
    ? localizeMessage(room.value.lastDayMessageI18n, room.value.lastDayMessage ?? '')
    : null
);
const awaitingActions = computed(() => {
  return !!room.value?.awaitingHunterShot || !!room.value?.awaitingMayorSelection;
});
const yourVote = computed(() => room.value?.voteState?.yourVote);
const hasVoted = computed(() => yourVote.value !== undefined);
const submitted = computed(() => room.value?.voteState?.submitted || 0);
const required = computed(() => room.value?.voteState?.required || 0);
const isRevote = computed(() => !!room.value?.voteState?.revoteFromTie);
const showVoteProgress = computed(() => required.value > 0 && submitted.value < required.value);

// Discussion period: voting is locked until the configured timer elapses.
const now = ref(Date.now());
let discussionTick: number | null = null;
onMounted(() => {
  discussionTick = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => {
  if (discussionTick !== null) {
    clearInterval(discussionTick);
    discussionTick = null;
  }
});
const discussionEndsAt = computed(() => room.value?.discussionEndsAt ?? null);
const discussionActive = computed(
  () => discussionEndsAt.value !== null && now.value < discussionEndsAt.value
);
const discussionSecondsLeft = computed(() =>
  discussionEndsAt.value ? Math.max(0, Math.ceil((discussionEndsAt.value - now.value) / 1000)) : 0
);
const votingEnabled = computed(() => !discussionActive.value);

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
  store.pendingVote = selected === '__abstain__' ? null : selected || null;
}

function submitVote() {
  if (!room.value || !playerId.value) {
    notify(t('notifications.unableSubmitMissing'));
    return;
  }
  const normalized = selectedTarget.value === '__abstain__' ? null : selectedTarget.value || null;
  store.pendingVote = normalized;
  props.socket.emit('submitDayVote', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId: normalized,
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
    <h2>{{ t('day.title', { count: room.dayCount }) }}</h2>

    <h3>{{ t('day.nightReport') }}</h3>
    <template v-if="lastNightDeaths.length">
      <ul>
        <li v-for="(entry, i) in lastNightDeaths" :key="i">
          {{ entry.name }} ({{ roleName(entry.role || 'villager') }})
        </li>
      </ul>
    </template>
    <p v-else>{{ t('day.noNightDeaths') }}</p>

    <h3>{{ t('day.voteToEliminate') }}</h3>
    <p v-if="discussionActive" style="color: #fbbf24; font-weight: 600">
      {{ t('day.discussionActive', { seconds: discussionSecondsLeft }) }}
    </p>
    <template v-if="self?.alive">
      <template v-if="hasVoted">
        <p v-if="yourVote === null" style="color: #4ade80">
          {{ t('day.voteSubmittedAbstain') }}
        </p>
        <p v-else style="color: #4ade80">
          {{
            t('day.voteSubmittedPlayer', {
              name: yourVote ? getPlayerName(room, yourVote, t('common.unknown')) : '',
            })
          }}
        </p>
        <small v-if="showVoteProgress">{{
          t('common.votesSubmitted', { submitted, required })
        }}</small>
      </template>
      <template v-else-if="votingEnabled">
        <form id="vote-form" class="actions" @submit.prevent="submitVote">
          <p v-if="isRevote">{{ t('day.revote') }}</p>
          <label>
            <span>{{ t('day.chooseEliminate') }}</span>
            <select v-model="selectedTarget" name="target" required @change="onSelectChange">
              <option value="">{{ t('common.selectPlayer') }}</option>
              <option value="__abstain__" :selected="pendingVote === null">
                {{ t('common.abstain') }}
              </option>
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
          <button id="vote-submit" type="submit" :disabled="!selectedTarget">
            {{ t('common.submitVote') }}
          </button>
          <small v-if="showVoteProgress">{{
            t('common.votesSubmitted', { submitted, required })
          }}</small>
        </form>
      </template>
      <p v-else style="color: #fbbf24">{{ t('day.discussionHint') }}</p>
    </template>
    <p v-else>{{ t('day.deadCannotVote') }}</p>

    <!-- Vote resolved state - show result and wait for host to proceed -->
    <template v-if="dayVoteResolved">
      <div class="vote-result">
        <template v-if="lastDayDeaths.length">
          <p v-for="(death, i) in lastDayDeaths" :key="i">
            {{
              t('day.eliminated', { name: death.name, role: roleName(death.role || 'villager') })
            }}
          </p>
        </template>
        <p v-else-if="lastDayMessage">{{ lastDayMessage }}</p>
      </div>
    </template>

    <div v-if="isHost" class="actions host-actions">
      <button
        v-if="!dayVoteResolved && votingEnabled"
        id="end-vote-btn"
        type="button"
        @click="endVoting"
      >
        {{ t('day.endVoting') }}
      </button>
      <button
        v-if="dayVoteResolved && !awaitingActions"
        id="proceed-to-night-btn"
        type="button"
        @click="proceedToNight"
      >
        {{ t('day.proceedToNight') }}
      </button>
    </div>
  </section>
</template>
