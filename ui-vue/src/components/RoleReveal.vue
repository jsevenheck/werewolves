<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
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
const { t, localizeError } = useGameI18n();
const { room, playerId } = storeToRefs(store);

import { ROLE_DETAILS } from '../utils/roleDetails';

const READY_ACK_TIMEOUT_MS = 10000;

const players = computed(() => room.value?.players ?? []);
const self = computed(() => players.value.find((p) => p.id === playerId.value) || null);
const selfRole = computed(() => self.value?.role || null);
const info = computed(() => (selfRole.value ? ROLE_DETAILS[selfRole.value] : null));
const readyCount = computed(() => players.value.filter((p) => p.connected && p.ready).length);
const totalCount = computed(() => players.value.filter((p) => p.connected).length);
const isSelfReady = computed(() => self.value?.ready ?? false);
const isHost = computed(() => room.value?.hostId === playerId.value);
const allReady = computed(() => readyCount.value === totalCount.value);

let readyButtonTimeout: number | null = null;
const readyDisabled = ref(false);

onBeforeUnmount(() => {
  if (readyButtonTimeout) {
    clearTimeout(readyButtonTimeout);
  }
});

function markReady() {
  if (readyDisabled.value || !playerId.value || !room.value) return;
  readyDisabled.value = true;

  readyButtonTimeout = window.setTimeout(() => {
    if (readyDisabled.value) {
      readyDisabled.value = false;
      notify(t('roleReveal.markReadyFailed'));
    }
    readyButtonTimeout = null;
  }, READY_ACK_TIMEOUT_MS);

  props.socket.emit('markReady', { roomCode: room.value.code, playerId: playerId.value }, (res) => {
    if (readyButtonTimeout) {
      clearTimeout(readyButtonTimeout);
      readyButtonTimeout = null;
    }
    if (res && 'error' in res && res.error) {
      notify(localizeError(res));
      readyDisabled.value = false;
    }
  });
}

function continueAfterReveal() {
  if (!playerId.value || !room.value) return;
  props.socket.emit('continueAfterReveal', { roomCode: room.value.code, playerId: playerId.value });
}
</script>

<template>
  <section v-if="room" class="panel">
    <h2>{{ t('roleReveal.title') }}</h2>
    <p v-if="info">{{ t('roleReveal.hint') }}</p>
    <p v-else>{{ t('roleReveal.waitingAssignment') }}</p>

    <template v-if="isHost && !isSelfReady">
      <button id="ready-btn" :disabled="readyDisabled" @click="markReady">
        {{ t('common.ready') }}
      </button>
    </template>
    <template v-else-if="isHost">
      <button id="continue-btn" :disabled="!allReady" @click="continueAfterReveal">
        {{ t('common.continue') }}
      </button>
    </template>
    <template v-else-if="!isSelfReady">
      <button id="ready-btn" :disabled="readyDisabled" @click="markReady">
        {{ t('common.ready') }}
      </button>
    </template>
    <p v-else style="color: #4ade80">{{ t('roleReveal.readyStatus') }}</p>

    <p>{{ t('roleReveal.playersReady', { ready: readyCount, total: totalCount }) }}</p>
  </section>
</template>
