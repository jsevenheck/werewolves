<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { getPlayerName, notify } from '../utils/helpers';
import { useGameI18n } from '../composables/useGameI18n';
import { NIGHT_DELAY_MS } from '@shared/constants';
import type { TypedSocket } from '../composables/useSocket';
import SeerResultOverlay from './overlays/SeerResultOverlay.vue';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { t, localizeError, nightStepName, seerResultLabel } = useGameI18n();
const { room, playerId, pendingWolfVote } = storeToRefs(store);

const wolfTarget = ref('');
const seerTarget = ref('');
const pendingSeerResult = ref<{ name: string; result: string } | null>(null);
const poisonTarget = ref('');
const guardTarget = ref('');
const harlotTarget = ref('');
const witchActionTaken = ref(false);

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === playerId.value);
const stepLabel = computed(() => nightStepName(room.value?.phaseStep));
const isTransition = computed(() => room.value?.phaseStep === 'transition');
const nextLabel = computed(() =>
  room.value?.nextNightStep ? nightStepName(room.value.nextNightStep) : t('nightSteps.nextUnknown')
);
const durationSeconds = computed(() => Math.round(NIGHT_DELAY_MS / 1000));

// Wolf form
const isWolf = computed(
  () => room.value?.phaseStep === 'wolves' && self.value?.role === 'werewolf' && self.value.alive
);
const wolfIds = computed(() => room.value?.wolfIds || []);
const votesCast = computed(
  () =>
    Object.values(room.value?.wolfVotes || {}).filter((v) => v !== undefined && v !== null).length
);
const aliveTargets = computed(() =>
  (room.value?.players ?? []).filter((p) => p.alive && !wolfIds.value.includes(p.id))
);
const currentWolfVote = computed(() => room.value?.wolfVotes?.[playerId.value]);
const wolfLocked = computed(
  () => currentWolfVote.value !== undefined && currentWolfVote.value !== null
);
const selectedWolfVote = computed(() =>
  wolfLocked.value ? currentWolfVote.value : pendingWolfVote.value
);
const wolfPeers = computed(() => room.value?.wolfPeers || []);
const targetVoteCounts = computed(() => {
  const entries = Object.entries(room.value?.wolfVotes || {}).filter(([, targetId]) => targetId);
  return entries.reduce<Record<string, number>>((acc, [, targetId]) => {
    if (!targetId) return acc;
    acc[targetId] = (acc[targetId] || 0) + 1;
    return acc;
  }, {});
});

// Seer form
const isSeer = computed(
  () => room.value?.phaseStep === 'seer' && self.value?.role === 'seer' && self.value.alive
);
const seerTargets = computed(() =>
  (room.value?.players ?? []).filter((p) => p.alive && p.id !== playerId.value)
);
const seerResult = computed(() => room.value?.seerResult || null);

// Witch form
const isWitch = computed(
  () => room.value?.phaseStep === 'witch' && self.value?.role === 'witch' && self.value.alive
);
const witchState = computed(
  () => room.value?.witchState ?? { healAvailable: false, poisonAvailable: false }
);
const witchWolfTarget = computed(() => room.value?.wolfTarget || null);
const healedText = computed(() =>
  witchWolfTarget.value && room.value
    ? t('night.wolvesTargeted', {
        name: getPlayerName(room.value, witchWolfTarget.value, t('common.unknown')),
      })
    : t('night.wolvesNoTarget')
);
const aliveWitchTargets = computed(() =>
  (room.value?.players ?? []).filter((p) => p && p.alive && p.id !== playerId.value)
);
const skipLabel = computed(() => (witchActionTaken.value ? t('common.continue') : t('night.skip')));

// Guard form
const isGuard = computed(
  () => room.value?.phaseStep === 'guard' && self.value?.role === 'guard' && self.value.alive
);
const lastGuardedTarget = computed(() => room.value?.lastGuardedTarget || null);
const guardTargets = computed(() =>
  (room.value?.players ?? []).filter(
    (p) => p.alive && p.id !== playerId.value && p.id !== lastGuardedTarget.value
  )
);
const lastProtectedName = computed(() =>
  lastGuardedTarget.value && room.value
    ? getPlayerName(room.value, lastGuardedTarget.value, t('common.unknown'))
    : null
);

// Harlot form
const isHarlot = computed(
  () => room.value?.phaseStep === 'harlot' && self.value?.role === 'harlot' && self.value.alive
);
const harlotTargets = computed(() =>
  (room.value?.players ?? []).filter((p) => p.alive && p.id !== playerId.value)
);

