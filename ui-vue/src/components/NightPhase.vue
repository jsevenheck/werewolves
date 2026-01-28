<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';
import { getPlayerName, escapeHtml, notify } from '@/utils/helpers';
import { NIGHT_DELAY_MS } from '@shared/constants';
import type { TypedSocket } from '@/composables/useSocket';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerId, pendingWolfVote } = storeToRefs(store);

const wolfTarget = ref('');
const seerTarget = ref('');
const poisonTarget = ref('');

const self = computed(() => room.value?.self || null);
const isHost = computed(() => room.value?.hostId === playerId.value);
const stepLabel = computed(() => room.value?.phaseStep?.toUpperCase() || 'NIGHT');
const isTransition = computed(() => room.value?.phaseStep === 'transition');
const nextLabel = computed(() => room.value?.nextNightStep?.toUpperCase() || '...');
const durationSeconds = computed(() => Math.round(NIGHT_DELAY_MS / 1000));

// Wolf form
const isWolf = computed(() => room.value?.phaseStep === 'wolves' && self.value?.role === 'werewolf' && self.value.alive);
const wolfIds = computed(() => Object.keys(room.value?.wolfVotes || {}));
const votesCast = computed(() => Object.values(room.value?.wolfVotes || {}).filter((v) => v !== undefined && v !== null).length);
const aliveTargets = computed(() => (room.value?.players ?? []).filter((p) => p.alive && !wolfIds.value.includes(p.id)));
const currentWolfVote = computed(() => room.value?.wolfVotes?.[playerId.value]);
const wolfLocked = computed(() => currentWolfVote.value !== undefined && currentWolfVote.value !== null);
const selectedWolfVote = computed(() => wolfLocked.value ? currentWolfVote.value : pendingWolfVote.value);
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
const isSeer = computed(() => room.value?.phaseStep === 'seer' && self.value?.role === 'seer' && self.value.alive);
const seerTargets = computed(() => (room.value?.players ?? []).filter((p) => p.alive && p.id !== playerId.value));
const seerResult = computed(() => room.value?.seerResult || null);

// Witch form
const isWitch = computed(() => room.value?.phaseStep === 'witch' && self.value?.role === 'witch' && self.value.alive);
const witchState = computed(() => room.value?.witchState ?? { healAvailable: false, poisonAvailable: false });
const witchWolfTarget = computed(() => room.value?.wolfTarget || null);
const healedText = computed(() => witchWolfTarget.value && room.value ? `Wolves targeted ${getPlayerName(room.value, witchWolfTarget.value)}.` : 'Wolves have no target.');
const aliveWitchTargets = computed(() => (room.value?.players ?? []).filter((p) => p && p.alive && p.id !== playerId.value));
const skipLabel = computed(() => !witchState.value.healAvailable ? 'Continue' : 'Skip');

const showHostSkip = computed(() => isHost.value && ['wolves', 'seer', 'witch', 'transition'].includes(room.value?.phaseStep || ''));

function onWolfSelectChange() {
  store.pendingWolfVote = wolfTarget.value || undefined;
}

function submitWolfVote() {
  if (!wolfTarget.value || !playerId.value || !room.value) return;
  store.pendingWolfVote = undefined;
  props.socket.emit('submitWolfVote', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId: wolfTarget.value
  });
}

function submitSeerInspect() {
  if (!seerTarget.value || !playerId.value || !room.value) return;
  props.socket.emit('submitSeerInspect', {
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId: seerTarget.value
  }, (res) => {
    if (res && 'error' in res && res.error) {
      notify(`Error: ${res.error}`);
    }
  });
}

function healTarget() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('submitWitchDecision', { roomCode: room.value.code, playerId: playerId.value, action: 'heal' });
}

function poisonSubmit() {
  if (!poisonTarget.value || !playerId.value || !room.value) return;
  props.socket.emit('submitWitchDecision', { roomCode: room.value.code, playerId: playerId.value, action: 'poison', targetId: poisonTarget.value });
}

function skipWitch() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('submitWitchDecision', { roomCode: room.value.code, playerId: playerId.value, action: 'skip' });
}

function skipStep() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('hostSkipStep', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>Night Phase - {{ stepLabel }}</h2>

    <!-- Transition state -->
    <template v-if="isTransition">
      <p>Transitioning... next: {{ nextLabel }}.</p>
      <p>Duration: {{ durationSeconds }}s.</p>
    </template>

    <!-- Wolf form -->
    <template v-else-if="isWolf">
      <form id="wolf-form" class="actions" @submit.prevent="submitWolfVote">
        <p v-if="wolfPeers.length">Other wolves: {{ wolfPeers.join(', ') }}</p>
        <p v-if="Object.keys(targetVoteCounts).length">
          Wolf votes:
          <template v-for="(count, targetId) in targetVoteCounts" :key="targetId">
            {{ getPlayerName(room, targetId as string) }} ({{ count }} vote{{ count > 1 ? 's' : '' }}){{ ' ' }}
          </template>
        </p>
        <template v-if="wolfLocked">
          <p style="color:#4ade80;">
            Vote submitted{{ currentWolfVote ? `: ${getPlayerName(room, currentWolfVote)}` : '' }}. Awaiting other wolves.
          </p>
        </template>
        <template v-else>
          <label>
            <span>Select a victim</span>
            <select
              v-model="wolfTarget"
              name="target"
              required
              @change="onWolfSelectChange"
            >
              <option value="">Pick target</option>
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
          <button type="submit">Submit vote</button>
        </template>
        <small>{{ votesCast }} / {{ wolfIds.length || 1 }} votes submitted.</small>
      </form>
    </template>

    <!-- Seer form -->
    <template v-else-if="isSeer">
      <form id="seer-form" class="actions" @submit.prevent="submitSeerInspect">
        <label>
          <span>Inspect someone</span>
          <select v-model="seerTarget" name="target" required>
            <option value="">Select target</option>
            <option v-for="player in seerTargets" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <button type="submit">Reveal alignment</button>
        <p v-if="seerResult">Last vision: {{ seerResult.name }} is {{ seerResult.result }}.</p>
      </form>
    </template>

    <!-- Witch form -->
    <template v-else-if="isWitch">
      <div class="actions">
        <p>{{ healedText }}</p>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;">
          <button type="button" id="heal-btn" :disabled="!witchState.healAvailable || !witchWolfTarget" @click="healTarget">
            Use heal potion
          </button>
          <div style="flex:1;min-width:220px;">
            <label>
              <span>Poison target</span>
              <select id="poison-select" v-model="poisonTarget" :disabled="!witchState.poisonAvailable">
                <option value="">Choose player</option>
                <option v-for="player in aliveWitchTargets" :key="player.id" :value="player.id">
                  {{ player.name }}
                </option>
              </select>
            </label>
          </div>
          <button type="button" id="poison-btn" :disabled="!witchState.poisonAvailable" @click="poisonSubmit">
            Use poison
          </button>
        </div>
        <button type="button" id="skip-witch" @click="skipWitch">{{ skipLabel }}</button>
      </div>
    </template>

    <!-- Alive but not active role -->
    <template v-else-if="self?.alive">
      <p>You sleep peacefully.</p>
    </template>

    <!-- Dead spectator -->
    <template v-else>
      <p>You are dead. Spectating only.</p>
    </template>

    <div v-if="showHostSkip" class="actions host-actions">
      <button id="skip-step" type="button" @click="skipStep">Skip current action</button>
    </div>
  </section>
</template>
