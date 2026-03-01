<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import type { TypedSocket } from '../../composables/useSocket';

interface Props {
  socket?: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerId } = storeToRefs(store);
const logsContainer = ref<HTMLElement | null>(null);
const confirmingClose = ref(false);

const logs = computed(() => room.value?.logs || []);
const isHost = computed(() => room.value?.hostId === playerId.value);

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

watch(logs, () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    }
  });
});

function closeSession() {
  if (!props.socket || !room.value || !playerId.value) return;
  props.socket.emit('closeSession', { roomCode: room.value.code, playerId: playerId.value });
  confirmingClose.value = false;
}
</script>

<template>
  <section v-if="room" id="logs-panel" class="panel">
    <h2>Events</h2>
    <div ref="logsContainer" class="logs">
      <template v-if="logs.length">
        <div v-for="(log, i) in logs" :key="i">{{ formatTime(log.ts) }} - {{ log.text }}</div>
      </template>
      <p v-else>No events yet.</p>
    </div>

    <template v-if="isHost && socket">
      <div v-if="!confirmingClose" style="margin-top: 1rem">
        <button
          type="button"
          style="
            width: 100%;
            background: transparent;
            border: 1px solid #ef4444;
            color: #ef4444;
            font-size: 0.85rem;
            opacity: 0.7;
          "
          @click="confirmingClose = true"
        >
          Close Session
        </button>
      </div>
      <div
        v-else
        style="
          margin-top: 1rem;
          border: 1px solid #ef4444;
          border-radius: 10px;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        "
      >
        <p style="margin: 0; font-size: 0.875rem; color: #fca5a5">
          This ends the session for <strong>all players</strong> and cannot be undone.
        </p>
        <div style="display: flex; gap: 0.5rem">
          <button
            type="button"
            style="
              flex: 1;
              background: #ef4444;
              border-color: #ef4444;
              color: #fff;
              font-weight: 600;
            "
            @click="closeSession"
          >
            Yes, close
          </button>
          <button
            type="button"
            style="flex: 1; font-size: 0.85rem"
            @click="confirmingClose = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