const showHostSkip = computed(
  () =>
    isHost.value &&
    ['wolves', 'seer', 'witch', 'guard', 'harlot', 'transition'].includes(
      room.value?.phaseStep || ''
    )
);

function onWolfSelectChange() {
  store.pendingWolfVote = wolfTarget.value || undefined;
}

function formatWolfVoteEntry(name: string, count: number) {
  return t(count === 1 ? 'night.wolfVoteEntry' : 'night.wolfVoteEntryPlural', { name, count });
}

function submitWolfVote() {
  if (!wolfTarget.value || !playerId.value || !room.value) return;
  store.pendingWolfVote = undefined;
  props.socket.emit('submitWolfVote', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId: wolfTarget.value,
  });
}

function submitSeerInspect() {
  if (!seerTarget.value || !playerId.value || !room.value) return;
  props.socket.emit(
    'submitSeerInspect',
    {
      roomCode: room.value.code,
      playerId: playerId.value,
      targetId: seerTarget.value,
    },
    (res) => {
      if (res && 'error' in res && res.error) {
        notify(localizeError(res));
      } else if (res && 'ok' in res && res.name && res.result) {
        pendingSeerResult.value = { name: res.name, result: res.result };
      }
    }
  );
}

function healTarget() {
  if (!playerId.value || !room.value) return;
  witchActionTaken.value = true;
  props.socket.emit('submitWitchDecision', {
    roomCode: room.value.code,
    playerId: playerId.value,
    action: 'heal',
  });
}

function poisonSubmit() {
  if (!poisonTarget.value || !playerId.value || !room.value) return;
  witchActionTaken.value = true;
  props.socket.emit('submitWitchDecision', {
    roomCode: room.value.code,
    playerId: playerId.value,
    action: 'poison',
    targetId: poisonTarget.value,
  });
}

function skipWitch() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('submitWitchDecision', {
    roomCode: room.value.code,
    playerId: playerId.value,
    action: 'skip',
  });
}

function submitGuardProtection() {
  if (!guardTarget.value || !playerId.value || !room.value) return;
  props.socket.emit(
    'submitGuardProtection',
    {
      roomCode: room.value.code,
      playerId: playerId.value,
      targetId: guardTarget.value,
    },
    (res) => {
      if (res && 'error' in res && res.error) {
        notify(localizeError(res));
      }
    }
  );
}

function submitHarlotVisit() {
  if (!harlotTarget.value || !playerId.value || !room.value) return;
  props.socket.emit(
    'submitHarlotVisit',
    {
      roomCode: room.value.code,
      playerId: playerId.value,
      targetId: harlotTarget.value,
    },
    (res) => {
      if (res && 'error' in res && res.error) {
        notify(localizeError(res));
      }
    }
  );
}

function skipStep() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('hostSkipStep', { roomCode: room.value.code, playerId: playerId.value });
}

// Reset form state when each night step begins
watch(
  () => isWolf.value,
  (active) => {
    if (active) wolfTarget.value = '';
  }
);
watch(
  () => isSeer.value,
  (active) => {
    if (active) seerTarget.value = '';
  }
);
watch(
  () => isWitch.value,
  (active) => {
    if (active) {
      poisonTarget.value = '';
      witchActionTaken.value = false;
    }
  }
);
watch(
  () => isGuard.value,
  (active) => {
    if (active) guardTarget.value = '';
  }
);
watch(
  () => isHarlot.value,
  (active) => {
    if (active) harlotTarget.value = '';
  }
);
</script>

<template>
  <section v-if="room" class="panel">
    <h2>{{ t('night.title', { step: stepLabel }) }}</h2>

    <!-- Transition state -->
    <template v-if="isTransition">
      <p>{{ t('night.transitionNext', { step: nextLabel }) }}</p>
      <p>{{ t('app.transition.duration', { seconds: durationSeconds }) }}</p>
    </template>

    <!-- Wolf form -->
    <template v-else-if="isWolf">
      <form id="wolf-form" class="actions" @submit.prevent="submitWolfVote">
        <p v-if="wolfPeers.length">{{ t('night.otherWolves', { names: wolfPeers.join(', ') }) }}</p>
        <p v-if="Object.keys(targetVoteCounts).length">
          {{ t('night.wolfVotes') }}
          <template v-for="(count, targetId) in targetVoteCounts" :key="targetId">
            {{
              formatWolfVoteEntry(
                getPlayerName(room, targetId as string, t('common.unknown')),
                count
              )
            }}{{ ' ' }}
          </template>
        </p>
        <template v-if="wolfLocked">
          <p style="color: #4ade80">
            {{
              currentWolfVote
                ? t('night.voteSubmittedTarget', {
                    name: getPlayerName(room, currentWolfVote, t('common.unknown')),
                  })
                : t('night.voteSubmitted')
            }}
          </p>
        </template>
        <template v-else>
          <label>
            <span>{{ t('night.selectVictim') }}</span>
            <select v-model="wolfTarget" name="target" required @change="onWolfSelectChange">
              <option value="">{{ t('night.pickTarget') }}</option>
              <option
                v-for="player in aliveTargets"
                :key="player.id"
                :value="player.id"
                :selected="selectedWolfVote === player.id"
              >
                {{ player.name }}
              </option>
            </select>
          </label>
          <button type="submit">{{ t('common.submitVote') }}</button>
        </template>
        <small>{{
          t('common.votesSubmitted', { submitted: votesCast, required: wolfIds.length || 1 })
        }}</small>
      </form>
    </template>

    <!-- Seer form -->
    <template v-else-if="isSeer">
      <form id="seer-form" class="actions" @submit.prevent="submitSeerInspect">
        <label>
          <span>{{ t('night.inspectSomeone') }}</span>
          <select v-model="seerTarget" name="target" required>
            <option value="">{{ t('common.selectTarget') }}</option>
            <option v-for="player in seerTargets" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">{{ t('night.revealAlignment') }}</button>
        <p v-if="seerResult">
          {{
            t('night.lastVision', {
              name: seerResult.name,
              result: seerResultLabel(seerResult.result),
            })
          }}
        </p>
      </form>
    </template>

    <!-- Witch form -->
    <template v-else-if="isWitch">
      <div class="actions">
        <p>{{ healedText }}</p>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap">
          <button
            id="heal-btn"
            type="button"
            :disabled="!witchState.healAvailable || !witchWolfTarget"
            @click="healTarget"
          >
            {{ t('night.useHealPotion') }}
          </button>
          <div style="flex: 1; min-width: 220px">
            <label>
              <span>{{ t('night.poisonTarget') }}</span>
              <select
                id="poison-select"
                v-model="poisonTarget"
                :disabled="!witchState.poisonAvailable"
              >
                <option value="">{{ t('night.choosePlayer') }}</option>
                <option v-for="player in aliveWitchTargets" :key="player.id" :value="player.id">
                  {{ player.name }}
                </option>
              </select>
            </label>
          </div>
          <button
            id="poison-btn"
            type="button"
            :disabled="!witchState.poisonAvailable"
            @click="poisonSubmit"
          >
            {{ t('night.usePoison') }}
          </button>
        </div>
        <button id="skip-witch" type="button" @click="skipWitch">{{ skipLabel }}</button>
      </div>
    </template>

    <!-- Guard form -->
    <template v-else-if="isGuard">
      <form id="guard-form" class="actions" @submit.prevent="submitGuardProtection">
        <p v-if="lastProtectedName">
          {{ t('night.lastProtected', { name: lastProtectedName }) }}
        </p>
        <label>
          <span>{{ t('night.protectPlayer') }}</span>
          <select v-model="guardTarget" name="target" required>
            <option value="">{{ t('common.selectTarget') }}</option>
            <option v-for="player in guardTargets" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">{{ t('night.protect') }}</button>
      </form>
    </template>

    <!-- Harlot form -->
    <template v-else-if="isHarlot">
      <form id="harlot-form" class="actions" @submit.prevent="submitHarlotVisit">
        <p>{{ t('night.harlotPrompt') }}</p>
        <label>
          <span>{{ t('night.visitPlayer') }}</span>
          <select v-model="harlotTarget" name="target" required>
            <option value="">{{ t('common.selectTarget') }}</option>
            <option v-for="player in harlotTargets" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">{{ t('night.visit') }}</button>
      </form>
    </template>

    <!-- Alive but not active role -->
    <template v-else-if="self?.alive">
      <p>{{ t('night.sleepPeacefully') }}</p>
    </template>

    <!-- Dead spectator -->
    <template v-else>
      <p>{{ t('night.deadSpectating') }}</p>
    </template>

    <div v-if="showHostSkip" class="actions host-actions">
      <button id="skip-step" type="button" @click="skipStep">
        {{ t('night.skipCurrentAction') }}
      </button>
    </div>
  </section>

  <SeerResultOverlay
    v-if="pendingSeerResult"
    :socket="props.socket"
    :result="pendingSeerResult"
    @dismiss="pendingSeerResult = null"
  />
</template>
